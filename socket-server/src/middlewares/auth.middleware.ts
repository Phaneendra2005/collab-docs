import { Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import { AuthPayloadSchema } from '../types/events'
import { permissionCache } from '../services/cache.service'
import { MetricsService } from '../metrics/metrics.service'
import { InternalServiceClient } from '../services/internal.client'
import { SocketLogger } from '../logger/socket.logger'
import crypto from 'crypto'

import 'dotenv/config'

const JWT_SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'secret'

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthorizationError'
  }
}

interface JwtPayload {
  userId: string
  actorId?: string
}

export async function authMiddleware(socket: Socket, next: (err?: Error) => void) {
  try {
    const authPayload = socket.handshake.auth

    // Bypass for raw benchmarks (mock auth)
    if (authPayload.skipAuth && process.env.NODE_ENV === 'test') {
      socket.data = {
        userId: 'test',
        actorId: 'test',
        role: 'OWNER',
        sessionId: 'test',
        color: '#000',
        avatar: null,
      }
      return next()
    }

    const validAuth = AuthPayloadSchema.parse(authPayload)
    const decoded = jwt.verify(validAuth.token, JWT_SECRET) as JwtPayload

    let role: 'VIEWER' | 'EDITOR' | 'OWNER' = 'VIEWER'

    socket.data = {
      userId: decoded.userId,
      actorId: decoded.actorId || decoded.userId,
      role: role,
      sessionId: validAuth.sessionId || crypto.randomUUID(),
      color: '#000000',
      avatar: null,
    }

    next()
  } catch (error: any) {
    SocketLogger.error('Auth Middleware Failure', { error: error.message })
    MetricsService.trackAuthFailure()
    if (error instanceof AuthorizationError) {
      next(error)
    } else {
      next(new AuthorizationError('Authentication Error'))
    }
  }
}
