'use client'

import { useState, useEffect, useCallback } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

interface Snapshot {
  id: string
  versionNum: number
  metadata: any
  createdBy: string
  createdAt: string
}

interface VersionHistoryProps {
  documentId: string
  onRestore: (snapshotContent: string) => void
  onClose: () => void
  onSaveVersion?: () => Promise<void>
}

export default function VersionHistory({
  documentId,
  onRestore,
  onClose,
  onSaveVersion,
}: VersionHistoryProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null)
  const [snapshotContent, setSnapshotContent] = useState<string | null>(null)

  const previewEditor = useEditor({
    editable: false,
    extensions: [StarterKit],
    content: '',
    editorProps: {
      attributes: {
        class:
          'prose prose-sm sm:prose-base dark:prose-invert focus:outline-none min-h-[300px] max-w-none px-4 py-4',
      },
    },
  })

  const fetchSnapshots = useCallback(
    async (pageNum: number, isInitial = false) => {
      try {
        if (!isInitial) setLoadingMore(true)
        const res = await fetch(`/api/documents/${documentId}/snapshots?page=${pageNum}&limit=20`)
        if (res.ok) {
          const data = await res.json()
          setSnapshots((prev) => (isInitial ? data.snapshots : [...prev, ...data.snapshots]))
          setHasMore(data.pagination.page < data.pagination.totalPages)
        }
      } catch (e) {
        console.error('Failed to fetch snapshots', e)
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [documentId],
  )

  useEffect(() => {
    const loadSnapshots = async () => {
      await fetchSnapshots(1, true)
    }
    loadSnapshots()
  }, [fetchSnapshots])

  const fetchSnapshotContent = useCallback(async () => {
    if (!selectedSnapshot) {
      setSnapshotContent(null)
      if (previewEditor) previewEditor.commands.setContent('')
      return
    }
    try {
      const res = await fetch(`/api/documents/${documentId}/snapshots/${selectedSnapshot}`)
      if (res.ok) {
        const data = await res.json()
        setSnapshotContent(data.snapshot.snapshot) // Assuming snapshot.snapshot contains the JSON string
        if (previewEditor) {
          try {
            previewEditor.commands.setContent(JSON.parse(data.snapshot.snapshot))
          } catch (e) {
            previewEditor.commands.setContent(data.snapshot.snapshot)
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch snapshot content', e)
    }
  }, [selectedSnapshot, documentId, previewEditor])

  useEffect(() => {
    const loadSnapshotContent = async () => {
      await fetchSnapshotContent()
    }
    loadSnapshotContent()
  }, [fetchSnapshotContent])

  const handleSaveVersion = async () => {
    try {
      // For this implementation, we can just grab the current editor content
      // by triggering a parent callback or using the TipTapEditor instance.
      // But since we don't have direct access to the live editor content here,
      // we can ask the parent to provide it!
      if (onSaveVersion) {
        setLoading(true)
        await onSaveVersion()
        // Refresh snapshots
        const res = await fetch(`/api/documents/${documentId}/snapshots`)
        if (res.ok) {
          const data = await res.json()
          setSnapshots(data.snapshots)
        }
        setLoading(false)
      }
    } catch (e) {
      console.error(e)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 shadow-xl flex flex-col z-50">
      <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">Version History</h2>
        <div className="flex items-center gap-2">
          {onSaveVersion && (
            <button
              onClick={handleSaveVersion}
              className="text-xs bg-zinc-900 dark:bg-white text-white dark:text-black px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
            >
              Save Now
            </button>
          )}
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-black dark:hover:text-white px-2 py-1"
          >
            &times; Close
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 border-b border-zinc-200 dark:border-zinc-800">
        {loading ? (
          <div className="animate-pulse text-zinc-500">Loading history...</div>
        ) : snapshots.length === 0 ? (
          <div className="text-zinc-500">No versions found.</div>
        ) : (
          <>
            {snapshots.map((snap) => (
              <div
                key={snap.id}
                onClick={() => setSelectedSnapshot(snap.id)}
                className={`p-3 rounded border cursor-pointer transition-colors ${selectedSnapshot === snap.id ? 'border-zinc-500 bg-zinc-100 dark:bg-zinc-800' : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900'}`}
              >
                <div className="font-medium text-sm">Version {snap.versionNum}</div>
                <div className="text-xs text-zinc-500">
                  {new Date(snap.createdAt).toLocaleString()}
                </div>
                <div className="text-xs text-zinc-400 mt-1 truncate">By {snap.createdBy}</div>
              </div>
            ))}
            {hasMore && (
              <button
                onClick={() => {
                  const nextPage = page + 1
                  setPage(nextPage)
                  fetchSnapshots(nextPage)
                }}
                disabled={loadingMore}
                className="w-full py-2 text-sm text-zinc-600 bg-zinc-100 hover:bg-zinc-200 dark:text-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded transition-colors disabled:opacity-50"
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            )}
          </>
        )}
      </div>

      {selectedSnapshot && (
        <div className="h-1/2 flex flex-col bg-zinc-50 dark:bg-zinc-900">
          <div className="p-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800 flex justify-between items-center">
            <span className="text-xs font-semibold">Preview</span>
            <button
              onClick={() => {
                if (snapshotContent) onRestore(snapshotContent)
              }}
              className="text-xs bg-zinc-900 dark:bg-white text-white dark:text-black px-3 py-1.5 rounded font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
            >
              Restore this version
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <EditorContent editor={previewEditor} />
          </div>
        </div>
      )}
    </div>
  )
}
