'use client'
import { useEditor, EditorContent, Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import Mention from '@tiptap/extension-mention'
import createSuggestion from './extensions/MentionSuggestion'
import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Step } from '@tiptap/pm/transform'
import { SyncEngine } from '@/client/sync'
import { db } from '@/client/sync/database'
import { SyncLogger } from '@/client/sync/logger'
import { CompressionService } from '@/client/sync/compression'
import { useSocket } from '../providers/SocketProvider'
import { usePresence } from './hooks/usePresence'
import { Document } from '@tiptap/extension-document'
import { RemoteCursors } from './RemoteCursorExtension'
import AIFeatures from './AIFeatures'
import ShareModal from '../document/ShareModal'
import ExportMenu from './ExportMenu'
import Avatar from '../ui/Avatar'
import { CommentMark } from './extensions/CommentMark'
import CommentsSidebar from '../comments/CommentsSidebar'

interface TipTapEditorProps {
  documentId: string
  initialContent?: string | null
  actorId: string
  token?: string
  editable?: boolean
  role: 'OWNER' | 'EDITOR' | 'VIEWER'
  onOpenHistory?: () => void
  editorRef?: React.MutableRefObject<any>
}

export default function TipTapEditor({
  documentId,
  actorId,
  initialContent,
  token,
  editable = true,
  role,
  onOpenHistory,
  editorRef,
}: TipTapEditorProps) {
  const router = useRouter()
  const { socket, isConnected } = useSocket()
  const syncEngineRef = useRef<SyncEngine | null>(null)
  const localEditorRef = useRef<Editor | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isApplyingRemote = useRef(false)

  // Resync bookkeeping: prevents concurrent resyncs and rate-limits how
  // often we'll attempt a full rebuild if the document keeps hitting
  // structural conflicts (avoids a resync storm hammering the server).
  const isResyncingRef = useRef(false)
  const lastResyncAttemptRef = useRef<number>(0)
  const RESYNC_COOLDOWN_MS = 5000

  const [connectionStatus, setConnectionStatus] = useState<string>('Connecting...')
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState<'OWNER' | 'EDITOR' | 'VIEWER'>(role)
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)

  const editor = useEditor({
    editable,
    extensions: [
      StarterKit,
      Underline,
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      Link.configure({ openOnClick: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image,
      Placeholder.configure({ placeholder: 'Start writing your collaborative document...' }),
      CharacterCount,
      RemoteCursors,
      CommentMark,
      Mention.configure({
        HTMLAttributes: {
          class:
            'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 px-1 rounded-md cursor-pointer font-medium',
        },
        suggestion: createSuggestion(documentId),
      }),
    ],
    content: initialContent || '',
    editorProps: {
      attributes: {
        class:
          'prose prose-sm sm:prose-base dark:prose-invert focus:outline-none min-h-[500px] max-w-none px-8 py-6 break-words whitespace-pre-wrap',
      },
    },
    onUpdate: ({ editor, transaction }) => {
      if (isApplyingRemote.current) return
      if (!transaction.docChanged) return

      const engine = syncEngineRef.current
      if (!engine) return

      // PIPELINE A: Immediate Broadcast of Delta (Steps)
      engine.applyLocalSteps(transaction.steps, transaction.docs).then((op) => {
        console.log('[LOCAL OP]', op)

        if (op) {
          console.log('[DEBUG] Socket send:', {
            operationId: op.operationId,
            timestamp: Date.now(),
          })
          console.log('[SENDING]', op.operationId)

          socket?.emit('operation:send', op, (ack: any) => {
            console.log('[ACK]', ack)

            if (!ack || !ack.success) {
              console.error('Failed to sync operation', ack?.error)
            } else if (ack.success) {
              engine.acknowledgeLocalOperation(op.operationId)
            }
          })
        } else {
          console.log('[NO OP GENERATED]')
        }
      })

      // PIPELINE B: Debounced Autosave (Full Document Snapshot)
      // We ONLY emit locally to the engine to persist to DB. We DO NOT broadcast this to other sockets
      // because broadcasting the full snapshot overrides concurrent edits (causing 'Invalid ProseMirror document' errors).
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => {
        const contentJSON = editor.getJSON()
        const stringified = JSON.stringify(contentJSON)

        engine.emitOperation(
          'UpdateMetadata',
          {
            key: 'content',
            value: stringified,
          },
          [],
        )
      }, 500)
    },
    onSelectionUpdate: ({ editor }) => {
      // Find if we are currently inside a comment mark
      const { $from } = editor.state.selection
      const marks = $from.marks()
      const commentMark = marks.find((m) => m.type.name === 'comment')

      if (commentMark && commentMark.attrs.commentId) {
        setActiveCommentId(commentMark.attrs.commentId)
      } else if (editor.state.selection.empty) {
        setActiveCommentId(null)
      }
    },
  })

  const handleAddComment = () => {
    if (!editor || currentUserRole === 'VIEWER') return

    const selection = editor.state.selection
    if (selection.empty) return

    // Architecture Fix: Do NOT inject the mark into TipTap yet.
    // Speculative client-side marks cause split-brain orphaned operations.
    // Wait until database confirms persistence.
    window.dispatchEvent(
      new CustomEvent('sync:comment:new', {
        detail: {
          quote: editor.state.doc.textBetween(selection.from, selection.to, ' '),
          from: selection.from,
          to: selection.to,
        },
      }),
    )
  }

  useEffect(() => {
    const handleCommentPersisted = (e: Event) => {
      const { id, from, to } = (e as CustomEvent).detail
      if (localEditorRef.current) {
        // Inject the mark using the database-confirmed ID
        localEditorRef.current.commands.setTextSelection({ from, to })
        localEditorRef.current.commands.setComment(id)
      }
    }
    window.addEventListener('sync:comment:persisted', handleCommentPersisted)
    return () => window.removeEventListener('sync:comment:persisted', handleCommentPersisted)
  }, [])

  const updateConnectionStatus = useCallback((status: string) => {
    setConnectionStatus(status)
  }, [])

  useEffect(() => {
    if (!editor || !socket || !token) return
    if (editorRef) editorRef.current = editor
    localEditorRef.current = editor

    // Initialize Sync Engine
    const engine = new SyncEngine(documentId, actorId)
    engine.setSchema(editor.schema)
    syncEngineRef.current = engine

    const applyStepsToEditor = (steps: Step[]) => {
      console.log('[EDITOR] applyStepsToEditor', steps)

      const currentEditor = localEditorRef.current
      if (!currentEditor) return

      isApplyingRemote.current = true

      let anyStepFailed = false
      try {
        const tr = currentEditor.state.tr

        steps.forEach((step, index) => {
          try {
            console.log('[STEP BEFORE]', JSON.stringify(tr.doc.toJSON(), null, 2))

            tr.step(step)

            console.log('[STEP APPLIED]', index)
            console.log('[STEP AFTER]', JSON.stringify(tr.doc.toJSON(), null, 2))
          } catch (e) {
            console.error('[STEP FAILED]', index, e)
            // FIX (Root Cause #2): previously this failure was only
            // logged and the loop moved on, leaving the editor's real
            // ProseMirror doc silently out of sync with what SyncEngine
            // believes was applied. Flag it so we trigger recovery below.
            anyStepFailed = true
          }
        })

        console.log('[DISPATCH]', tr.doc.toJSON())

        currentEditor.view.dispatch(tr)

        console.log('[EDITOR AFTER DISPATCH]', JSON.stringify(currentEditor.getJSON(), null, 2))
      } finally {
        isApplyingRemote.current = false
      }

      if (anyStepFailed) {
        syncEngineRef.current?.requestResync('editor-level step application failed')
      }
    }

    const applyContentToEditor = (contentJson: any) => {
      const currentEditor = localEditorRef.current
      if (!currentEditor) return

      isApplyingRemote.current = true
      try {
        const { from, to } = currentEditor.state.selection
        currentEditor.commands.setContent(contentJson, { emitUpdate: false })
        try {
          currentEditor.commands.setTextSelection({ from, to })
        } catch (e) {}
      } finally {
        isApplyingRemote.current = false
      }
    }

    /**
     * FIX (Root Cause #2 - recovery):
     * Full resync flow. Triggered when SyncEngine detects it could not
     * cleanly reconcile a remote or local step (structural conflict,
     * out-of-bounds mapping, etc). Rather than leaving the client
     * permanently diverged, we reset to the document's base content and
     * replay the ENTIRE operation history from the server in Lamport
     * order, using the existing `sync:reconnect` event (no new server
     * endpoint required — this reuses the same mechanism already used
     * for reconnect catch-up, just requesting from clock 0 instead of
     * the last-known clock).
     */
    const performFullResync = async (reason: string) => {
      const now = Date.now()
      if (isResyncingRef.current) return
      if (now - lastResyncAttemptRef.current < RESYNC_COOLDOWN_MS) return
      lastResyncAttemptRef.current = now
      isResyncingRef.current = true

      SyncLogger.warn(`Starting full resync for doc ${documentId}: ${reason}`)

      const currentEditor = localEditorRef.current
      if (!currentEditor || !socket) {
        isResyncingRef.current = false
        return
      }

      isApplyingRemote.current = true
      try {
        let baseContent: any = ''
        if (initialContent) {
          try {
            baseContent = JSON.parse(initialContent)
          } catch {
            // initialContent wasn't JSON (e.g. raw HTML/plain string) — use as-is.
            baseContent = initialContent
          }
        }
        currentEditor.commands.setContent(baseContent, { emitUpdate: false })
        engine.prepareForFullResync()
      } catch (e) {
        SyncLogger.error('Failed to reset editor content during resync', { error: e })
        isResyncingRef.current = false
        isApplyingRemote.current = false
        return
      } finally {
        isApplyingRemote.current = false
      }

      socket.emit(
        'sync:reconnect',
        {
          documentId,
          lastLamportClock: 0,
          lastAckedOperationId: null,
        },
        async (ack: any, allOps: any[]) => {
          if (!ack?.success || !Array.isArray(allOps)) {
            SyncLogger.error('Full resync failed: could not fetch operation history')
            isResyncingRef.current = false
            return
          }

          try {
            for (const op of allOps) {
              const currentDoc = localEditorRef.current?.state.doc || currentEditor.state.doc
              await engine.receiveRemoteOperation(op, currentDoc)
            }
            SyncLogger.info(
              `Full resync complete for doc ${documentId}. Replayed ${allOps.length} operations.`,
            )
          } catch (e) {
            SyncLogger.error('Full resync failed while replaying operations', { error: e })
          } finally {
            isResyncingRef.current = false
          }
        },
      )
    }

    engine.on('apply-steps', applyStepsToEditor)

    // FIX: re-enabled. This was previously disabled with a TODO-style
    // comment, which meant SyncEngine had no working path to push a full
    // document snapshot into the editor. It's needed both for the
    // `content`-key operation path and is exercised by the resync flow
    // above (indirectly, via replayed tiptap_steps ops rebuilding state).
    engine.on('apply-content', applyContentToEditor)

    // FIX (Root Cause #2 - recovery): wire up the new resync signal.
    engine.on('resync-required', (payload: { reason: string }) => {
      performFullResync(payload?.reason || 'unknown')
    })

    engine.initialize()

    let isMounted = true
    const loadLocalData = async () => {
      try {
        const snapshots = await db.snapshots
          .where('documentId')
          .equals(documentId)
          .sortBy('lamportClock')

        const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null
        let baseLamport = 0

        if (latestSnapshot && isMounted) {
          const decompressed = await CompressionService.decompress(latestSnapshot.data)
          const contentStr = new TextDecoder().decode(decompressed)
          const content = JSON.parse(contentStr)
          editor.commands.setContent(content, { emitUpdate: false })
          baseLamport = latestSnapshot.lamportClock
          SyncLogger.info('Loaded document from local snapshot')
        } else if (initialContent && isMounted) {
          editor.commands.setContent(JSON.parse(initialContent), { emitUpdate: false })
        }

        const ops = await db.operations
          .where('documentId')
          .equals(documentId)
          .filter((op) => op.lamportClock > baseLamport)
          .sortBy('lamportClock')

        if (ops.length > 0 && isMounted) {
          for (const op of ops) {
            const currentDoc = localEditorRef.current?.state.doc || editor.state.doc
            await engine.receiveRemoteOperation(op, currentDoc)
          }
          SyncLogger.info(`Applied ${ops.length} local operations after snapshot`)
        }
      } catch (err) {
        SyncLogger.error('Local-First init failed', { error: err })
      }
    }

    loadLocalData()

    const onConnect = () => {
      updateConnectionStatus('Connected')
      socket.emit('room:join', documentId, (response: any) => {
        if (!response?.success) return

        socket.emit(
          'sync:reconnect',
          {
            documentId,
            lastLamportClock: engine.clock.current() || 0,
            lastAckedOperationId: engine.lastAckedOperationId,
          },
          async (ack: any, missingOps: any[]) => {
            if (ack.success && missingOps && Array.isArray(missingOps)) {
              for (const op of missingOps) {
                const currentDoc = localEditorRef.current?.state.doc || editor.state.doc
                await engine.receiveRemoteOperation(op, currentDoc)
              }
            }
          },
        )
      })
    }

    const setInitialStatus = () => {
      if (socket.connected) {
        onConnect()
      } else {
        updateConnectionStatus('Connecting')
      }
    }
    setInitialStatus()

    const onDisconnect = () => updateConnectionStatus('Disconnected')
    const onReconnectAttempt = () => updateConnectionStatus('Reconnecting')

    const onOperationReceive = async (op: any) => {
      console.log('[DEBUG] Socket receive:', {
        operationId: op.operationId,
        actorId: op.actorId,
        timestamp: Date.now(),
      })
      console.log('[RECEIVED OP]', op)

      if (op.operationType === 'UpdateMetadata') {
        console.log('[APPLYING UPDATE METADATA]')
        await engine.receiveRemoteOperation(op, localEditorRef.current!.state.doc)
      } else {
        console.log('[IGNORED OPERATION]', op.operationType)
      }
    }

    const onRestore = async (e: Event) => {
      const customEvent = e as CustomEvent
      const snapshotContent = customEvent.detail

      const op = await engine.emitOperation(
        'UpdateMetadata',
        {
          key: 'content',
          value: snapshotContent,
        },
        [],
      )

      socket?.emit('operation:send', op, (ack: any) => {
        if (!ack || !ack.success) {
          console.error('Failed to broadcast restore operation', ack?.error)
        }
      })

      isApplyingRemote.current = true
      try {
        editor.commands.setContent(JSON.parse(snapshotContent), { emitUpdate: false })
      } finally {
        isApplyingRemote.current = false
      }
    }

    const onDocumentRename = (payload: any) => {
      if (payload.documentId === documentId) {
        window.dispatchEvent(new CustomEvent('sync:document:rename', { detail: payload.title }))
      }
    }

    const onAccessRevoked = (payload: any) => {
      if (payload.documentId === documentId) {
        engine.terminate()
        window.location.href = '/?revoked=true'
      }
    }

    const onRoleChanged = (payload: any) => {
      if (payload.documentId === documentId) {
        setCurrentUserRole(payload.role as any)
        const currentEditor = localEditorRef.current
        if (payload.role === 'VIEWER' && currentEditor) {
          currentEditor.setEditable(false)
        } else if ((payload.role === 'EDITOR' || payload.role === 'OWNER') && currentEditor) {
          currentEditor.setEditable(true)
        }
        window.dispatchEvent(new CustomEvent('sync:document:role', { detail: payload.role }))
      }
    }

    const onCollaboratorsUpdated = (payload: any) => {
      if (payload.documentId === documentId) {
        window.dispatchEvent(new Event('sync:document:collaborators'))
      }
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.io.on('reconnect_attempt', onReconnectAttempt)
    socket.on('operation:receive', onOperationReceive)
    window.addEventListener('sync:restore', onRestore as EventListener)
    socket.on('document:rename', onDocumentRename)
    socket.on('document:access_revoked', onAccessRevoked)
    socket.on('document:role_changed', onRoleChanged)
    socket.on('document:collaborators_updated', onCollaboratorsUpdated)

    return () => {
      isMounted = false
      engine.terminate()
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.io.off('reconnect_attempt', onReconnectAttempt)
      socket.off('operation:receive', onOperationReceive)
      window.removeEventListener('sync:restore', onRestore as EventListener)
      socket.off('document:rename', onDocumentRename)
      socket.off('document:access_revoked', onAccessRevoked)
      socket.off('document:role_changed', onRoleChanged)
      socket.off('document:collaborators_updated', onCollaboratorsUpdated)
    }
  }, [editor, documentId, actorId, token, socket, updateConnectionStatus])

  const { collaborators, isTypingLocal } = usePresence(socket, documentId, editor)

  if (!editor) return <div className="p-8 text-zinc-500 animate-pulse">Loading editor...</div>

  return (
    <div className="flex flex-col w-full h-full border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-950 shadow-sm min-w-0">
      {/* Toolbar */}
      {currentUserRole !== 'VIEWER' && (
        <div className="flex items-center gap-1 p-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex-wrap">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors ${editor.isActive('bold') ? 'bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white font-semibold' : 'text-zinc-600 dark:text-zinc-400'}`}
          >
            Bold
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors ${editor.isActive('italic') ? 'bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white font-semibold' : 'text-zinc-600 dark:text-zinc-400'}`}
          >
            Italic
          </button>
          <button
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors ${editor.isActive('underline') ? 'bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white font-semibold' : 'text-zinc-600 dark:text-zinc-400'}`}
          >
            Underline
          </button>
          <div className="w-px h-6 bg-zinc-300 dark:bg-zinc-700 mx-1" />
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors ${editor.isActive('heading', { level: 1 }) ? 'bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white font-semibold' : 'text-zinc-600 dark:text-zinc-400'}`}
          >
            H1
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors ${editor.isActive('heading', { level: 2 }) ? 'bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white font-semibold' : 'text-zinc-600 dark:text-zinc-400'}`}
          >
            H2
          </button>
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors ${editor.isActive('bulletList') ? 'bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white font-semibold' : 'text-zinc-600 dark:text-zinc-400'}`}
          >
            Bullet
          </button>
          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors ${editor.isActive('orderedList') ? 'bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white font-semibold' : 'text-zinc-600 dark:text-zinc-400'}`}
          >
            Order
          </button>
          <button
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            className={`p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors ${editor.isActive('taskList') ? 'bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white font-semibold' : 'text-zinc-600 dark:text-zinc-400'}`}
          >
            Task
          </button>
          <div className="w-px h-6 bg-zinc-300 dark:bg-zinc-700 mx-1" />
          <button
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors ${editor.isActive('blockquote') ? 'bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white font-semibold' : 'text-zinc-600 dark:text-zinc-400'}`}
          >
            Quote
          </button>
          <button
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={`p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors ${editor.isActive('codeBlock') ? 'bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white font-semibold' : 'text-zinc-600 dark:text-zinc-400'}`}
          >
            Code
          </button>
          <div className="w-px h-6 bg-zinc-300 dark:bg-zinc-700 mx-1" />
          <button
            onClick={() => onOpenHistory?.()}
            className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors text-zinc-600 dark:text-zinc-400"
            title="Version History"
          >
            History
          </button>
          <div className="w-px h-6 bg-zinc-300 dark:bg-zinc-700 mx-1" />
          <AIFeatures
            documentId={documentId}
            getSelectedText={() => {
              const { from, to } = editor.state.selection
              return editor.state.doc.textBetween(from, to, ' ')
            }}
            getFullText={() => editor.state.doc.textContent}
            onInsertText={(text) => {
              editor.chain().focus().insertContent(text).run()
            }}
            onReplaceSelection={(text) => {
              editor.chain().focus().insertContent(text).run()
            }}
          />
          <div className="w-px h-6 bg-zinc-300 dark:bg-zinc-700 mx-1" />
          <ExportMenu
            getHTML={() => editor.getHTML()}
            getJSON={() => editor.getJSON()}
            documentTitle={documentId}
          />
          {currentUserRole === 'OWNER' && (
            <button
              onClick={() => setIsShareModalOpen(true)}
              className="ml-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors shadow-sm flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
              Share
            </button>
          )}
          <ShareModal
            documentId={documentId}
            isOpen={isShareModalOpen}
            onClose={() => setIsShareModalOpen(false)}
          />
          <div className="ml-auto text-xs font-medium px-2 py-1 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
            {connectionStatus}
          </div>
        </div>
      )}

      {/* Active Collaborators Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <div className="flex items-center gap-2">
          {collaborators.length === 0 ? (
            <span className="text-xs text-zinc-500">Only you</span>
          ) : (
            <div className="flex -space-x-2 overflow-hidden">
              {collaborators.map((c) => (
                <div
                  key={c.sessionId}
                  className="inline-block h-8 w-8 rounded-full ring-2 ring-white dark:ring-zinc-950 shadow-sm"
                  title={c.actorId}
                >
                  <Avatar
                    src={c.avatar}
                    alt={c.actorId}
                    fallbackText={c.actorId}
                    size={32}
                    style={{ backgroundColor: c.color }}
                  />
                </div>
              ))}
            </div>
          )}
          {collaborators.some((c) => c.isTyping) && (
            <div className="text-xs text-zinc-500 ml-2 animate-pulse flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400"></span>
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400"></span>
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400"></span>
              Someone is typing...
            </div>
          )}
        </div>
      </div>
      {/* Editor & Sidebar Container */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto min-w-0 relative">
          {editor && currentUserRole !== 'VIEWER' && (
            // @ts-expect-error tippyOptions is not properly typed in the current TipTap React typings
            <BubbleMenu editor={editor} tippyOptions={{ duration: 100, placement: 'top' }}>
              <div className="flex bg-white dark:bg-zinc-800 shadow-md rounded-md border border-zinc-200 dark:border-zinc-700 overflow-hidden text-sm">
                <button
                  onClick={handleAddComment}
                  className="px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 font-medium text-zinc-700 dark:text-zinc-200"
                >
                  💬 Add Comment
                </button>
              </div>
            </BubbleMenu>
          )}
          <EditorContent editor={editor} />
        </div>

        {/* Right Sidebar for Comments */}
        <CommentsSidebar
          documentId={documentId}
          currentUserId={actorId}
          currentUserRole={currentUserRole}
          activeCommentId={activeCommentId}
          onCommentClick={(id) => setActiveCommentId(id)}
        />
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center p-2 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-500">
        <div className="flex items-center gap-4">
          <span>{editor.storage.characterCount.characters()} characters</span>
          {isTypingLocal && <span className="text-zinc-400">Saving...</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span
              className={`w-2 h-2 rounded-full ${connectionStatus === 'Connected' ? 'bg-green-500' : connectionStatus === 'Connecting' || connectionStatus === 'Reconnecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`}
            ></span>
            {connectionStatus}
          </div>
        </div>
      </div>
    </div>
  )
}
