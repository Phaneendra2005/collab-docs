'use client'
import { useEffect, useState, useRef } from 'react'
import TipTapEditor from '@/components/editor/TipTapEditor'
import VersionHistory from '@/components/document/VersionHistory'

export default function EditorWrapper({
  documentId,
  actorId,
  editable,
  role,
}: {
  documentId: string
  actorId: string
  editable: boolean
  role: 'OWNER' | 'EDITOR' | 'VIEWER'
}) {
  const [token, setToken] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const editorRef = useRef<any>(null)

  useEffect(() => {
    // Fetch a real token from a new auth endpoint.
    // We will create /api/auth/socket-token to generate this securely.
    fetch('/api/auth/socket-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.token) {
          setToken(data.token)
        }
      })
      .catch((err) => console.error('Failed to get socket token', err))
  }, [documentId])

  const handleRestore = (content: string) => {
    if (editorRef.current) {
      window.dispatchEvent(new CustomEvent('sync:restore', { detail: content }))
    }
    setShowHistory(false)
  }

  const handleSaveVersion = async () => {
    if (editorRef.current) {
      const content = JSON.stringify(editorRef.current.getJSON())
      try {
        await fetch(`/api/documents/${documentId}/snapshots`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ snapshot: content }),
        })
      } catch (e) {
        console.error('Failed to save version', e)
      }
    }
  }

  return (
    <div className="relative w-full h-full flex min-w-0">
      <div className="flex-1 min-w-0">
        <TipTapEditor
          documentId={documentId}
          actorId={actorId}
          token={token || undefined}
          editable={editable}
          role={role}
          onOpenHistory={() => setShowHistory(true)}
          editorRef={editorRef}
        />
      </div>
      {showHistory && (
        <VersionHistory
          documentId={documentId}
          onRestore={handleRestore}
          onClose={() => setShowHistory(false)}
          onSaveVersion={handleSaveVersion}
        />
      )}
    </div>
  )
}
