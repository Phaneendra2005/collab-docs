export class SyncMetrics {
  static metrics = {
    totalOperations: 0,
    totalReplayTimeMs: 0,
    syncLatencyMs: 0,
    syncCount: 0,
    queueLength: 0,
    retryCount: 0,
    snapshotCreationTimeMs: 0,
    snapshotCount: 0,
  }

  static recordReplay(timeMs: number, opCount: number) {
    this.metrics.totalReplayTimeMs += timeMs
    this.metrics.totalOperations += opCount
  }

  static recordSync(latencyMs: number) {
    this.metrics.syncLatencyMs += latencyMs
    this.metrics.syncCount++
  }

  static recordSnapshot(timeMs: number) {
    this.metrics.snapshotCreationTimeMs += timeMs
    this.metrics.snapshotCount++
  }

  static recordRetry() {
    this.metrics.retryCount++
  }

  static updateQueueLength(length: number) {
    this.metrics.queueLength = length
  }

  static getAverageReplayTime(): number {
    return this.metrics.totalOperations === 0
      ? 0
      : this.metrics.totalReplayTimeMs / this.metrics.totalOperations
  }

  static getAverageSyncLatency(): number {
    return this.metrics.syncCount === 0 ? 0 : this.metrics.syncLatencyMs / this.metrics.syncCount
  }

  static getOperationsPerSecond(): number {
    return this.metrics.totalReplayTimeMs === 0
      ? 0
      : (this.metrics.totalOperations / this.metrics.totalReplayTimeMs) * 1000
  }
}
