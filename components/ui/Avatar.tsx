'use client'

import { useState } from 'react'
import Image from 'next/image'

interface AvatarProps {
  src?: string | null
  alt?: string
  fallbackText: string
  size?: number
  className?: string
  style?: React.CSSProperties
}

export default function Avatar({
  src,
  alt = 'Avatar',
  fallbackText,
  size = 32,
  className = '',
  style = {},
}: AvatarProps) {
  const [error, setError] = useState(false)

  const showFallback = !src || error

  if (showFallback) {
    const initials = fallbackText.substring(0, 1).toUpperCase()
    return (
      <div
        className={`flex items-center justify-center font-bold text-white shadow-sm shrink-0 overflow-hidden ${className}`}
        style={{ width: size, height: size, borderRadius: '9999px', ...style }}
        title={alt}
      >
        {initials}
      </div>
    )
  }

  return (
    <div
      className={`relative shrink-0 overflow-hidden ${className}`}
      style={{ width: size, height: size, borderRadius: '9999px', ...style }}
      title={alt}
    >
      <Image
        src={src as string}
        alt={alt}
        fill
        className="object-cover"
        onError={() => setError(true)}
        unoptimized // In case it's an external URL that fails optimization
      />
    </div>
  )
}
