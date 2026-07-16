'use client'

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

interface DocumentListProps {
  documents: Document[]
  userId: string
  deletingId: string | null
  onOpen: (id: string) => void
  onToggleFavorite: (id: string, current: boolean) => void
  onToggleArchive: (id: string, current: boolean) => void
  onDelete: (id: string) => void
}

export default function DocumentList({
  documents,
  userId,
  deletingId,
  onOpen,
  onToggleFavorite,
  onToggleArchive,
  onDelete,
}: DocumentListProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {documents.map((doc) => (
        <article
          key={doc.id}
          className="group relative rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all cursor-pointer overflow-hidden"
          onClick={() => onOpen(doc.id)}
          tabIndex={0}
          role="button"
          aria-label={`Open ${doc.title}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onOpen(doc.id)
          }}
        >
          {/* Card Header */}
          <div className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">{doc.icon || '📄'}</span>
                <h3 className="font-medium text-sm truncate max-w-[180px]">{doc.title}</h3>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleFavorite(doc.id, doc.isFavorite)
                }}
                className={`p-1 rounded transition-colors ${doc.isFavorite ? 'text-yellow-500' : 'text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100'}`}
                aria-label={doc.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                title={doc.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                {doc.isFavorite ? '★' : '☆'}
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span>{formatDate(doc.updatedAt)}</span>
              <span>·</span>
              <span>{doc.ownerId === userId ? 'You' : 'Shared'}</span>
            </div>
          </div>

          {/* Card Actions (visible on hover) */}
          <div className="absolute top-2 right-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {doc.isArchived ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleArchive(doc.id, true)
                }}
                className="p-1 rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                title="Unarchive"
                aria-label="Unarchive document"
              >
                📤
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleArchive(doc.id, false)
                }}
                className="p-1 rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                title="Archive"
                aria-label="Archive document"
              >
                📦
              </button>
            )}

            {doc.ownerId === userId && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(doc.id)
                }}
                disabled={deletingId === doc.id}
                className="p-1 rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 transition-colors disabled:opacity-50"
                title="Delete"
                aria-label="Delete document"
              >
                {deletingId === doc.id ? (
                  <div className="w-3 h-3 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
                ) : (
                  '🗑️'
                )}
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}
