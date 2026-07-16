import { z } from 'zod'

// JWT Auth Handshake Schema
export const AuthPayloadSchema = z.object({
  token: z.string(),
  sessionId: z.string().optional(),
})

// Client -> Server Events
export const OperationSendSchema = z.object({
  operationId: z.string().uuid(),
  actorId: z.string().max(255),
  documentId: z.string().max(255),
  lamportClock: z.number().int().nonnegative(),
  parentOperationIds: z.array(z.string().uuid()).max(100),
  documentVersion: z.number().int(),
  operationType: z.enum([
    'InsertText',
    'DeleteText',
    'FormatText',
    'SplitBlock',
    'MergeBlock',
    'InsertNode',
    'DeleteNode',
    'UpdateMetadata',
  ]),
  payload: z
    .any()
    .refine((val) => JSON.stringify(val || {}).length < 5 * 1024 * 1024, {
      message: 'Payload too large (max 5MB)',
    }),
  checksum: z.string().max(512),
  operationHash: z.string().max(512),
  createdAt: z.number(),
  schemaVersion: z.number(),
})

export const PresenceUpdateSchema = z.object({
  documentId: z.string(),
  cursor: z.object({ x: z.number(), y: z.number(), line: z.number() }).nullable().optional(),
  selection: z.object({ start: z.number(), end: z.number() }).nullable().optional(),
  isTyping: z.boolean().optional(),
})

export const SyncReconnectSchema = z.object({
  documentId: z.string(),
  lastAckedOperationId: z.string().nullable(),
  lastLamportClock: z.number().int().nonnegative(),
})

// Acknowledgement Schemas
export const AckSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  timestamp: z.number(),
})

// Server -> Client Events (Types)
export type OperationReceiveType = z.infer<typeof OperationSendSchema>

export interface PresenceBroadcastType {
  actorId: string
  sessionId: string
  color: string
  avatar: string | null
  cursor?: { x: number; y: number; line: number } | null
  selection?: { start: number; end: number } | null
  isTyping?: boolean
  lastActivity: number
}

// Complete Type Mappings for Socket.IO
export interface ClientToServerEvents {
  'operation:send': (
    payload: z.infer<typeof OperationSendSchema>,
    callback: (ack: z.infer<typeof AckSchema>) => void,
  ) => void
  'presence:update': (payload: z.infer<typeof PresenceUpdateSchema>) => void
  'sync:reconnect': (
    payload: z.infer<typeof SyncReconnectSchema>,
    callback: (ack: z.infer<typeof AckSchema>, missingOps?: any[]) => void,
  ) => void
  'room:join': (documentId: string, callback: (ack: z.infer<typeof AckSchema>) => void) => void
}

export interface ServerToClientEvents {
  'operation:receive': (payload: OperationReceiveType) => void
  'presence:broadcast': (payload: PresenceBroadcastType) => void
  'presence:leave': (sessionId: string) => void
  'document:rename': (payload: { documentId: string; title: string }) => void
  'document:access_revoked': (payload: { documentId: string }) => void
  'document:role_changed': (payload: { documentId: string; role: string }) => void
  'dashboard:update_shared': (payload: {
    documentId: string
    action: string
    role?: string
  }) => void
  'document:collaborators_updated': (payload: { documentId: string }) => void
  'room:joined': (documentId: string, activeUsers: any[]) => void
  error: (message: string) => void

  // Comments
  'comment:created': (payload: any) => void
  'comment:updated': (payload: any) => void
  'comment:deleted': (payload: any) => void
  'comment:resolved': (payload: any) => void
  'comment:reopened': (payload: any) => void

  // Notifications
  'notification:created': (payload: any) => void
  'notification:read': (payload: any) => void
  'notification:deleted': (payload: any) => void
}

export interface InterServerEvents {
  ping: () => void
}

export interface SocketData {
  userId: string
  actorId: string
  role: 'VIEWER' | 'EDITOR' | 'OWNER'
  sessionId: string
  color: string
  avatar: string | null
}
