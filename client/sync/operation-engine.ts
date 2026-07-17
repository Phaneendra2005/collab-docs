import { DocumentOperation } from './types'
import { SyncLogger } from './logger'
import { SyncMetrics } from './metrics'
import { hashOperation } from './hash'
import { DocumentOperationSchema } from '../../shared/types/operation'

export class OperationEngine {
  private buffer: Map<string, DocumentOperation> = new Map()
  private appliedOperations: Set<string> = new Set()

  constructor(public readonly documentId: string) {}

  sortOperations(operations: DocumentOperation[]): DocumentOperation[] {
    return operations.sort((a, b) => {
      if (a.lamportClock !== b.lamportClock) return a.lamportClock - b.lamportClock
      if (a.actorId !== b.actorId) return a.actorId.localeCompare(b.actorId)
      return a.operationId.localeCompare(b.operationId)
    })
  }

  hasAllParents(operation: DocumentOperation): boolean {
    if (!operation.parentOperationIds || operation.parentOperationIds.length === 0) return true
    return operation.parentOperationIds.every((id) => this.appliedOperations.has(id))
  }

  async verifyOperation(operation: DocumentOperation): Promise<boolean> {
    const baseObj = {
      operationId: operation.operationId,
      actorId: operation.actorId,
      documentId: operation.documentId,
      lamportClock: operation.lamportClock,
      parentOperationIds: operation.parentOperationIds,
      documentVersion: operation.documentVersion,
      operationType: operation.operationType,
      payload: operation.payload,
      createdAt: operation.createdAt,
      schemaVersion: operation.schemaVersion,
    }
    const expectedHash = await hashOperation(baseObj)
    return operation.operationHash === expectedHash
  }

  async receiveOperation(operation: DocumentOperation): Promise<DocumentOperation[]> {
    // 1. Validate Schema
    const parsed = DocumentOperationSchema.safeParse(operation)
    if (!parsed.success) {
      SyncLogger.error(
        `Malformed operation received (Invalid Schema): ${operation?.operationId || 'unknown'}`,
        parsed.error,
      )
      return []
    }

    // 2. Validate Hash
    const isValid = await this.verifyOperation(operation)
    if (!isValid) {
      SyncLogger.error(`Malformed operation received (Invalid Checksum): ${operation.operationId}`)
      return []
    }

    // 3. Check Duplicates (applied or buffered) safely without crashing
    if (
      this.appliedOperations.has(operation.operationId) ||
      this.buffer.has(operation.operationId)
    ) {
      console.log('[DEBUG] OperationEngine duplicate detected:', {
        operationId: operation.operationId,
      })
      SyncLogger.warn(`Duplicate operation safely ignored: ${operation.operationId}`)
      return []
    }

    // 4. Buffer the operation (wait until dependencies exist)
    this.buffer.set(operation.operationId, operation)

    // 5. Trigger Deterministic Drain
    return this.drainReadyOperations(operation.operationId)
  }

  private drainReadyOperations(incomingOpId?: string): DocumentOperation[] {
    const newlyApplied: DocumentOperation[] = []
    const t0 = performance.now()

    let madeProgress = true

    // Repeat until no additional buffered operations become ready
    while (madeProgress) {
      madeProgress = false

      // 1. Scan the entire waiting buffer
      // 2. Collect every buffered operation whose parents are now satisfied
      let readyOps: DocumentOperation[] = []
      for (const [opId, op] of this.buffer.entries()) {
        if (this.hasAllParents(op)) {
          readyOps.push(op)
        }
      }

      if (readyOps.length > 0) {
        // 3. Sort all ready operations deterministically
        readyOps = this.sortOperations(readyOps)

        // 4. Apply them sequentially
        for (const op of readyOps) {
          // Double check parents again in case a bug occurs, though strictly they should be ready
          if (this.hasAllParents(op)) {
            this.appliedOperations.add(op.operationId)
            this.buffer.delete(op.operationId)
            newlyApplied.push(op)
            madeProgress = true // We made progress, so we need to loop again
            SyncLogger.debug(`Applied operation: ${op.operationId}`)
          }
        }
      }
    }

    if (incomingOpId) {
      const incomingOp = this.appliedOperations.has(incomingOpId)
        ? newlyApplied.find((o) => o.operationId === incomingOpId) || null
        : this.buffer.get(incomingOpId) || null

      console.log('[DEBUG] OperationEngine.receiveOperation:', {
        incomingOperationId: incomingOpId,
        parentOperationIds: incomingOp?.parentOperationIds,
        pendingQueueSize: this.buffer.size,
        readyOpsCount: newlyApplied.length,
      })
    }

    if (newlyApplied.length > 0) {
      SyncMetrics.recordReplay(performance.now() - t0, newlyApplied.length)
    }

    return newlyApplied
  }

  getBufferedCount(): number {
    return this.buffer.size
  }

  reset(appliedIds: string[]) {
    this.buffer.clear()
    this.appliedOperations = new Set(appliedIds)
  }
}
