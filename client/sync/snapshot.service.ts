import { db } from './database'
import { SyncLogger } from './logger'
import { SyncMetrics } from './metrics'
import { CompressionService } from './compression'

export class SnapshotService {
  constructor(private documentId: string) {}

  /**
   * Adaptive snapshot creation based on conditions
   * Time Complexity: O(N) where N is number of operations in document state stringification
   * Space Complexity: O(S) where S is compressed size of snapshot state
   */
  async maybeCreateSnapshot(params: {
    isClosing?: boolean
    isManual?: boolean
    isIdle?: boolean
    currentOpCount: number
    currentLogSize: number
    snapshotState: any
    lamportClock: number
    documentVersion: number
    lastOperationId: string
  }) {
    const {
      isClosing,
      isManual,
      isIdle,
      currentOpCount,
      currentLogSize,
      snapshotState,
      lamportClock,
      documentVersion,
      lastOperationId,
    } = params

    if (
      isClosing ||
      isManual ||
      isIdle ||
      currentOpCount > 1000 ||
      currentLogSize > 5 * 1024 * 1024
    ) {
      SyncLogger.info(`Creating adaptive snapshot for document ${this.documentId}`)
      const t0 = performance.now()

      const payloadStr = JSON.stringify(snapshotState)
      const encoder = new TextEncoder()
      const compressed = await CompressionService.compress(encoder.encode(payloadStr))

      await db.snapshots.add({
        snapshotId: crypto.randomUUID(),
        documentId: this.documentId,
        lamportClock,
        documentVersion,
        lastOperationId,
        createdAt: Date.now(),
        data: compressed,
      })

      SyncMetrics.recordSnapshot(performance.now() - t0)
    }
  }
}
