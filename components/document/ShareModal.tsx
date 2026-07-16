import { useState, useEffect, useCallback } from 'react'
import Avatar from '../ui/Avatar'

interface User {
  id: string
  name: string | null
  email: string
  image: string | null
}

export interface Collaborator extends User {
  role: 'OWNER' | 'EDITOR' | 'VIEWER'
}

interface ShareModalProps {
  documentId: string
  isOpen: boolean
  onClose: () => void
}

export default function ShareModal({ documentId, isOpen, onClose }: ShareModalProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'EDITOR' | 'VIEWER'>('EDITOR')
  const [isInviting, setIsInviting] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const fetchCollaborators = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}/collaborators`)
      const data = await res.json()
      if (res.ok) {
        setCollaborators(data.data)
      } else {
        showToast(data.error || 'Failed to fetch collaborators', 'error')
      }
    } catch (error) {
      showToast('An error occurred', 'error')
    } finally {
      setLoading(false)
    }
  }, [documentId, showToast])

  useEffect(() => {
    if (isOpen) {
      const loadCollaborators = async () => {
        await fetchCollaborators()
      }
      loadCollaborators()
    }
  }, [isOpen, fetchCollaborators])

  useEffect(() => {
    if (!isOpen) return
    const handleCollaboratorsUpdated = () => {
      fetchCollaborators()
    }
    window.addEventListener('sync:document:collaborators', handleCollaboratorsUpdated)
    return () => {
      window.removeEventListener('sync:document:collaborators', handleCollaboratorsUpdated)
    }
  }, [isOpen, fetchCollaborators])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return

    setIsInviting(true)
    try {
      const res = await fetch(`/api/documents/${documentId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      const data = await res.json()
      if (res.ok) {
        setInviteEmail('')
        showToast('Collaborator invited successfully', 'success')
        // Let the socket webhook refresh the list, but we can also manually refresh
        fetchCollaborators()
      } else {
        showToast(data.error || 'Failed to invite collaborator', 'error')
      }
    } catch (error) {
      showToast('An error occurred', 'error')
    } finally {
      setIsInviting(false)
    }
  }

  const handleRemove = async (userId: string) => {
    try {
      const res = await fetch(`/api/documents/${documentId}/share/${userId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        showToast(data.error || 'Failed to remove collaborator', 'error')
      } else {
        fetchCollaborators()
      }
    } catch (error) {
      showToast('An error occurred', 'error')
    }
  }

  const handleChangeRole = async (userId: string, newRole: 'EDITOR' | 'VIEWER') => {
    try {
      const res = await fetch(`/api/documents/${documentId}/share/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      if (!res.ok) {
        const data = await res.json()
        showToast(data.error || 'Failed to update role', 'error')
      } else {
        fetchCollaborators()
      }
    } catch (error) {
      showToast('An error occurred', 'error')
    }
  }

  const copyLink = () => {
    const url = `${window.location.origin}/documents/${documentId}`
    navigator.clipboard.writeText(url)
    showToast('Link copied to clipboard', 'success')
  }

  if (!isOpen) return null

  const owner = collaborators.find((c) => c.role === 'OWNER')
  const others = collaborators.filter((c) => c.role !== 'OWNER')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-zinc-200 dark:border-zinc-800">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              Share Document
            </h2>
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              ✕
            </button>
          </div>

          {toast && (
            <div
              className={`mb-4 p-3 rounded text-sm ${toast.type === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}
            >
              {toast.message}
            </div>
          )}

          <form onSubmit={handleInvite} className="flex gap-2 mb-8">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Add people via email"
              className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isInviting}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as any)}
              className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isInviting}
            >
              <option value="EDITOR">Editor</option>
              <option value="VIEWER">Viewer</option>
            </select>
            <button
              type="submit"
              disabled={isInviting || !inviteEmail.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
            >
              Invite
            </button>
          </form>

          <div className="space-y-4">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              People with access
            </h3>

            {loading ? (
              <div className="flex justify-center p-4">
                <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
              </div>
            ) : (
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {owner && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar
                        src={owner.image}
                        alt={owner.name || 'Owner'}
                        fallbackText={owner.name || owner.email || 'O'}
                        size={32}
                      />
                      <div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {owner.name} <span className="text-xs text-zinc-500 ml-1">(You)</span>
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{owner.email}</p>
                      </div>
                    </div>
                    <span className="text-sm text-zinc-500 dark:text-zinc-400 pr-2">Owner</span>
                  </div>
                )}

                {others.map((c) => (
                  <div key={c.id} className="flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <Avatar
                        src={c.image}
                        alt={c.name || 'User'}
                        fallbackText={c.name || c.email || 'U'}
                        size={32}
                      />
                      <div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {c.name || c.email.split('@')[0]}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{c.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={c.role}
                        onChange={(e) =>
                          handleChangeRole(c.id, e.target.value as 'EDITOR' | 'VIEWER')
                        }
                        className="text-sm bg-transparent border-none text-zinc-700 dark:text-zinc-300 focus:ring-0 cursor-pointer"
                      >
                        <option value="EDITOR">Editor</option>
                        <option value="VIEWER">Viewer</option>
                      </select>
                      <button
                        onClick={() => handleRemove(c.id)}
                        className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 px-2 py-1 transition-opacity"
                        title="Remove access"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}

                {others.length === 0 && (
                  <p className="text-sm text-zinc-500 text-center py-2">No other collaborators.</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
          <button
            onClick={copyLink}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
          >
            <span>🔗</span> Copy link
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-900 dark:text-zinc-100 rounded-lg font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
