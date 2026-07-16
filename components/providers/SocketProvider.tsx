'use client'

import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

interface SocketContextValue {
  socket: Socket | null
  isConnected: boolean
}

const SocketContext = createContext<SocketContextValue>({ socket: null, isConnected: false })

export const useSocket = () => useContext(SocketContext)

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const initialized = useRef(false)

  useEffect(() => {
    // Prevent double initialization in StrictMode
    if (initialized.current) return
    initialized.current = true

    let s: Socket

    const connectSocket = async () => {
      try {
        const res = await fetch('/api/auth/socket-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })

        if (!res.ok) return // User might not be logged in

        const data = await res.json()

        if (data.token) {
          s = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000', {
            auth: { token: data.token },
            transports: ['websocket'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: Infinity,
          })

          s.on('connect', () => {
            setIsConnected(true)
          })

          s.on('disconnect', () => {
            setIsConnected(false)
          })

          setSocket(s)
        }
      } catch (error) {
        console.error('Failed to initialize global socket', error)
      }
    }

    connectSocket()

    return () => {
      if (s) {
        s.disconnect()
      }
      initialized.current = false
    }
  }, [])

  return <SocketContext.Provider value={{ socket, isConnected }}>{children}</SocketContext.Provider>
}
