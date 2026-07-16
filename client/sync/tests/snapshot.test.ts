import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SnapshotService } from '../snapshot.service'
import { db } from '../database'
import { CompressionService } from '../compression'

vi.mock('../database', () => ({
  db: {
    snapshots: {
      add: vi.fn(),
    },
  },
}))

vi.mock('../compression', () => ({
  CompressionService: {
    compress: vi.fn(async (data: Uint8Array) => data),
    decompress: vi.fn(async (data: Uint8Array) => data),
  },
}))

describe('SnapshotService', () => {
  let snapshotManager: SnapshotService

  beforeEach(() => {
    snapshotManager = new SnapshotService('doc1')
    vi.clearAllMocks()
  })

  it('generates a snapshot correctly when isManual is true', async () => {
    await snapshotManager.maybeCreateSnapshot({
      isManual: true,
      currentOpCount: 1,
      currentLogSize: 1,
      snapshotState: { content: 'test' },
      lamportClock: 10,
      documentVersion: 2,
      lastOperationId: 'op1',
    })
    expect(db.snapshots.add).toHaveBeenCalled()
  })

  it('does not generate snapshot if conditions not met', async () => {
    await snapshotManager.maybeCreateSnapshot({
      currentOpCount: 1,
      currentLogSize: 1,
      snapshotState: { content: 'test' },
      lamportClock: 10,
      documentVersion: 2,
      lastOperationId: 'op1',
    })
    expect(db.snapshots.add).not.toHaveBeenCalled()
  })
})
