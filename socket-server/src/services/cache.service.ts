export class CacheService<T> {
  private cache: Map<string, { value: T; expiresAt: number }> = new Map()

  get(key: string): T | null {
    const item = this.cache.get(key)
    if (!item) return null
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key)
      return null
    }
    return item.value
  }

  set(key: string, value: T, ttlMs: number) {
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  delete(key: string) {
    this.cache.delete(key)
  }
}

export const permissionCache = new CacheService<'VIEWER' | 'EDITOR' | 'OWNER'>()
export const documentRoomCache = new CacheService<any>()

import { PresenceBroadcastType } from '../types/events'
export const userPresenceCache = new CacheService<PresenceBroadcastType>()
