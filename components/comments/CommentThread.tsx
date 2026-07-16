'use client'

import { useState } from 'react'
import { Comment } from './types'
import Avatar from '../ui/Avatar'
import { formatDistanceToNow } from 'date-fns'

interface CommentThreadProps {
  comment: Comment
  currentUserRole: 'OWNER' | 'EDITOR' | 'VIEWER'
  currentUserId: string
  onReply: (parentId: string, content: string) => Promise<void>
  onResolve: (commentId: string) => Promise<void>
  onDelete: (commentId: string) => Promise<void>
  onEdit: (commentId: string, content: string) => Promise<void>
  isActive?: boolean
  onClick?: () => void
  isDraft?: boolean
  onSubmitDraft?: (content: string) => Promise<void>
  onCancelDraft?: () => void
}

export default function CommentThread({
  comment,
  currentUserRole,
  currentUserId,
  onReply,
  onResolve,
  onDelete,
  onEdit,
  isActive = false,
  onClick,
  isDraft = false,
  onSubmitDraft,
  onCancelDraft,
}: CommentThreadProps) {
  const [replyContent, setReplyContent] = useState('')
  const [isReplying, setIsReplying] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftContent, setDraftContent] = useState('')

  const canResolve = currentUserRole === 'OWNER' || currentUserRole === 'EDITOR'
  const canDeleteThread = currentUserRole === 'OWNER' || comment.authorId === currentUserId

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!replyContent.trim()) return
    setIsReplying(true)
    try {
      await onReply(comment.id, replyContent)
      setReplyContent('')
    } finally {
      setIsReplying(false)
    }
  }

  const handleEditSubmit = async (commentId: string) => {
    console.log('SAVE BUTTON CLICKED')
    console.log('Mode: EDIT')
    console.log('Comment object:', comment)

    if (!editContent.trim()) return
    await onEdit(commentId, editContent)
    setEditingId(null)
  }

  const handleDraftSubmit = async () => {
    if (!draftContent.trim() || !onSubmitDraft) return
    await onSubmitDraft(draftContent)
  }

  const renderCommentBody = (c: Comment) => {
    const isEditing = editingId === c.id
    const canDelete = currentUserRole === 'OWNER' || c.authorId === currentUserId
    const canEdit = c.authorId === currentUserId

    return (
      <div key={c.id} className="group flex gap-3 relative py-2">
        <Avatar
          src={c.author.image || undefined}
          alt={c.author.name || 'User'}
          fallbackText={c.author.name || 'U'}
          className="w-8 h-8 flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start">
            <div>
              <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                {c.author.name || 'Unknown User'}
              </span>
              <span className="text-xs text-zinc-500 ml-2">
                {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                {c.createdAt !== c.updatedAt && ' (edited)'}
              </span>
            </div>

            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              {canEdit && !isEditing && (
                <button
                  onClick={() => {
                    setEditingId(c.id)
                    setEditContent(c.content)
                  }}
                  className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 px-1"
                >
                  Edit
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => onDelete(c.id)}
                  className="text-xs text-red-500 hover:text-red-700 px-1"
                >
                  Delete
                </button>
              )}
            </div>
          </div>

          {isEditing ? (
            <div className="mt-1">
              <textarea
                className="w-full text-sm p-2 border rounded-md bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={2}
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-1">
                <button
                  onClick={() => setEditingId(null)}
                  className="text-xs text-zinc-500 hover:text-zinc-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleEditSubmit(c.id)}
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-1 whitespace-pre-wrap">
              {c.content}
            </p>
          )}
        </div>
      </div>
    )
  }

  if (isDraft) {
    return (
      <div className="border rounded-lg p-3 transition-colors border-blue-500 ring-1 ring-blue-500 bg-blue-50 dark:bg-blue-900/10">
        {comment.quote && (
          <blockquote className="border-l-2 border-zinc-300 dark:border-zinc-700 pl-2 text-xs text-zinc-500 italic mb-3 line-clamp-2">
            {comment.quote}
          </blockquote>
        )}
        <div className="flex gap-3 relative py-2">
          <Avatar
            src={comment.author.image || undefined}
            alt={comment.author.name || 'User'}
            fallbackText={comment.author.name || 'U'}
            className="w-8 h-8 flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
              {comment.author.name || 'Unknown User'}
            </span>
            <div className="mt-1">
              <textarea
                className="w-full text-sm p-2 border rounded-md bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                placeholder="Write a comment..."
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                rows={3}
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={onCancelDraft}
                  className="text-xs text-zinc-500 hover:text-zinc-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDraftSubmit}
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md font-medium"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`border rounded-lg p-3 transition-colors ${isActive ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50 dark:bg-blue-900/10' : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-zinc-300 dark:hover:border-zinc-700'}`}
      onClick={onClick}
    >
      {comment.quote && (
        <blockquote className="border-l-2 border-zinc-300 dark:border-zinc-700 pl-2 text-xs text-zinc-500 italic mb-3 line-clamp-2">
          {comment.quote}
        </blockquote>
      )}

      {renderCommentBody(comment)}

      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-4 pl-4 border-l-2 border-zinc-100 dark:border-zinc-800 space-y-1 mt-2">
          {comment.replies.map((reply) => renderCommentBody(reply))}
        </div>
      )}

      {currentUserRole !== 'VIEWER' && (
        <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <form onSubmit={handleReplySubmit} className="flex gap-2">
            <input
              type="text"
              placeholder="Reply..."
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              disabled={isReplying}
              className="flex-1 text-sm bg-zinc-100 dark:bg-zinc-900 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-zinc-950 focus:ring-0 rounded px-3 py-1.5 outline-none transition-all"
            />
            {canResolve && (
              <button
                type="button"
                onClick={() => onResolve(comment.id)}
                className="text-xs font-medium px-3 py-1.5 rounded-md text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
              >
                {comment.resolved ? 'Reopen' : 'Resolve'}
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  )
}
