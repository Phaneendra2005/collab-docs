import { Server, Socket } from 'socket.io'
import {
  OperationSendSchema,
  SyncReconnectSchema,
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '../types/events'
import { MetricsService } from '../metrics/metrics.service'
import { InternalServiceClient } from '../services/internal.client'
import { SocketLogger } from '../logger/socket.logger'

// Batching queues per room
const broadcastQueues = new Map<string, any[]>()
const batchTimers = new Map<string, NodeJS.Timeout>()

export function registerOperationHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
) {
  socket.on('operation:send', async (payload, callback) => {
    MetricsService.trackMessage()

    const parsed = OperationSendSchema.safeParse(payload)
    if (!parsed.success) {
      if (callback)
        callback({ success: false, error: 'Invalid operation payload', timestamp: Date.now() })
      return
    }

    if (socket.data.role === 'VIEWER') {
      if (callback)
        callback({
          success: false,
          error: 'Unauthorized: Viewers cannot edit',
          timestamp: Date.now(),
        })
      return
    }

    const op = parsed.data

    // BROADCAST IMMEDIATELY (Pipeline A)
    socket.to(op.documentId).emit('operation:receive', op)

    // BATCH PERSISTENCE ASYNCHRONOUSLY (Pipeline B)
    let queue = broadcastQueues.get(op.documentId) || []
    queue.push(op)
    broadcastQueues.set(op.documentId, queue)

    if (!batchTimers.has(op.documentId)) {
      const timer = setTimeout(() => {
        const opsToPersist = broadcastQueues.get(op.documentId) || []
        broadcastQueues.delete(op.documentId)
        batchTimers.delete(op.documentId)

        if (opsToPersist.length > 0) {
          // Persist batch via internal API in the background without blocking
          InternalServiceClient.persistOperations(op.documentId, opsToPersist)
            .then((persisted) => {
              if (!persisted) {
                SocketLogger.error('Failed to persist operation batch via internal API', {
                  documentId: op.documentId,
                })
              }
            })
            .catch((err) => {
              SocketLogger.error('Error persisting operations', {
                error: err.message,
                documentId: op.documentId,
              })
            })
        }
      }, 500) // 500ms debounce for database save
      batchTimers.set(op.documentId, timer)
    }

    if (callback) callback({ success: true, timestamp: Date.now() })
  })

  socket.on('sync:reconnect', async (payload, callback) => {
    MetricsService.trackMessage()

    const parsed = SyncReconnectSchema.safeParse(payload)
    if (!parsed.success) {
      if (callback)
        callback(
          { success: false, error: 'Invalid reconnect payload', timestamp: Date.now() },
          undefined,
        )
      return
    }

    const missingOps = await InternalServiceClient.getMissingOperations(
      parsed.data.documentId,
      parsed.data.lastLamportClock,
    )

    if (callback) callback({ success: true, timestamp: Date.now() }, missingOps)
  })
}
