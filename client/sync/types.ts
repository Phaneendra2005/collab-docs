import { DocumentOperation } from '../../shared/types/operation'

export type { DocumentOperation }

export interface Snapshot {
  snapshotId: string
  documentId: string
  lamportClock: number
  documentVersion: number
  lastOperationId: string
  createdAt: number
  data: Uint8Array // Compressed snapshot data
}

export interface SyncState {
  id?: number // For composite PK in dexie
  documentId: string
  actorId: string
  lastAckedLamport: number
  lastAckedOperationId: string
  updatedAt: number
}
