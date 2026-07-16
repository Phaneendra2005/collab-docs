import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react'

interface MentionListProps {
  items: any[]
  command: (item: any) => void
}

export const MentionList = forwardRef((props: MentionListProps, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const selectItem = (index: number) => {
    const item = props.items[index]
    if (item) {
      props.command({ id: item.id, label: item.name || item.email })

      // Notify backend of the new mention directly when selected
      // We extract documentId from the URL pathname
      const pathParts = window.location.pathname.split('/')
      const docId = pathParts[pathParts.length - 1]
      if (docId) {
        fetch(`/api/documents/${docId}/mentions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mentionedUserId: item.id }),
        }).catch(() => {})
      }
    }
  }

  const upHandler = () => {
    setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length)
  }

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length)
  }

  const enterHandler = () => {
    selectItem(selectedIndex)
  }

  useEffect(() => setSelectedIndex(0), [props.items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        upHandler()
        return true
      }

      if (event.key === 'ArrowDown') {
        downHandler()
        return true
      }

      if (event.key === 'Enter') {
        enterHandler()
        return true
      }

      return false
    },
  }))

  if (!props.items.length) {
    return (
      <div className="bg-white dark:bg-zinc-900 shadow-lg rounded-md border border-zinc-200 dark:border-zinc-800 p-2 text-sm text-zinc-500">
        No results
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-zinc-900 shadow-lg rounded-md border border-zinc-200 dark:border-zinc-800 overflow-hidden min-w-[200px]">
      {props.items.map((item, index) => (
        <button
          className={`w-full text-left px-4 py-2 text-sm transition-colors ${
            index === selectedIndex
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium'
              : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
          }`}
          key={item.id}
          onClick={() => selectItem(index)}
        >
          {item.name || item.email}
        </button>
      ))}
    </div>
  )
})

MentionList.displayName = 'MentionList'
