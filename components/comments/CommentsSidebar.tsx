'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Comment } from './types'
import CommentThread from './CommentThread'
import { useSocket } from '../providers/SocketProvider'

interface CommentsSidebarProps {
  documentId: string
  currentUserId: string
  currentUserRole: 'OWNER' | 'EDITOR' | 'VIEWER'
  activeCommentId: string | null
  onCommentClick: (commentId: string) => void
}

export default function CommentsSidebar({
  documentId,
  currentUserId,
  currentUserRole,
  activeCommentId,
  onCommentClick,
}: CommentsSidebarProps) {
  const { socket } = useSocket()
  const [comments, setComments] = useState<Comment[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'RESOLVED'>('ACTIVE')
  const [draftComment, setDraftComment] = useState<{
    quote: string
    from: number
    to: number
  } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const fetchComments = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch(`/api/documents/${documentId}/comments`, { cache: 'no-store' })
      const data = await res.json()
      if (data.data) {
        setComments(data.data)

        // Extract all valid IDs (roots + replies) to detect orphaned marks
        const validIds = new Set<string>()
        data.data.forEach((c: Comment) => {
          validIds.add(c.id)
          c.replies?.forEach((r) => validIds.add(r.id))
        })

        window.dispatchEvent(
          new CustomEvent('sync:comments:loaded', {
            detail: Array.from(validIds),
          }),
        )
      }
    } catch (e) {
      console.error('Failed to fetch comments', e)
    } finally {
      setIsLoading(false)
    }
  }, [documentId])

  useEffect(() => {
    const loadComments = async () => {
      await fetchComments()
    }
    loadComments()

    const handleNewComment = (e: Event) => {
      const customEvent = e as CustomEvent<{ quote: string; from: number; to: number }>
      setDraftComment(customEvent.detail)
      setActiveTab('ACTIVE') // Ensure active tab is selected
    }

    window.addEventListener('sync:comment:new', handleNewComment)
    return () => window.removeEventListener('sync:comment:new', handleNewComment)
  }, [fetchComments])

  useEffect(() => {
    if (!socket) return

    const handleCommentCreate = (payload: Comment) => {
      setComments((prev) => {
        if (payload.parentId) {
          // It's a reply
          return prev.map((c) => {
            if (c.id === payload.parentId) {
              const replies = c.replies || []
              if (replies.some((r) => r.id === payload.id)) {
                return c // Already exists (e.g. if we optimistically inserted it)
              }
              return { ...c, replies: [...replies, payload] }
            }
            return c
          })
        } else {
          // New root thread
          if (prev.some((c) => c.id === payload.id)) {
            return prev // Already exists (inserted by POST response)
          }
          return [payload, ...prev]
        }
      })
    }

    const handleReconnect = () => {
      fetchComments()
    }
    socket.on('connect', handleReconnect)

    const handleCommentUpdate = (payload: Comment) => {
      setComments((prev) =>
        prev.map((c) => {
          if (c.id === payload.id) return { ...c, ...payload }
          if (c.replies) {
            return {
              ...c,
              replies: c.replies.map((r) => (r.id === payload.id ? { ...r, ...payload } : r)),
            }
          }
          return c
        }),
      )
    }

    const handleCommentDelete = (payload: { id: string; parentId: string | null }) => {
      // Execute side-effect outside the React state updater
      if (!payload.parentId) {
        window.dispatchEvent(new CustomEvent('sync:comment:deleted', { detail: payload.id }))
      }

      setComments((prev) => {
        if (!payload.parentId) {
          return prev.filter((c) => c.id !== payload.id)
        } else {
          return prev.map((c) =>
            c.id === payload.parentId
              ? { ...c, replies: (c.replies || []).filter((r) => r.id !== payload.id) }
              : c,
          )
        }
      })
    }

    const handleCommentResolved = (payload: Comment) => {
      handleCommentUpdate(payload)
    }

    const handleCommentReopened = (payload: Comment) => {
      handleCommentUpdate(payload)
    }

    socket.on('comment:created', handleCommentCreate)
    socket.on('comment:updated', handleCommentUpdate)
    socket.on('comment:deleted', handleCommentDelete)
    socket.on('comment:resolved', handleCommentResolved)
    socket.on('comment:reopened', handleCommentReopened)

    return () => {
      socket.off('comment:created', handleCommentCreate)
      socket.off('comment:updated', handleCommentUpdate)
      socket.off('comment:deleted', handleCommentDelete)
      socket.off('comment:resolved', handleCommentResolved)
      socket.off('comment:reopened', handleCommentReopened)
      socket.off('connect', handleReconnect)
    }
  }, [socket, fetchComments])

  // Scroll to active comment
  useEffect(() => {
    if (activeCommentId && scrollRef.current) {
      const el = document.getElementById(`comment-${activeCommentId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [activeCommentId, comments])

  const handleReply = async (parentId: string, content: string) => {
    try {
      // It's a reply to an existing comment
      const res = await fetch(`/api/documents/${documentId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, parentId }),
      })
      if (!res.ok) throw new Error(await res.text())
    } catch (err: any) {
      console.error('Failed to post reply', err)
      alert('Failed to save reply: ' + (err.message || 'Unknown error'))
      throw err
    }
  }

  const handleEdit = async (commentId: string, content: string) => {
    try {
      const url = `/api/documents/${documentId}/comments/${commentId}`

      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) throw new Error(await res.text())
    } catch (err) {
      console.error('Failed to edit comment', err)
    }
  }

  const handleResolve = async (commentId: string) => {
    try {
      const res = await fetch(`/api/documents/${documentId}/comments/${commentId}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) throw new Error(await res.text())
    } catch (err) {
      console.error('Failed to resolve comment', err)
    }
  }

  const handleDelete = async (commentId: string) => {
    try {
      const res = await fetch(`/api/documents/${documentId}/comments/${commentId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(await res.text())
      window.dispatchEvent(new CustomEvent('sync:comment:deleted', { detail: commentId }))
    } catch (err) {
      console.error('Failed to delete comment', err)
    }
  }

  const handleDraftSubmit = async (content: string) => {
    if (!draftComment) return
    try {
      const res = await fetch(`/api/documents/${documentId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, quote: draftComment.quote }),
      })
      if (!res.ok) throw new Error(await res.text())
      const resData = await res.json()

      // Receive persisted comment from server and replace draft in client state
      if (resData.data) {
        setComments((prev) => {
          if (prev.some((c) => c.id === resData.data.id)) {
            return prev // Already inserted by socket
          }
          return [resData.data, ...prev]
        })

        // Signal TipTap to inject the mark NOW that we have the server-generated ID
        window.dispatchEvent(
          new CustomEvent('sync:comment:persisted', {
            detail: {
              id: resData.data.id,
              from: draftComment.from,
              to: draftComment.to,
            },
          }),
        )
      }
      setDraftComment(null)
    } catch (err: any) {
      console.error('Failed to post comment', err)
      alert('Failed to save comment: ' + (err.message || 'Unknown error'))
      setDraftComment(null)
      throw err
    }
  }

  const visibleComments = comments.filter((c) =>
    activeTab === 'ACTIVE' ? !c.resolved : c.resolved,
  )

  const renderDraftComment = () => {
    if (!draftComment || activeTab !== 'ACTIVE') return null

    // Create a mock comment object purely for display structure
    const mockId = 'draft-comment'
    const mockComment: Comment = {
      id: mockId,
      documentId,
      authorId: currentUserId,
      content: '',
      quote: draftComment.quote,
      resolved: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      parentId: null,
      author: { id: currentUserId, name: 'You', email: null, image: null }, // Simple fallback
      replies: [],
    }

    return (
      <div id={`comment-${mockId}`} key={mockId}>
        <CommentThread
          comment={mockComment}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          isActive={true}
          isDraft={true}
          onSubmitDraft={handleDraftSubmit}
          onCancelDraft={() => {
            setDraftComment(null)
            // No SyncEngine cleanup needed! The architecture enforces database-first persistence.
          }}
          onClick={() => onCommentClick(mockId)}
          onReply={async () => {}} // Disabled for draft
          onResolve={async () => {}} // Disabled for draft
          onDelete={async () => {}} // Disabled for draft
          onEdit={async () => {}} // Disabled for draft
        />
      </div>
    )
  }

  return (
    <div className="w-80 border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex flex-col h-full overflow-hidden flex-shrink-0">
      <div className="flex border-b border-zinc-200 dark:border-zinc-800 p-2 gap-2">
        <button
          onClick={() => setActiveTab('ACTIVE')}
          className={`flex-1 text-sm font-medium py-1.5 rounded transition-colors ${activeTab === 'ACTIVE' ? 'bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-white' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'}`}
        >
          Active ({comments.filter((c) => !c.resolved).length})
        </button>
        <button
          onClick={() => setActiveTab('RESOLVED')}
          className={`flex-1 text-sm font-medium py-1.5 rounded transition-colors ${activeTab === 'RESOLVED' ? 'bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-white' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'}`}
        >
          Resolved ({comments.filter((c) => c.resolved).length})
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
        {isLoading ? (
          <div className="text-sm text-zinc-500 text-center mt-10">Loading comments...</div>
        ) : visibleComments.length === 0 && !draftComment ? (
          <div className="text-sm text-zinc-500 text-center mt-10">
            No {activeTab.toLowerCase()} comments.
          </div>
        ) : (
          <>
            {renderDraftComment()}
            {visibleComments.map((comment) => (
              <div id={`comment-${comment.id}`} key={comment.id}>
                <CommentThread
                  comment={comment}
                  currentUserId={currentUserId}
                  currentUserRole={currentUserRole}
                  isActive={activeCommentId === comment.id}
                  onClick={() => onCommentClick(comment.id)}
                  onReply={handleReply}
                  onResolve={handleResolve}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
                />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
