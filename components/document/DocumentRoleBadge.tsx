'use client'

import { useState, useEffect } from 'react'

interface DocumentRoleBadgeProps {
  initialRole: 'OWNER' | 'EDITOR' | 'VIEWER'
}

export default function DocumentRoleBadge({ initialRole }: DocumentRoleBadgeProps) {
  const [role, setRole] = useState(initialRole)

  useEffect(() => {
    const handleRoleSync = (e: Event) => {
      const customEvent = e as CustomEvent<string>
      setRole(customEvent.detail as any)
    }

    window.addEventListener('sync:document:role', handleRoleSync)
    return () => {
      window.removeEventListener('sync:document:role', handleRoleSync)
    }
  }, [])

  return (
    <span className="text-xs font-semibold px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 capitalize transition-colors duration-200">
      Role: {role.toLowerCase()}
    </span>
  )
}
