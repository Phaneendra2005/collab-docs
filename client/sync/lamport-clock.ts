export class LamportClock {
  private documentId: string
  private time: number

  constructor(documentId: string, initialTime: number = 0) {
    this.documentId = documentId
    this.time = initialTime
  }

  /**
   * Increments the logical clock by 1.
   * Time Complexity: O(1)
   * Space Complexity: O(1)
   */
  increment(): number {
    this.time += 1
    return this.time
  }

  /**
   * Merges a remote clock with the local clock.
   * Resolves to the maximum of the two clocks, plus 1.
   * Time Complexity: O(1)
   * Space Complexity: O(1)
   */
  merge(remoteTime: number): number {
    this.time = Math.max(this.time, remoteTime) + 1
    return this.time
  }

  /**
   * Gets the current logical time.
   * Time Complexity: O(1)
   */
  current(): number {
    return this.time
  }

  serialize(): string {
    return JSON.stringify({ documentId: this.documentId, time: this.time })
  }

  static deserialize(data: string): LamportClock {
    const parsed = JSON.parse(data)
    return new LamportClock(parsed.documentId, parsed.time)
  }
}
