import { EventEmitter } from 'events'
import { Step, Mapping } from '@tiptap/pm/transform'
import { Schema, Node } from '@tiptap/pm/model'
import { OperationEngine } from './operation-engine'
import { LamportClock } from './lamport-clock'
import { db } from './database'
import { DocumentOperation } from './types'
import { SyncLogger } from './logger'
import { hashOperation } from './hash'

export interface UnconfirmedStep {
  operationId: string
  step: Step
  docBefore: Node
}

// Payload keys that carry serialized ProseMirror/JSON structures rather than
// raw HTML. These must NEVER be run through the HTML sanitizer below, since
// mutating bytes inside a JSON-encoded step or document silently corrupts
// the OT stream in a way that produces no error, only divergence.
const NON_SANITIZABLE_PAYLOAD_KEYS = new Set(['tiptap_steps', 'content'])

/**
 * SyncEngine Facade
 * Provides the interface for the Editor to interact with the Local-First system.
 * Acts as the single source of truth for operation ordering and deterministic rebasing.
 */
export class SyncEngine extends EventEmitter {
  public engine: OperationEngine
  public clock: LamportClock
  private schema: Schema | null = null

  private unconfirmedLocalSteps: UnconfirmedStep[] = []
  private lastProcessedLamport: number = 0
  private lastProcessedOperationId: string | null = null
  public lastAckedOperationId: string | null = null
  private sessionGeneratedOperationIds = new Set<string>()

  constructor(
    public readonly documentId: string,
    public readonly actorId: string,
  ) {
    super()
    this.engine = new OperationEngine(documentId)
    this.clock = new LamportClock(documentId)

    if (typeof window !== 'undefined') {
      window.addEventListener('offline', this.handleOffline.bind(this))
    }
  }

  setSchema(schema: Schema) {
    this.schema = schema
  }

  async initialize() {
    SyncLogger.info(`Sync Engine initialized for doc ${this.documentId}`)
  }

  private handleOffline() {
    SyncLogger.warn('Browser went offline. Operating in local-first mode.')
  }

  private isStepValidForDoc(step: Step, doc: Node): boolean {
    const json = step.toJSON() as any
    const maxSize = doc.content.size

    if (typeof json.from === 'number' && (json.from < 0 || json.from > maxSize)) return false
    if (typeof json.to === 'number' && (json.to < 0 || json.to > maxSize)) return false
    if (typeof json.pos === 'number' && (json.pos < 0 || json.pos > maxSize)) return false

    return true
  }

  acknowledgeLocalOperation(operationId: string) {
    const beforeCount = this.unconfirmedLocalSteps.length

    this.unconfirmedLocalSteps = this.unconfirmedLocalSteps.filter(
      (u) => u.operationId !== operationId,
    )

    this.lastAckedOperationId = operationId

    console.log('[DEBUG] acknowledgeLocalOperation:', {
      operationIdAcknowledged: operationId,
      unconfirmedLocalStepsBeforeRemoval: beforeCount,
      unconfirmedLocalStepsAfterRemoval: this.unconfirmedLocalSteps.length,
      lastAckedOperationId: this.lastAckedOperationId,
    })
  }

  /**
   * FIX (Root Cause #1 - async race):
   * The operation's identity (lamport clock, operationId) is reserved and
   * unconfirmedLocalSteps is populated SYNCHRONOUSLY, before any `await`.
   * TipTap has already mutated the real editor doc by the time onUpdate
   * fires, so our bookkeeping must be updated in the same tick — otherwise
   * a remote operation arriving during the hashing/IndexedDB-write window
   * would rebase against a doc that is "ahead" of what unconfirmedLocalSteps
   * knows about, corrupting the OT rebase in receiveRemoteOperation.
   *
   * Only the persistence side effects (hashing, IndexedDB write, local
   * engine ingestion) remain asynchronous — those don't need to block
   * bookkeeping correctness, only the eventual ack/persist flow.
   */
  async applyLocalSteps(steps: Step[], docsBefore: Node[]) {
    if (steps.length === 0) return

    const stepsJson = steps.map((s) => s.toJSON())
    const parentIds = this.lastProcessedOperationId ? [this.lastProcessedOperationId] : []

    // --- SYNCHRONOUS SECTION: must not cross an `await` boundary ---
    const lamport = this.clock.increment()
    const opId = crypto.randomUUID()

    this.sessionGeneratedOperationIds.add(opId)
    this.lastProcessedOperationId = opId

    for (let i = 0; i < steps.length; i++) {
      this.unconfirmedLocalSteps.push({
        operationId: opId,
        step: steps[i],
        docBefore: docsBefore[i],
      })
    }

    console.log('[DEBUG] applyLocalSteps (bookkeeping committed synchronously):', {
      operationId: opId,
      actorId: this.actorId,
      lamportClock: lamport,
      parentOperationIds: parentIds,
      unconfirmedLocalStepsLength: this.unconfirmedLocalSteps.length,
      stepsJson: stepsJson,
    })
    // --- END SYNCHRONOUS SECTION ---

    const op = await this.finalizeOperation(
      opId,
      lamport,
      'UpdateMetadata',
      {
        key: 'tiptap_steps',
        value: JSON.stringify(stepsJson),
      },
      parentIds,
    )

    return op
  }

  /**
   * Generic operation emission (used for full-content snapshot saves and
   * restore operations, which don't touch unconfirmedLocalSteps).
   * Identity reservation is still synchronous for consistent lamport/parent
   * ordering relative to any concurrently in-flight applyLocalSteps call.
   */
  async emitOperation(type: DocumentOperation['operationType'], payload: any, parentIds: string[]) {
    const lamport = this.clock.increment()
    const opId = crypto.randomUUID()

    this.sessionGeneratedOperationIds.add(opId)
    this.lastProcessedOperationId = opId

    return this.finalizeOperation(opId, lamport, type, payload, parentIds)
  }

  /**
   * Shared async tail: sanitize (payload-aware), hash, persist locally,
   * and feed into the local OperationEngine buffer.
   */
  private async finalizeOperation(
    opId: string,
    lamport: number,
    type: DocumentOperation['operationType'],
    payload: any,
    parentIds: string[],
  ) {
    // FIX (Root Cause #3 - payload sanitization):
    // Only sanitize payloads that are NOT serialized OT step JSON or
    // serialized ProseMirror document JSON. Both `tiptap_steps` and
    // `content` values are JSON, not HTML — running an HTML sanitizer
    // regex over JSON text can rewrite arbitrary substrings inside the
    // user's actual content (e.g. text containing "javascript:" or an
    // `on...=` pattern), silently producing a different step/document
    // than what the local editor actually applied, causing permanent
    // cross-client divergence.
    let sanitizedPayload = payload
    const payloadKey = payload && typeof payload === 'object' ? payload.key : undefined
    const isSanitizable =
      payload &&
      typeof payload === 'object' &&
      typeof payload.value === 'string' &&
      !NON_SANITIZABLE_PAYLOAD_KEYS.has(payloadKey)

    if (isSanitizable) {
      let val = payload.value
      val = val.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      val = val.replace(/javascript:/gi, 'about:blank')
      val = val.replace(/on\w+="[^"]*"/gi, '')
      sanitizedPayload = { ...payload, value: val }
    }

    const baseObj = {
      operationId: opId,
      actorId: this.actorId,
      documentId: this.documentId,
      lamportClock: lamport,
      parentOperationIds: parentIds,
      documentVersion: 1,
      operationType: type,
      payload: sanitizedPayload,
      createdAt: Date.now(),
      schemaVersion: 1,
    }

    console.log('[DEBUG] finalizeOperation:', {
      operationId: opId,
      actorId: this.actorId,
      lamportClock: lamport,
      parentOperationIds: parentIds,
      timestamp: baseObj.createdAt,
    })

    const hash = await hashOperation(baseObj)

    const operation: DocumentOperation = Object.freeze({
      ...baseObj,
      checksum: hash,
      operationHash: hash,
    }) as DocumentOperation

    await db.operations.add(operation)
    this.engine.receiveOperation(operation)

    return operation
  }

  /**
   * FIX (Root Cause #2 - silent drop):
   * Public hook so callers (e.g. TipTapEditor's applyStepsToEditor) can
   * request a full resync when they detect corruption that this engine
   * itself couldn't recover from. Never let a failed step just vanish
   * without at least surfacing a recovery signal.
   */
  requestResync(reason: string) {
    SyncLogger.warn(`Resync requested: ${reason}`)
    this.emit('resync-required', { reason })
  }

  /**
   * Prepares internal state for a full-history replay (used by the
   * resync-required recovery flow in TipTapEditor). This intentionally
   * clears sessionGeneratedOperationIds too: during a full rebuild from
   * an empty/base doc, our own past operations must be replayed as real
   * steps rather than suppressed as "already applied" echoes, since the
   * editor content has just been wiped back to the base state.
   */
  prepareForFullResync() {
    this.unconfirmedLocalSteps = []
    this.lastProcessedLamport = 0
    this.lastProcessedOperationId = null
    this.sessionGeneratedOperationIds.clear()
    this.engine.reset([])
  }

  async receiveRemoteOperation(op: DocumentOperation, currentEditorDoc: Node) {
    if (!this.schema) {
      SyncLogger.warn('SyncEngine received remote operation before schema initialization.')
      return
    }

    // Acknowledge our own operations ONLY IF generated in this active session (live echo).
    // If it's a historical replay (page refresh), we MUST process it.
    if (op.actorId === this.actorId && this.sessionGeneratedOperationIds.has(op.operationId)) {
      this.unconfirmedLocalSteps = this.unconfirmedLocalSteps.filter(
        (u) => u.operationId !== op.operationId,
      )
      this.clock.merge(op.lamportClock)
      return
    }

    // Process through OperationEngine for parent dependencies and duplicate suppression
    const readyOps = await this.engine.receiveOperation(op)

    if (readyOps.length === 0) {
      console.log('[SYNC] readyOps = 0')
      return
    }

    console.log('[SYNC] readyOps =', readyOps)

    for (const readyOp of readyOps) {
      if (readyOp.lamportClock <= this.lastProcessedLamport) {
        continue
      }

      this.lastProcessedLamport = readyOp.lamportClock
      this.lastProcessedOperationId = readyOp.operationId
      this.clock.merge(readyOp.lamportClock)

      if (
        readyOp.operationType === 'UpdateMetadata' &&
        (readyOp.payload as any).key === 'tiptap_steps'
      ) {
        console.log('[SYNC] Processing tiptap_steps')
        const remoteStepsJson = JSON.parse((readyOp.payload as any).value as string)
        const remoteSteps = remoteStepsJson.map((json: any) => Step.fromJSON(this.schema!, json))

        console.log('[DEBUG] SyncEngine.receiveRemoteOperation:', {
          currentEditorDoc: currentEditorDoc.toJSON(),
          currentEditorDocSize: currentEditorDoc.content.size,
          remoteStepsJson: remoteStepsJson,
          unconfirmedLocalStepsBefore: this.unconfirmedLocalSteps.length,
        })

        console.log('[REMOTE DOC BEFORE]', JSON.stringify(currentEditorDoc.toJSON(), null, 2))
        console.log('[REMOTE STEPS JSON]', JSON.stringify(remoteStepsJson, null, 2))

        // RECONCILIATION: OT Rebasing
        let tempDoc = currentEditorDoc
        console.log('[DEBUG] tempDoc before:', tempDoc.content.size)
        const invertedSteps: Step[] = []
        let inversionFailed = false

        // 1. Invert local unconfirmed steps (in reverse order)
        for (let i = this.unconfirmedLocalSteps.length - 1; i >= 0; i--) {
          const u = this.unconfirmedLocalSteps[i]
          const inverted = u.step.invert(u.docBefore)
          invertedSteps.push(inverted)
          if (this.isStepValidForDoc(inverted, tempDoc)) {
            const res = inverted.apply(tempDoc)
            if (res.doc) {
              tempDoc = res.doc
            } else {
              // FIX (Root Cause #2): previously this branch silently left
              // tempDoc unrebased and continued as if nothing happened.
              // If we can't cleanly invert back to the base doc, any
              // further work in this reconciliation is unreliable — flag
              // for a full resync rather than risk applying remote steps
              // on top of a doc that doesn't actually represent the
              // pre-local-edit state.
              SyncLogger.warn('Local step inversion failed to apply cleanly.')
              inversionFailed = true
            }
          } else {
            SyncLogger.warn('Inverted local step out of bounds, skipping inversion.')
            inversionFailed = true
          }
        }

        if (inversionFailed) {
          this.requestResync('local step inversion failed during rebase')
          continue
        }

        // 2. Apply remote steps to the clean state
        const validRemoteSteps: Step[] = []
        let anyRemoteStepDropped = false
        for (const rStep of remoteSteps) {
          if (!this.isStepValidForDoc(rStep, tempDoc)) {
            SyncLogger.warn(
              `Safely ignored incompatible remote step. Max size: ${tempDoc.content.size}`,
              rStep.toJSON(),
            )
            anyRemoteStepDropped = true
            continue
          }
          const res = rStep.apply(tempDoc)
          if (res.doc) {
            tempDoc = res.doc
            validRemoteSteps.push(rStep)
          } else {
            // FIX (Root Cause #2): a dropped remote step means this
            // client's document is now permanently missing content that
            // exists elsewhere. Never let this pass silently — request a
            // full resync so the client rebuilds from the authoritative
            // operation history instead of drifting forever.
            SyncLogger.warn(`Remote step logic failed: ${res.failed}`)
            anyRemoteStepDropped = true
          }
        }

        if (anyRemoteStepDropped) {
          this.requestResync('remote step could not be applied (structural conflict)')
        }

        // 3. Re-apply local unconfirmed steps (mapped over remote)
        const newUnconfirmed: UnconfirmedStep[] = []
        const mappedLocalSteps: Step[] = []

        for (let i = 0; i < this.unconfirmedLocalSteps.length; i++) {
          const u = this.unconfirmedLocalSteps[i]

          const stepMapping = new Mapping()

          for (let j = i - 1; j >= 0; j--) {
            const prevU = this.unconfirmedLocalSteps[j]
            stepMapping.appendMap(prevU.step.invert(prevU.docBefore).getMap())
          }

          validRemoteSteps.forEach((rs) => stepMapping.appendMap(rs.getMap()))
          mappedLocalSteps.forEach((mapped) => stepMapping.appendMap(mapped.getMap()))

          const mappedStep = u.step.map(stepMapping)
          console.log('[DEBUG] mapped step result:', mappedStep ? mappedStep.toJSON() : null)
          if (mappedStep) {
            const isValid = this.isStepValidForDoc(mappedStep, tempDoc)
            console.log('[DEBUG] validation result:', isValid)
            if (!isValid) {
              SyncLogger.warn('Safely ignored mapped local step out of bounds.')
              // FIX (Root Cause #2): this local edit is now permanently
              // lost from the reconciled doc. Surface it — a resync will
              // at least bring the document to a consistent authoritative
              // state, rather than leaving this client silently missing
              // its own recent edit.
              this.requestResync('local step could not be remapped after remote update')
              continue
            }
            const docBefore = tempDoc
            const res = mappedStep.apply(tempDoc)
            console.log('[DEBUG] apply result:', !!res.doc)
            if (res.doc) {
              tempDoc = res.doc
              newUnconfirmed.push({
                operationId: u.operationId,
                step: mappedStep,
                docBefore: docBefore,
              })
              mappedLocalSteps.push(mappedStep)
            } else {
              this.requestResync('local step failed to apply after remapping')
            }
          }
        }

        console.log('[DEBUG] tempDoc after:', tempDoc.content.size)

        this.unconfirmedLocalSteps = newUnconfirmed
        console.log('[DEBUG] unconfirmedLocalSteps after:', this.unconfirmedLocalSteps.length)
        currentEditorDoc = tempDoc

        const finalizedSteps = [...invertedSteps, ...validRemoteSteps, ...mappedLocalSteps]

        console.log('[DEBUG] Before emit apply-steps:', {
          numberOfEmittedSteps: finalizedSteps.length,
          documentSizeAfter: tempDoc.content.size,
        })

        if (finalizedSteps.length > 0) {
          console.log('[SYNC] Emitting apply-steps', finalizedSteps.length)
          this.emit('apply-steps', finalizedSteps)
        }
      } else if (
        readyOp.operationType === 'UpdateMetadata' &&
        (readyOp.payload as any).key === 'content'
      ) {
        const content = JSON.parse((readyOp.payload as any).value as string)
        console.log('[SYNC] Emitting apply-content')

        this.emit('apply-content', content)
      }
    }
  }

  terminate() {
    this.removeAllListeners()
  }
}
