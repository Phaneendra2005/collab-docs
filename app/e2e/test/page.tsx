'use client'
import { useEffect, useState, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

export default function E2ETestPage() {
  const [status, setStatus] = useState('Disconnected')
  const [content, setContent] = useState('')
  const [log, setLog] = useState<string[]>([])
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((session) => {
        if (!session || !session.user) {
          setStatus('Unauthenticated')
          return
        }
        // For real E2E, we need a JWT for the socket server.
        // The Next.js API will issue a signed token for this test.
        fetch('/api/e2e/token')
          .then((res) => res.json())
          .then((data) => {
            if (!data.token) {
              setStatus('Failed to get token')
              return
            }

            const socket = io('http://localhost:3001', {
              auth: { token: data.token },
              query: { documentId: 'e2e-doc-1' },
              transports: ['websocket'],
            })
            socketRef.current = socket

            socket.on('connect', () => setStatus('Connected'))
            socket.on('disconnect', () => setStatus('Disconnected'))
            socket.on('connect_error', (err) => setStatus(`Error: ${err.message}`))

            socket.on('operation:receive', (op) => {
              setLog((prev) => [...prev, `Received 1 op`])
              // Minimal stub for E2E validation
              setContent((prev) => prev + op.payload.text)
            })

            socket.emit('room:join', 'e2e-doc-1')
          })
      })

    return () => {
      socketRef.current?.disconnect()
    }
  }, [])

  const sendOp = () => {
    socketRef.current?.emit('operation:send', {
      operationId: crypto.randomUUID(),
      actorId: 'test-actor',
      documentId: 'e2e-doc-1',
      lamportClock: 1,
      parentOperationIds: [],
      documentVersion: 1,
      operationType: 'InsertText',
      payload: { text: 'A', index: 0 },
      checksum: 'checksum',
      operationHash: 'hash',
      createdAt: Date.now(),
    })
  }

  return (
    <div className="p-8">
      <h1>E2E Test Fixture</h1>
      <div id="status">Status: {status}</div>
      <div id="content">Content: {content}</div>
      <button id="send-op" onClick={sendOp}>
        Send Op
      </button>
      <div id="log">
        {log.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  )
}
