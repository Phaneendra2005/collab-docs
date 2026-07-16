'use client'

import { useState } from 'react'

interface AIFeaturesProps {
  documentId: string
  getSelectedText: () => string
  getFullText: () => string
  onInsertText: (text: string) => void
  onReplaceSelection: (text: string) => void
}

type AIAction = 'summarize' | 'rewrite' | 'grammar' | 'continue' | 'title'

export default function AIFeatures({
  documentId,
  getSelectedText,
  getFullText,
  onInsertText,
  onReplaceSelection,
}: AIFeaturesProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [currentAction, setCurrentAction] = useState<AIAction | null>(null)

  const actions: { key: AIAction; label: string; icon: string; description: string }[] = [
    { key: 'summarize', label: 'Summarize', icon: '📝', description: 'Summarize the document' },
    { key: 'rewrite', label: 'Rewrite', icon: '✏️', description: 'Rewrite selected text' },
    { key: 'grammar', label: 'Fix Grammar', icon: '🔤', description: 'Fix grammar & spelling' },
    { key: 'continue', label: 'Continue Writing', icon: '➡️', description: 'Continue from cursor' },
    { key: 'title', label: 'Generate Title', icon: '💡', description: 'Suggest a document title' },
  ]

  const handleAction = async (action: AIAction) => {
    setCurrentAction(action)
    setLoading(true)
    setResult(null)

    const text =
      action === 'summarize' || action === 'title'
        ? getFullText()
        : getSelectedText() || getFullText()

    if (!text.trim()) {
      setResult('No text available. Please write something first.')
      setLoading(false)
      return
    }

    try {
      const res = await fetch(`/api/documents/${documentId}/ai/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })

      if (!res.ok) {
        const err = await res.json()
        setResult(`Error: ${err.error || 'Something went wrong'}`)
        setLoading(false)
        return
      }

      const data = await res.json()
      setResult(data.result)
    } catch (e) {
      setResult('Failed to connect to AI service. Please check your API key configuration.')
    } finally {
      setLoading(false)
    }
  }

  const handleApply = () => {
    if (!result || !currentAction) return
    if (currentAction === 'summarize') {
      onInsertText(result)
    } else if (currentAction === 'continue') {
      onInsertText(result)
    } else if (currentAction === 'title') {
      // Title is handled differently - user copies manually
    } else {
      onReplaceSelection(result)
    }
    setResult(null)
    setCurrentAction(null)
    setIsOpen(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors text-zinc-600 dark:text-zinc-400 flex items-center gap-1"
        title="AI Features"
      >
        <span className="text-sm">✨</span>
        <span>AI</span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-80 max-h-[80vh] flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
            <h3 className="text-sm font-semibold">AI Assistant</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Select an action to enhance your document
            </p>
          </div>

          <div className="p-2 flex flex-col gap-1 shrink-0">
            {actions.map((action) => (
              <button
                key={action.key}
                onClick={() => handleAction(action.key)}
                disabled={loading}
                className="flex items-center gap-3 p-2.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left disabled:opacity-50"
              >
                <span className="text-lg">{action.icon}</span>
                <div>
                  <div className="text-sm font-medium">{action.label}</div>
                  <div className="text-xs text-zinc-500">{action.description}</div>
                </div>
              </button>
            ))}
          </div>

          {loading && (
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <div className="animate-spin h-4 w-4 border-2 border-zinc-400 border-t-transparent rounded-full" />
                Processing...
              </div>
            </div>
          )}

          {result && !loading && (
            <div className="flex flex-col shrink-0 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 w-full">
              <div className="p-3">
                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                  AI Response
                </div>
                <div className="h-[60px] overflow-y-auto rounded-md border border-zinc-200 bg-zinc-50 dark:bg-zinc-800 dark:border-zinc-700 p-2">
                  <p className="text-sm whitespace-pre-wrap break-words">{result}</p>
                </div>
              </div>
              <div className="border-t border-zinc-100 dark:border-zinc-800 py-2 px-3 flex justify-start gap-2 flex-nowrap overflow-hidden">
                <button
                  onClick={() => {
                    setResult(null)
                    setCurrentAction(null)
                  }}
                  className="text-xs px-2 py-1.5 rounded text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex-shrink-0"
                >
                  Dismiss
                </button>
                {currentAction !== 'title' && (
                  <button
                    onClick={handleApply}
                    className="text-xs px-2 py-1.5 rounded bg-zinc-900 dark:bg-white text-white dark:text-black font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors flex-shrink-0"
                  >
                    {currentAction === 'summarize' || currentAction === 'continue'
                      ? 'Insert'
                      : 'Replace'}
                  </button>
                )}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(result)
                  }}
                  className="text-xs px-2 py-1.5 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors flex-shrink-0"
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
