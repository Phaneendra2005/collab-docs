import { Server } from 'socket.io'
import { createServer } from 'http'
import express from 'express'
import { createAdapter } from '@socket.io/redis-adapter'
import { createClient } from 'redis'
import {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from './types/events'
import { authMiddleware } from './middlewares/auth.middleware'
import { permissionCache } from './services/cache.service'
import { registerPresenceHandlers } from './events/presence.handlers'
import { registerOperationHandlers } from './events/operation.handlers'
import { registerRoomHandlers } from './events/room.handlers'
import { MetricsService } from './metrics/metrics.service'
import { SocketLogger } from './logger/socket.logger'

const app = express()
const httpServer = createServer(app)

// API Endpoints
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }))
app.get('/metrics', (req, res) => res.status(200).json(MetricsService.getMetrics()))

// Parse JSON bodies
app.use(express.json())

export const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket'],
  maxHttpBufferSize: 1e6, // 1 MB limit for large payloads
  pingInterval: 25000,
  pingTimeout: 20000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
})

const pubClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' })
const subClient = pubClient.duplicate()

Promise.all([pubClient.connect(), subClient.connect()])
  .then(() => {
    io.adapter(createAdapter(pubClient, subClient))
    SocketLogger.info('Redis adapter connected')
  })
  .catch((err) => {
    SocketLogger.error('Redis connection failed, falling back to in-memory adapter', {
      error: err.message,
    })
  })

io.use(authMiddleware)

// Broadcast API endpoints
app.post('/api/broadcast/operations', (req, res) => {
  const { documentId, operations, senderId } = req.body
  const token = req.headers.authorization?.split(' ')[1]

  if (token !== (process.env.INTERNAL_SERVICE_TOKEN || 'dev-token')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (documentId && Array.isArray(operations)) {
    operations.forEach((op) => {
      io.to(documentId).emit('operation:receive', op)
    })
    SocketLogger.info(`Broadcasted ${operations.length} batched ops for doc ${documentId}`)
    return res.status(200).json({ success: true })
  }
  return res.status(400).json({ error: 'Missing required fields' })
})

app.post('/api/broadcast/rename', (req, res) => {
  const { documentId, title, userIds } = req.body
  const token = req.headers.authorization?.split(' ')[1]

  // Basic security to ensure it comes from our internal Next.js API
  if (token !== (process.env.INTERNAL_SERVICE_TOKEN || 'dev-token')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (documentId && title) {
    // Broadcast to everyone currently viewing the document
    io.to(documentId).emit('document:rename', { documentId, title })

    // Broadcast to global user rooms (e.g. for dashboard updates)
    if (Array.isArray(userIds)) {
      userIds.forEach((userId) => {
        io.to(`user:${userId}`).emit('document:rename', { documentId, title })
      })
    }

    SocketLogger.info(`Broadcasted rename for doc ${documentId}`)
    return res.status(200).json({ success: true })
  }
  return res.status(400).json({ error: 'Missing documentId or title' })
})

app.post('/api/broadcast/permissions', async (req, res) => {
  const { documentId, targetUserId, action, role } = req.body
  const token = req.headers.authorization?.split(' ')[1]

  if (token !== (process.env.INTERNAL_SERVICE_TOKEN || 'dev-token')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (documentId && targetUserId && action) {
    // 1. Invalidate Cache
    permissionCache.delete(`${targetUserId}:${documentId}`)

    // 2. Broadcast to active sockets for the specific user
    const userSockets = await io.in(`user:${targetUserId}`).fetchSockets()
    userSockets.forEach((socket) => {
      if (action === 'REMOVED') {
        // If removed, force leave the document room and notify client to redirect
        socket.leave(documentId)
        socket.emit('document:access_revoked', { documentId })
      } else if (action === 'ROLE_CHANGED' && role) {
        // If role changed, update socket internal state and notify client UI to update
        socket.data.role = role
        socket.emit('document:role_changed', { documentId, role })
      }
    })

    // 3. Broadcast to global user room so Dashboard instantly updates Shared with Me lists
    io.to(`user:${targetUserId}`).emit('dashboard:update_shared', { documentId, action, role })

    // 4. Broadcast to the document room so anyone with the Share Modal open sees the list refresh instantly
    io.to(documentId).emit('document:collaborators_updated', { documentId })

    SocketLogger.info(
      `Broadcasted permission change ${action} for doc ${documentId} user ${targetUserId}`,
    )
    return res.status(200).json({ success: true })
  }

  return res.status(400).json({ error: 'Missing required fields' })
})

app.post('/api/broadcast/comments', (req, res) => {
  const { documentId, action, payload } = req.body
  const token = req.headers.authorization?.split(' ')[1]

  if (token !== (process.env.INTERNAL_SERVICE_TOKEN || 'dev-token')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (documentId && action) {
    const eventName = `comment:${action.toLowerCase()}`
    io.to(documentId).emit(eventName as any, payload)
    SocketLogger.info(`Broadcasted ${eventName} for doc ${documentId}`)
    return res.status(200).json({ success: true })
  }
  return res.status(400).json({ error: 'Missing required fields' })
})

app.post('/api/broadcast/notifications', (req, res) => {
  const { userId, action, payload } = req.body
  const token = req.headers.authorization?.split(' ')[1]

  if (token !== (process.env.INTERNAL_SERVICE_TOKEN || 'dev-token')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (userId && action) {
    const eventName = `notification:${action.toLowerCase()}`
    io.to(`user:${userId}`).emit(eventName as any, payload)
    SocketLogger.info(`Broadcasted ${eventName} for user ${userId}`)
    return res.status(200).json({ success: true })
  }
  return res.status(400).json({ error: 'Missing required fields' })
})

io.on('connection', (socket) => {
  MetricsService.trackConnection()
  SocketLogger.info('Socket connected', { socketId: socket.id, userId: socket.data.userId })

  // Join the user's personal global room automatically
  socket.join(`user:${socket.data.userId}`)

  registerRoomHandlers(io, socket)
  registerPresenceHandlers(io, socket)
  registerOperationHandlers(io, socket)

  socket.on('disconnect', (reason) => {
    MetricsService.trackDisconnection()
    SocketLogger.info('Socket disconnected', { socketId: socket.id, reason })
  })
})

const PORT = process.env.PORT || 4000
if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(PORT, () => {
    SocketLogger.info(`Socket server listening on port ${PORT}`)
  })
}

// Graceful Shutdown
function shutdown() {
  SocketLogger.info('SIGTERM received. Shutting down gracefully...')
  io.close(() => {
    httpServer.close(() => {
      Promise.all([pubClient.quit(), subClient.quit()]).then(() => {
        SocketLogger.info('Shutdown complete.')
        process.exit(0)
      })
    })
  })
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
