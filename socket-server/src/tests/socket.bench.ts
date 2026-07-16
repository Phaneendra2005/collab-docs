import { bench, describe, beforeAll, afterAll } from 'vitest'
import { createServer } from 'http'
import Client, { Socket as ClientSocket } from 'socket.io-client'
import { io } from '../server'

describe('Socket Server Benchmarks', () => {
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

  const createClients = (count: number): Promise<ClientSocket[]> => {
    return new Promise((resolve) => {
      const clients: ClientSocket[] = []
      let connected = 0
      for (let i = 0; i < count; i++) {
        const client = Client(`http://localhost:${port}`, {
          auth: { token: 'mock', skipAuth: true },
          query: { documentId: 'benchDoc' },
          transports: ['websocket'],
        })
        clients.push(client)
        client.on('connect', () => {
          connected++
          if (connected === count) resolve(clients)
        })
      }
    })
  }

  bench(
    'Broadcast 10 concurrent clients',
    async () => {
      const clients = await createClients(10)
      for (const c of clients) c.disconnect()
    },
    { time: 500 },
  )

  bench(
    'Broadcast 50 concurrent clients',
    async () => {
      const clients = await createClients(50)
      for (const c of clients) c.disconnect()
    },
    { time: 500 },
  )

  bench(
    'Broadcast 100 concurrent clients',
    async () => {
      const clients = await createClients(100)
      for (const c of clients) c.disconnect()
    },
    { time: 500 },
  )
})
