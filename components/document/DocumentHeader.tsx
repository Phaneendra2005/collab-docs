'use client'

import { useState, useRef, useEffect } from 'react'
import ShareModal from './ShareModal'

interface DocumentHeaderProps {
  documentId: string
  initialTitle: string
  role: 'OWNER' | 'EDITOR' | 'VIEWER'
}

export default function DocumentHeader({ documentId, initialTitle, role }: DocumentHeaderProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [currentTitle, setCurrentTitle] = useState(initialTitle)
  const [inputValue, setInputValue] = useState(initialTitle)
  const [isSaving, setIsSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [currentRole, setCurrentRole] = useState(role)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  useEffect(() => {
    // Initial sync
    document.title = currentTitle

    const handleRenameSync = (e: Event) => {
      const customEvent = e as CustomEvent<string>
      setCurrentTitle(customEvent.detail)
      document.title = customEvent.detail
    }

    window.addEventListener('sync:document:rename', handleRenameSync)

    const handleRoleSync = (e: Event) => {
      const customEvent = e as CustomEvent<string>
      setCurrentRole(customEvent.detail as any)
    }
    window.addEventListener('sync:document:role', handleRoleSync)

    return () => {
      window.removeEventListener('sync:document:rename', handleRenameSync)
      window.removeEventListener('sync:document:role', handleRoleSync)
    }
  }, [currentTitle])

  const handleEdit = () => {
    if (isSaving || currentRole === 'VIEWER') return
    setInputValue(currentTitle)
    setIsEditing(true)
  }

  const handleCancel = () => {
    setInputValue(currentTitle)
    setIsEditing(false)
  }

  const handleSave = async () => {
    const trimmedValue = inputValue.trim()

    if (!trimmedValue) {
      handleCancel()
      return
    }

    if (trimmedValue.length > 100) {
      showToast('Title must be less than 100 characters', 'error')
      handleCancel()
      return
    }

    if (trimmedValue === currentTitle) {
      setIsEditing(false)
      return
    }

    // Optimistic Update
    const previousTitle = currentTitle
    setCurrentTitle(trimmedValue)
    setIsEditing(false)
    setIsSaving(true)

    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmedValue }),
      })

      if (!res.ok) {
        throw new Error('Failed to save title')
      }

      showToast('Title updated successfully')
    } catch (e) {
      // Revert optimistic update
      setCurrentTitle(previousTitle)
      showToast('Failed to update title', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 group max-w-full">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            disabled={isSaving}
            className="font-semibold text-lg bg-white dark:bg-zinc-800 border-2 border-zinc-500 dark:border-zinc-400 rounded px-2 py-1 outline-none w-full max-w-md focus:ring-2 focus:ring-zinc-400"
            aria-label="Edit document title"
          />
        ) : (
          <>
            <h1
              className="font-semibold text-lg cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 px-2 py-1 rounded truncate max-w-[300px] md:max-w-md transition-colors"
              onDoubleClick={handleEdit}
              title="Double-click to rename"
            >
              {currentTitle}
            </h1>
            <button
              onClick={handleEdit}
              disabled={isSaving}
              className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-all focus:opacity-100"
              aria-label="Rename document"
              title="Rename document"
            >
              {isSaving ? (
                <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                '✏️'
              )}
            </button>
          </>
        )}
      </div>

      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 transition-all animate-in fade-in slide-in-from-bottom-2 ${
            toast.type === 'error'
              ? 'bg-red-600 text-white'
              : 'bg-zinc-900 dark:bg-white text-white dark:text-black'
          }`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      )}
    </>
  )
}
