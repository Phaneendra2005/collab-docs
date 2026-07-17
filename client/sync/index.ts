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

        // RECONCILIATION: OT Rebasing
        let tempDoc = currentEditorDoc
        const invertedSteps: Step[] = []

        // 1. Invert local unconfirmed steps (in reverse order)
        for (let i = this.unconfirmedLocalSteps.length - 1; i >= 0; i--) {
          const u = this.unconfirmedLocalSteps[i]
          const inverted = u.step.invert(u.docBefore)
          invertedSteps.push(inverted)
          if (this.isStepValidForDoc(inverted, tempDoc)) {
            const res = inverted.apply(tempDoc)
            if (res.doc) tempDoc = res.doc
          } else {
            SyncLogger.warn('Inverted local step out of bounds, skipping inversion.')
          }
        }

        // 2. Apply remote steps to the clean state
        const validRemoteSteps: Step[] = []
        for (const rStep of remoteSteps) {
          if (!this.isStepValidForDoc(rStep, tempDoc)) {
            SyncLogger.warn(
              `Safely ignored incompatible remote step. Max size: ${tempDoc.content.size}`,
              rStep.toJSON(),
            )
            continue
          }
          const res = rStep.apply(tempDoc)
          if (res.doc) {
            tempDoc = res.doc
            validRemoteSteps.push(rStep)
          } else {
            SyncLogger.warn(`Remote step logic failed: ${res.failed}`)
          }
        }

        // 3. Re-apply local unconfirmed steps (mapped over remote)
        const newUnconfirmed: UnconfirmedStep[] = []
        const mappedLocalSteps: Step[] = []

        for (let i = 0; i < this.unconfirmedLocalSteps.length; i++) {
          const u = this.unconfirmedLocalSteps[i]

          const stepMapping = new Mapping()

          // 1. Invert previous local steps in reverse order (to get from OriginalDoc + L[0...i-1] to OriginalDoc)
          for (let j = i - 1; j >= 0; j--) {
            const prevU = this.unconfirmedLocalSteps[j]
            stepMapping.appendMap(prevU.step.invert(prevU.docBefore).getMap())
          }

          // 2. Apply remote steps (from OriginalDoc to OriginalDoc + R)
          validRemoteSteps.forEach((rs) => stepMapping.appendMap(rs.getMap()))

          // 3. Apply mapped local steps (from OriginalDoc + R to OriginalDoc + R + L'[0...i-1])
          mappedLocalSteps.forEach((mapped) => stepMapping.appendMap(mapped.getMap()))

          const mappedStep = u.step.map(stepMapping)
          if (mappedStep) {
            if (!this.isStepValidForDoc(mappedStep, tempDoc)) {
              SyncLogger.warn('Safely ignored mapped local step out of bounds.')
              continue
            }
            const docBefore = tempDoc
            const res = mappedStep.apply(tempDoc)
            if (res.doc) {
              tempDoc = res.doc
              newUnconfirmed.push({
                operationId: u.operationId,
                step: mappedStep,
                docBefore: docBefore,
              })
              mappedLocalSteps.push(mappedStep)
            }
          }
        }

        // Update tracking
        this.unconfirmedLocalSteps = newUnconfirmed
        currentEditorDoc = tempDoc

        // Emit single finalized operation array to Editor
        const finalizedSteps = [...invertedSteps, ...validRemoteSteps, ...mappedLocalSteps]
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
