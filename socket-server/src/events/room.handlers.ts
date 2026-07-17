import { Server, Socket } from 'socket.io'
import {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '../types/events'
import { documentRoomCache, permissionCache } from '../services/cache.service'
import { InternalServiceClient } from '../services/internal.client'

export function registerRoomHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
) {
  socket.on('room:join', async (documentId, callback) => {
    try {
      const cacheKey = `${socket.data.userId}:${documentId}`
      let cachedRole = permissionCache.get(cacheKey)

      if (!cachedRole) {
        cachedRole = await InternalServiceClient.getDocumentRole(socket.data.userId, documentId)
        if (cachedRole) {
          permissionCache.set(cacheKey, cachedRole, 5 * 60 * 1000) // 5 min TTL
        }
      }

      socket.data.role = (cachedRole || 'VIEWER') as 'VIEWER' | 'EDITOR' | 'OWNER'

      socket.join(documentId)

      console.log('[ROOM JOIN]', socket.data.userId, documentId, socket.data.role)

      let activeUsers = documentRoomCache.get(documentId) || []
      // Prevent duplicates if reconnecting
      if (!activeUsers.some((u: any) => u.sessionId === socket.data.sessionId)) {
        activeUsers.push({
          actorId: socket.data.actorId,
          sessionId: socket.data.sessionId,
          color: socket.data.color,
          avatar: socket.data.avatar,
        })
        documentRoomCache.set(documentId, activeUsers, 24 * 60 * 60 * 1000) // 24h TTL
      }

      // Broadcast presence update
      socket.to(documentId).emit('room:joined', documentId, activeUsers)

      if (callback) callback({ success: true, timestamp: Date.now() })
    } catch (e) {
      if (callback)
        callback({ success: false, error: 'Failed to join room', timestamp: Date.now() })
    }
  })

  socket.on('disconnecting', () => {
    const rooms = Array.from(socket.rooms)
    for (const room of rooms) {
      if (room !== socket.id) {
        // Automatically destroy empty rooms / release memory
        let activeUsers = documentRoomCache.get(room) || []
        activeUsers = activeUsers.filter((u: any) => u.sessionId !== socket.data.sessionId)

        if (activeUsers.length === 0) {
          documentRoomCache.delete(room) // Free memory
        } else {
          documentRoomCache.set(room, activeUsers, 24 * 60 * 60 * 1000)
        }
      }
    }
  })
}
