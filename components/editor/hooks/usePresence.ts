'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Socket } from 'socket.io-client'
import { Editor } from '@tiptap/react'
import { RemoteCursorKey } from '../RemoteCursorExtension'
import { useDebounce } from 'use-debounce'

export interface Collaborator {
  actorId: string
  sessionId: string
  color: string
  avatar: string | null
  cursor?: { x: number; y: number; line: number } | null
  selection?: { start: number; end: number } | null
  isTyping?: boolean
  lastActivity: number
}

export function usePresence(socket: Socket | null, documentId: string, editor: Editor | null) {
  const [collaborators, setCollaborators] = useState<Map<string, Collaborator>>(new Map())
  const [isTypingLocal, setIsTypingLocal] = useState(false)
  const [debouncedIsTyping] = useDebounce(isTypingLocal, 500)
  const lastSelection = useRef<{ start: number; end: number } | null>(null)

  useEffect(() => {
    if (!socket || !editor) return

    const onPresenceBroadcast = (payload: Collaborator) => {
      setCollaborators((prev) => {
        const next = new Map(prev)
        next.set(payload.sessionId, payload)

        // Update TipTap decorations for remote cursors and selections using the NEW state
        const cursors = Array.from(next.values())
          .filter((c) => c.selection)
          .map((c) => ({
            actorId: c.sessionId, // Use sessionId as the unique cursor key
            name: c.actorId.substring(0, 8), // Show actorId in the label
            color: c.color,
            start: c.selection!.start,
            end: c.selection!.end,
          }))

        // Apply to ProseMirror
        const { state, view } = editor
        view.dispatch(state.tr.setMeta(RemoteCursorKey, { cursors }))

        return next
      })
    }

    const onPresenceLeave = (sessionId: string) => {
      setCollaborators((prev) => {
        const next = new Map(prev)
        next.delete(sessionId)

        // Re-apply to ProseMirror with NEW state
        const cursors = Array.from(next.values())
          .filter((c) => c.selection)
          .map((c) => ({
            actorId: c.sessionId,
            name: c.actorId.substring(0, 8),
            color: c.color,
            start: c.selection!.start,
            end: c.selection!.end,
          }))

        editor.view.dispatch(editor.state.tr.setMeta(RemoteCursorKey, { cursors }))

        return next
      })
    }

    const onRoomJoined = (id: string, activeUsers: any[]) => {
      const map = new Map<string, Collaborator>()
      activeUsers.forEach((u) =>
        map.set(u.sessionId, {
          actorId: u.actorId,
          sessionId: u.sessionId,
          color: u.color || '#3b82f6',
          avatar: u.avatar || null,
          lastActivity: Date.now(),
        }),
      )
      setCollaborators(map)
    }

    socket.on('presence:broadcast', onPresenceBroadcast)
    socket.on('presence:leave', onPresenceLeave)
    socket.on('room:joined', onRoomJoined)

    return () => {
      socket.off('presence:broadcast', onPresenceBroadcast)
      socket.off('presence:leave', onPresenceLeave)
      socket.off('room:joined', onRoomJoined)
    }
  }, [socket, editor])

  // Sync typing status
  useEffect(() => {
    if (socket && socket.connected) {
      socket.emit('presence:update', {
        documentId,
        isTyping: debouncedIsTyping,
        selection: lastSelection.current,
      })
    }
  }, [debouncedIsTyping, socket, documentId])

  // Hook into TipTap selection changes to broadcast our cursor
  useEffect(() => {
    if (!editor || !socket) return

    const onSelectionUpdate = () => {
      const { from, to } = editor.state.selection

      // Throttle updates? We can do that by checking if it changed
      if (
        lastSelection.current &&
        lastSelection.current.start === from &&
        lastSelection.current.end === to
      ) {
        return
      }

      lastSelection.current = { start: from, end: to }

      socket.emit('presence:update', {
        documentId,
        selection: lastSelection.current,
        isTyping: isTypingLocal,
      })
    }

    let typingTimeout: NodeJS.Timeout | null = null
    const onTransaction = ({ transaction }: any) => {
      if (transaction.docChanged) {
        setIsTypingLocal(true)
        if (typingTimeout) clearTimeout(typingTimeout)
        typingTimeout = setTimeout(() => setIsTypingLocal(false), 2000)
      }
    }

    editor.on('selectionUpdate', onSelectionUpdate)
    editor.on('transaction', onTransaction)

    return () => {
      editor.off('selectionUpdate', onSelectionUpdate)
      if (typingTimeout) clearTimeout(typingTimeout)
    }
  }, [editor, socket, documentId, isTypingLocal])

  // Garbage collect is no longer needed since presence:leave explicitly handles cleanup.
  // The server accurately tracks socket disconnects.

  return {
    collaborators: Array.from(collaborators.values()),
    isTypingLocal,
  }
}
