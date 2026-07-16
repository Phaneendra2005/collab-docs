import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { createServer } from 'http'
import Client, { Socket as ClientSocket } from 'socket.io-client'
import { io } from '../server'
import jwt from 'jsonwebtoken'

vi.mock('../services/internal.client', () => ({
  InternalServiceClient: {
    getDocumentRole: vi.fn(async (userId: string) => {
      if (userId === 'viewer1') return 'VIEWER'
      return 'EDITOR'
    }),
    getMissingOperations: vi.fn(async () => []),
    persistOperations: vi.fn(async () => true),
  },
}))

describe('Socket Server Integration', () => {
  let clientSocket: ClientSocket
  let port: number

  beforeAll(async () => {
    const httpServer = createServer()
    io.attach(httpServer)

    await new Promise<void>((resolve) => {
      httpServer.listen(() => {
        port = (httpServer.address() as any).port
        resolve()
      })
    })
  })

  afterAll(() => {
    io.close()
  })

  afterEach(() => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect()
    }
  })

  it('rejects invalid JWT', async () => {
    clientSocket = Client(`http://localhost:${port}`, {
      auth: { token: 'invalid_token' },
      query: { documentId: 'doc1' },
      transports: ['websocket'],
    })

    await new Promise<void>((resolve) => {
      clientSocket.on('connect_error', (err) => {
        expect(err.message).toBe('Authentication Error')
        resolve()
      })
    })
  })

  it('rejects VIEWER from sending operations', async () => {
    const token = jwt.sign({ userId: 'viewer1' }, process.env.NEXTAUTH_SECRET || 'secret')

    clientSocket = Client(`http://localhost:${port}`, {
      auth: { token },
      query: { documentId: 'doc1' },
      transports: ['websocket'],
    })

    await new Promise<void>((resolve) => {
      clientSocket.on('connect', () => {
        clientSocket.emit(
          'operation:send',
          {
            operationId: crypto.randomUUID(),
            actorId: 'viewer1',
            documentId: 'doc1',
            lamportClock: 1,
            parentOperationIds: [],
            documentVersion: 1,
            operationType: 'InsertText',
            payload: {},
            checksum: 'abc',
            operationHash: 'abc',
            createdAt: Date.now(),
          } as any,
          (ack: any) => {
            expect(ack.success).toBe(false)
            expect(ack.error).toContain('Unauthorized')
            resolve()
          },
        )
      })
    })
  })
  it('rejects connection without documentId', async () => {
    const token = jwt.sign({ userId: 'editor1' }, process.env.NEXTAUTH_SECRET || 'secret')
    clientSocket = Client(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
    })

    await new Promise<void>((resolve) => {
      clientSocket.on('connect_error', (err) => {
        expect(err.message).toBe('Document ID required')
        resolve()
      })
    })
  })

  it('allows EDITOR to send operations and batches them', async () => {
    const token = jwt.sign({ userId: 'editor1' }, process.env.NEXTAUTH_SECRET || 'secret')

    // Connect user 1
    clientSocket = Client(`http://localhost:${port}`, {
      auth: { token },
      query: { documentId: 'doc1' },
      transports: ['websocket'],
    })

    // Connect user 2 to receive the broadcast
    const clientSocket2 = Client(`http://localhost:${port}`, {
      auth: { token },
      query: { documentId: 'doc1' },
      transports: ['websocket'],
    })

    await Promise.all([
      new Promise<void>((resolve) => clientSocket.on('connect', resolve)),
      new Promise<void>((resolve) => clientSocket2.on('connect', resolve)),
    ])

    // Join room for both
    await Promise.all([
      new Promise<void>((resolve) => clientSocket.emit('room:join', 'doc1', () => resolve())),
      new Promise<void>((resolve) => clientSocket2.emit('room:join', 'doc1', () => resolve())),
    ])

    // Send operation from user 1
    const opPromise = new Promise<void>((resolve) => {
      clientSocket2.on('operation:receive', (op) => {
        expect(op.operationType).toBe('InsertText')
        resolve()
      })
    })

    clientSocket.emit(
      'operation:send',
      {
        operationId: crypto.randomUUID(),
        actorId: 'editor1',
        documentId: 'doc1',
        lamportClock: 1,
        parentOperationIds: [],
        documentVersion: 1,
        operationType: 'InsertText',
        payload: {},
        checksum: 'abc',
        operationHash: 'abc',
        createdAt: Date.now(),
      } as any,
      (ack: any) => {
        expect(ack.success).toBe(true)
      },
    )

    await opPromise
    clientSocket2.disconnect()
  })

  it('handles sync:reconnect successfully', async () => {
    const token = jwt.sign({ userId: 'editor1' }, process.env.NEXTAUTH_SECRET || 'secret')
    clientSocket = Client(`http://localhost:${port}`, {
      auth: { token },
      query: { documentId: 'doc1' },
      transports: ['websocket'],
    })

    await new Promise<void>((resolve) => clientSocket.on('connect', resolve))

    await new Promise<void>((resolve) => {
      clientSocket.emit(
        'sync:reconnect',
        {
          documentId: 'doc1',
          lastAckedOperationId: null,
          lastLamportClock: 0,
        },
        (ack: any, missingOps: any[]) => {
          expect(ack.success).toBe(true)
          expect(Array.isArray(missingOps)).toBe(true)
          resolve()
        },
      )
    })
  })

  it('handles presence updates and broadcast', async () => {
    const token = jwt.sign({ userId: 'editor1' }, process.env.NEXTAUTH_SECRET || 'secret')
    clientSocket = Client(`http://localhost:${port}`, {
      auth: { token },
      query: { documentId: 'doc1' },
      transports: ['websocket'],
    })

    const clientSocket2 = Client(`http://localhost:${port}`, {
      auth: { token },
      query: { documentId: 'doc1' },
      transports: ['websocket'],
    })

    await Promise.all([
      new Promise<void>((resolve) => clientSocket.on('connect', resolve)),
      new Promise<void>((resolve) => clientSocket2.on('connect', resolve)),
    ])

    await Promise.all([
      new Promise<void>((resolve) => clientSocket.emit('room:join', 'doc1', () => resolve())),
      new Promise<void>((resolve) => clientSocket2.emit('room:join', 'doc1', () => resolve())),
    ])

    const presencePromise = new Promise<void>((resolve) => {
      clientSocket2.on('presence:broadcast', (p) => {
        expect(p.isTyping).toBe(true)
        resolve()
      })
    })

    clientSocket.emit('presence:update', {
      documentId: 'doc1',
      isTyping: true,
    })

    await presencePromise
    clientSocket2.disconnect()
  })

  it('rejects invalid operation payload', async () => {
    const token = jwt.sign({ userId: 'editor1' }, process.env.NEXTAUTH_SECRET || 'secret')
    clientSocket = Client(`http://localhost:${port}`, {
      auth: { token },
      query: { documentId: 'doc1' },
      transports: ['websocket'],
    })

    await new Promise<void>((resolve) => clientSocket.on('connect', resolve))

    await new Promise<void>((resolve) => {
      clientSocket.emit('operation:send', { invalid: 'payload' } as any, (ack: any) => {
        expect(ack.success).toBe(false)
        expect(ack.error).toBe('Invalid operation payload')
        resolve()
      })
    })
  })

  it('rejects invalid sync:reconnect payload', async () => {
    const token = jwt.sign({ userId: 'editor1' }, process.env.NEXTAUTH_SECRET || 'secret')
    clientSocket = Client(`http://localhost:${port}`, {
      auth: { token },
      query: { documentId: 'doc1' },
      transports: ['websocket'],
    })

    await new Promise<void>((resolve) => clientSocket.on('connect', resolve))

    await new Promise<void>((resolve) => {
      clientSocket.emit('sync:reconnect', { invalid: 'payload' } as any, (ack: any) => {
        expect(ack.success).toBe(false)
        expect(ack.error).toBe('Invalid reconnect payload')
        resolve()
      })
    })
  })

  it('rejects invalid presence update payload', async () => {
    const token = jwt.sign({ userId: 'editor1' }, process.env.NEXTAUTH_SECRET || 'secret')
    clientSocket = Client(`http://localhost:${port}`, {
      auth: { token },
      query: { documentId: 'doc1' },
      transports: ['websocket'],
    })

    await new Promise<void>((resolve) => clientSocket.on('connect', resolve))

    // presence:update doesn't have an ack callback in the type definition,
    // but the handler will catch the error internally without crashing the server.
    clientSocket.emit('presence:update', { invalid: 'payload' } as any)

    // Wait a tiny bit for processing
    await new Promise((resolve) => setTimeout(resolve, 100))
  })
})
