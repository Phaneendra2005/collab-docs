import Dexie, { type Table } from 'dexie'
import { DocumentOperation, Snapshot, SyncState } from './types'

export class CollabDocsDatabase extends Dexie {
  operations!: Table<DocumentOperation, string>
  snapshots!: Table<Snapshot, string>
  metadata!: Table<{ key: string; value: any }, string>
  syncState!: Table<SyncState, [string, string]>

  constructor() {
    super('CollabDocsDB')

    this.version(2)
      .stores({
        operations: 'operationId, documentId, [documentId+lamportClock+actorId], createdAt',
        snapshots: 'snapshotId, documentId, [documentId+lamportClock]',
        metadata: 'key',
        syncState: '[documentId+actorId]',
      })
      .upgrade((tx) => {
        tx.table('pendingQueue')
          .clear()
          .catch(() => {})
        tx.table('failedOperations')
          .clear()
          .catch(() => {})
      })
  }
}

export const db = new CollabDocsDatabase()
