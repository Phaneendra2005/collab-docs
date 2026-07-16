export const ROLES = {
  OWNER: 'OWNER',
  EDITOR: 'EDITOR',
  VIEWER: 'VIEWER',
} as const

export const PERMISSIONS = {
  READ: 'READ',
  WRITE: 'WRITE',
  DELETE: 'DELETE',
  INVITE: 'INVITE',
  RESTORE: 'RESTORE',
} as const

export const OPERATION_TYPES = {
  INSERT: 'INSERT',
  DELETE: 'DELETE',
  FORMAT: 'FORMAT',
  UPDATE_META: 'UPDATE_META',
} as const

export const SYNC_STATUS = {
  PENDING: 'PENDING',
  SYNCING: 'SYNCING',
  ACKED: 'ACKED',
  FAILED: 'FAILED',
} as const

export const SOCKET_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  SYNC_OPERATIONS: 'sync_operations',
  OPERATIONS_ACK: 'operations_ack',
  PRESENCE_UPDATE: 'presence_update',
  ERROR: 'error',
} as const
