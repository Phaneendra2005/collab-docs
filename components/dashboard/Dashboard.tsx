'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSocket } from '../providers/SocketProvider'
import DocumentList from '@/components/dashboard/DocumentList'
import Avatar from '../ui/Avatar'
import NotificationBell from '../notifications/NotificationBell'

type FilterType = 'all' | 'owner' | 'shared' | 'favorite' | 'archived'
type SortType = 'updatedAt' | 'createdAt' | 'title'

interface Document {
  id: string
  title: string
  icon: string | null
  isFavorite: boolean
  isArchived: boolean
  ownerId: string
  createdAt: string
  updatedAt: string
}

interface DashboardProps {
  userId: string
  userName: string
  userImage?: string
}

export default function Dashboard({ userId, userName, userImage }: DashboardProps) {
  const router = useRouter()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [sort, setSort] = useState<SortType>('updatedAt')
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const { socket } = useSocket()

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchDocuments = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      params.set('sort', sort)
      params.set('filter', filter)
      params.set('limit', '50')

      const res = await fetch(`/api/documents?${params.toString()}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error('Failed to fetch documents')
      const data = await res.json()
      setDocuments(data.data || [])
    } catch (e) {
      setError('Failed to load documents. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [search, sort, filter])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDocuments()
  }, [fetchDocuments])

  useEffect(() => {
    if (!socket) return

    const handleRename = (payload: { documentId: string; title: string }) => {
      setDocuments((prev) =>
        prev.map((doc) => (doc.id === payload.documentId ? { ...doc, title: payload.title } : doc)),
      )
    }

    const handleUpdateShared = async (payload: {
      documentId: string
      action: string
      role?: string
    }) => {
      if (payload.action === 'REMOVED') {
        setDocuments((prev) => prev.filter((doc) => doc.id !== payload.documentId))
      } else if (payload.action === 'INVITED' || payload.action === 'ROLE_CHANGED') {
        try {
          const res = await fetch(`/api/documents/${payload.documentId}`)
          if (res.ok) {
            const data = await res.json()
            setDocuments((prev) => {
              const exists = prev.some((doc) => doc.id === payload.documentId)
              if (exists) {
                return prev.map((doc) => (doc.id === payload.documentId ? data.data : doc))
              } else {
                return [data.data, ...prev]
              }
            })
          }
        } catch (e) {
          // Ignore silent update errors
        }
      }
    }

    socket.on('document:rename', handleRename)
    socket.on('dashboard:update_shared', handleUpdateShared)

    return () => {
      socket.off('document:rename', handleRename)
      socket.off('dashboard:update_shared', handleUpdateShared)
    }
  }, [socket])

  const handleCreate = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled Document' }),
      })
      if (!res.ok) throw new Error('Failed to create document')
      const data = await res.json()
      showToast('Document created')
      router.push(`/documents/${data.data.id}`)
    } catch (e) {
      showToast('Failed to create document', 'error')
    } finally {
      setCreating(false)
    }
  }

  const handleToggleFavorite = async (docId: string, currentValue: boolean) => {
    // Optimistic update
    setDocuments((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, isFavorite: !currentValue } : d)),
    )

    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: !currentValue }),
      })
      if (res.ok) {
        showToast(!currentValue ? 'Added to favorites' : 'Removed from favorites')
      } else {
        throw new Error('Failed to update')
      }
    } catch (e) {
      // Revert optimistic update
      setDocuments((prev) =>
        prev.map((d) => (d.id === docId ? { ...d, isFavorite: currentValue } : d)),
      )
      showToast('Failed to update favorite', 'error')
    }
  }

  const handleToggleArchive = async (docId: string, currentArchived: boolean) => {
    // Optimistic update
    setDocuments((prev) => {
      // If we are looking at "all" or "archived" view, we might want to filter it out or just update state.
      // But typically, if we archive from 'all', it should disappear.
      if (filter === 'all' && !currentArchived) return prev.filter((d) => d.id !== docId)
      if (filter === 'archived' && currentArchived) return prev.filter((d) => d.id !== docId)
      // Otherwise, just toggle the boolean (e.g. if we are in 'owner' or 'shared' tab, wait, archived docs don't show there anyway, but let's toggle it)
      return prev.map((d) => (d.id === docId ? { ...d, isArchived: !currentArchived } : d))
    })

    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: !currentArchived }),
      })
      if (res.ok) {
        showToast(!currentArchived ? 'Document archived' : 'Document unarchived')
      } else {
        throw new Error('Failed to update')
      }
    } catch (e) {
      // Rather than a complex revert, we can just refetch on error to be safe
      fetchDocuments()
      showToast('Failed to archive document', 'error')
    }
  }

  const handleDelete = async (docId: string) => {
    if (deletingId) return
    if (!confirm('Are you sure you want to delete this document? This action cannot be undone.'))
      return

    setDeletingId(docId)
    try {
      const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE' })
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== docId))
        showToast('Document deleted')
      } else {
        throw new Error('Failed to delete')
      }
    } catch (e) {
      showToast('Failed to delete', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const filters: { key: FilterType; label: string; icon: string }[] = [
    { key: 'all', label: 'All Documents', icon: '📄' },
    { key: 'owner', label: 'My Documents', icon: '👤' },
    { key: 'shared', label: 'Shared with Me', icon: '🤝' },
    { key: 'favorite', label: 'Favorites', icon: '⭐' },
    { key: 'archived', label: 'Archived', icon: '📦' },
  ]

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Sidebar */}
      <aside
        className="w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col"
        role="navigation"
        aria-label="Sidebar"
      >
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h1 className="text-lg font-bold tracking-tight">CollabDocs</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Collaborative Documents</p>
        </div>

        <nav className="flex-1 p-3 flex flex-col gap-1">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${filter === f.key ? 'bg-zinc-100 dark:bg-zinc-800 text-black dark:text-white font-medium' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
              aria-current={filter === f.key ? 'page' : undefined}
            >
              <span>{f.icon}</span>
              {f.label}
            </button>
          ))}
        </nav>

        {/* User Section */}
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3 px-3 py-2">
            <Avatar
              src={userImage}
              alt={userName}
              fallbackText={userName || 'U'}
              size={32}
              className="bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{userName}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="p-4 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 flex flex-col gap-2">
          <p>
            Developed by{' '}
            <span className="font-medium text-zinc-900 dark:text-zinc-100">Phaneendra Kanduri</span>
          </p>
          <nav className="flex items-center gap-3" aria-label="Author links">
            <a
              href="https://github.com/Phaneendra2005"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-900 dark:hover:text-white transition-colors flex items-center gap-1"
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
              </svg>
              GitHub
            </a>
            <a
              href="https://www.linkedin.com/in/phaneendra-kanduri/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-900 dark:hover:text-white transition-colors flex items-center gap-1"
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
                <rect x="2" y="9" width="4" height="12"></rect>
                <circle cx="4" cy="4" r="2"></circle>
              </svg>
              LinkedIn
            </a>
          </nav>
        </footer>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden" role="main">
        {/* Top Bar */}
        <header className="flex items-center gap-4 p-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <div className="flex-1 relative">
            <input
              type="search"
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-md px-4 py-2 pl-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600 transition-shadow"
              aria-label="Search documents"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">
              🔍
            </span>
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortType)}
            className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm focus:outline-none"
            aria-label="Sort documents"
          >
            <option value="updatedAt">Last Modified</option>
            <option value="createdAt">Date Created</option>
            <option value="title">Title A-Z</option>
          </select>

          <NotificationBell userId={userId} />

          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-black text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {creating ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <span>+</span>
            )}
            New Document
          </button>
        </header>

        {/* Document List */}
        <div className="flex-1 overflow-y-auto p-6">
          {error ? (
            <div className="flex flex-col items-center justify-center h-full gap-4" role="alert">
              <div className="text-4xl">⚠️</div>
              <p className="text-zinc-600 dark:text-zinc-400">{error}</p>
              <button
                onClick={fetchDocuments}
                className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : loading ? (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              role="status"
              aria-label="Loading documents"
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 animate-pulse"
                >
                  <div className="h-5 w-3/4 bg-zinc-200 dark:bg-zinc-800 rounded mb-3" />
                  <div className="h-4 w-1/2 bg-zinc-100 dark:bg-zinc-800/50 rounded" />
                </div>
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="text-6xl opacity-50">📝</div>
              <h2 className="text-lg font-semibold text-zinc-700 dark:text-zinc-300">
                {filter === 'all'
                  ? 'No documents yet'
                  : `No ${filters.find((f) => f.key === filter)?.label.toLowerCase() || 'documents'}`}
              </h2>
              <p className="text-sm text-zinc-500 max-w-sm text-center">
                {filter === 'all'
                  ? 'Create your first document to get started with real-time collaboration.'
                  : 'Documents matching this filter will appear here.'}
              </p>
              {filter === 'all' && (
                <button
                  onClick={handleCreate}
                  className="mt-2 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-black text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                >
                  Create Document
                </button>
              )}
            </div>
          ) : (
            <DocumentList
              documents={documents}
              userId={userId}
              deletingId={deletingId}
              onOpen={(id: string) => router.push(`/documents/${id}`)}
              onToggleFavorite={handleToggleFavorite}
              onToggleArchive={handleToggleArchive}
              onDelete={handleDelete}
            />
          )}
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 transition-all animate-in fade-in slide-in-from-bottom-2 ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-zinc-900 dark:bg-white text-white dark:text-black'}`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
