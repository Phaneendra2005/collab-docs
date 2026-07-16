import { ROLES, OPERATION_TYPES, SYNC_STATUS } from '../utils/constants'

export type Role = keyof typeof ROLES
export type OperationType = keyof typeof OPERATION_TYPES
export type SyncStatus = keyof typeof SYNC_STATUS

export interface BaseOperation {
  id: string
  documentId: string
  actorId: string
  lamport: number
  parentId: string | null
  type: OperationType
  payload: Record<string, unknown>
  createdAt: string
  syncStatus?: SyncStatus
}

export interface SyncPayload {
  documentId: string
  operations: BaseOperation[]
  lastSyncLamport: number
}

export interface DocumentSnapshot {
  id: string
  title: string
  content: Record<string, unknown> // TipTap JSON
  version: number
}

export interface PresenceInfo {
  userId: string
  documentId: string
  cursorPos: { from: number; to: number } | null
  isTyping: boolean
  lastSeen: string
}

export interface ApiResponse<T> {
  data?: T
  error?: string
  details?: unknown
}
