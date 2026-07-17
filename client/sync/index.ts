import { EventEmitter } from 'events'
import { Step, Mapping, Transform } from '@tiptap/pm/transform'
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

  async applyLocalSteps(steps: Step[], docsBefore: Node[]) {
    if (steps.length === 0) return

    const stepsJson = steps.map((s) => s.toJSON())
    const op = await this.emitOperation(
      'UpdateMetadata',
      {
        key: 'tiptap_steps',
        value: JSON.stringify(stepsJson),
      },
      [],
    )

    for (let i = 0; i < steps.length; i++) {
      this.unconfirmedLocalSteps.push({
        operationId: op.operationId,
        step: steps[i],
        docBefore: docsBefore[i],
      })
    }

    return op
  }

  async emitOperation(type: DocumentOperation['operationType'], payload: any, parentIds: string[]) {
    const lamport = this.clock.increment()
    const opId = crypto.randomUUID()

    let sanitizedPayload = payload
    if (payload && typeof payload === 'object' && typeof payload.value === 'string') {
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

    this.sessionGeneratedOperationIds.add(opId)

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
      this.clock.merge(readyOp.lamportClock)

      if (
        readyOp.operationType === 'UpdateMetadata' &&
        (readyOp.payload as any).key === 'tiptap_steps'
      ) {
        console.log('[SYNC] Processing tiptap_steps')
        const remoteStepsJson = JSON.parse((readyOp.payload as any).value as string)
        const remoteSteps = remoteStepsJson.map((json: any) => Step.fromJSON(this.schema!, json))

        console.log('[REMOTE DOC BEFORE]', JSON.stringify(currentEditorDoc.toJSON(), null, 2))

        console.log('[REMOTE STEPS JSON]', JSON.stringify(remoteStepsJson, null, 2))

        // RECONCILIATION: OT Rebasing - Official ProseMirror Collab Algorithm
        // 1. Establish the clean original state (before unconfirmed local steps)
        const originalDoc =
          this.unconfirmedLocalSteps.length > 0
            ? this.unconfirmedLocalSteps[0].docBefore
            : currentEditorDoc

        // --- Phase A: Compute Local Steps Mapped Over Remote Steps (L') ---
        const trLocal = new Transform(originalDoc)
        const unconfirmed = this.unconfirmedLocalSteps

        // Invert local steps to rewind to OriginalDoc
        for (let i = unconfirmed.length - 1; i >= 0; i--) {
          trLocal.step(unconfirmed[i].step.invert(unconfirmed[i].docBefore))
        }

        // Apply remote steps to OriginalDoc
        const validRemoteSteps: Step[] = []
        const remoteDocs: Node[] = []
        for (const rStep of remoteSteps) {
          const docBefore = trLocal.doc
          const res = trLocal.maybeStep(rStep)
          if (res.doc) {
            remoteDocs.push(docBefore)
            validRemoteSteps.push(rStep)
          } else {
            SyncLogger.warn(`Remote step logic failed: ${res.failed}`)
          }
        }

        // Rebase local steps over remote steps (using prosemirror-collab setMirror logic)
        const newUnconfirmed: UnconfirmedStep[] = []
        for (let i = 0; i < unconfirmed.length; i++) {
          const u = unconfirmed[i]
          const inverseIndex = unconfirmed.length - 1 - i
          // Map through the transform excluding the local steps before it
          const mapped = u.step.map(trLocal.mapping.slice(inverseIndex + 1))

          if (mapped) {
            const docBefore = trLocal.doc
            if (trLocal.maybeStep(mapped).doc) {
              ;(trLocal.mapping as any).setMirror(inverseIndex, trLocal.steps.length - 1)
              newUnconfirmed.push({
                operationId: u.operationId,
                step: mapped,
                docBefore,
              })
            } else {
              SyncLogger.warn('Safely ignored mapped local step out of bounds.')
            }
          }
        }

        // --- Phase B: Compute Remote Steps Mapped Over Local Steps (R') ---
        // Symmetrically map remote steps over local steps to emit them to the editor.
        const trRemote = new Transform(originalDoc)

        // Invert valid remote steps to rewind to OriginalDoc
        for (let i = validRemoteSteps.length - 1; i >= 0; i--) {
          trRemote.step(validRemoteSteps[i].invert(remoteDocs[i]))
        }

        // Apply all original unconfirmed local steps
        for (const u of unconfirmed) {
          trRemote.maybeStep(u.step)
        }

        // Rebase remote steps over local steps
        const mappedRemoteSteps: Step[] = []
        for (let i = 0; i < validRemoteSteps.length; i++) {
          const r = validRemoteSteps[i]
          const inverseIndex = validRemoteSteps.length - 1 - i
          const mapped = r.map(trRemote.mapping.slice(inverseIndex + 1))

          if (mapped && trRemote.maybeStep(mapped).doc) {
            ;(trRemote.mapping as any).setMirror(inverseIndex, trRemote.steps.length - 1)
            mappedRemoteSteps.push(mapped)
          }
        }

        // Update tracking states
        this.unconfirmedLocalSteps = newUnconfirmed
        currentEditorDoc = trLocal.doc

        // Emit ONLY the final transformed remote transaction
        if (mappedRemoteSteps.length > 0) {
          console.log('[SYNC] Emitting apply-steps', mappedRemoteSteps.length)
          this.emit('apply-steps', mappedRemoteSteps)
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
