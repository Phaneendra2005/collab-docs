import { Server, Socket } from 'socket.io'
import {
  PresenceUpdateSchema,
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '../types/events'
import { MetricsService } from '../metrics/metrics.service'

const THROTTLE_MS = 100
const lastPresenceTime = new Map<string, number>()

export function registerPresenceHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
) {
  socket.on('presence:update', (payload) => {
    MetricsService.trackMessage()

    const parsed = PresenceUpdateSchema.safeParse(payload)
    if (!parsed.success) return

    const now = Date.now()
    const lastTime = lastPresenceTime.get(socket.id) || 0
    if (now - lastTime < THROTTLE_MS) {
      return // Drop packet to throttle
    }
    lastPresenceTime.set(socket.id, now)

    socket.to(parsed.data.documentId).emit('presence:broadcast', {
      actorId: socket.data.actorId,
      sessionId: socket.data.sessionId,
      color: socket.data.color,
      avatar: socket.data.avatar,
      cursor: parsed.data.cursor,
      selection: parsed.data.selection,
      isTyping: parsed.data.isTyping,
      lastActivity: Date.now(),
    })
  })

  socket.on('disconnect', () => {
    lastPresenceTime.delete(socket.id)
    const rooms = Array.from(socket.rooms)
    for (const room of rooms) {
      if (room !== socket.id) {
        socket.to(room).emit('presence:leave', socket.data.sessionId)
      }
    }
  })
}
