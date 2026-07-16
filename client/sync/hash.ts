/**
 * Cryptographic Hashing Service
 * Uses native Web Crypto API (SubtleCrypto)
 *
 * Time Complexity: O(N) where N is payload length
 * Space Complexity: O(N) for string and buffer allocations
 */
export async function generateSHA256(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const dataBuffer = encoder.encode(data)
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function hashOperation(payload: any): Promise<string> {
  const deterministicStringify = (obj: any): string => {
    if (obj === null) return 'null'
    if (typeof obj !== 'object') return JSON.stringify(obj)
    if (Array.isArray(obj)) return `[${obj.map(deterministicStringify).join(',')}]`
    const keys = Object.keys(obj).sort()
    const parts = keys.map((k) => `"${k}":${deterministicStringify(obj[k])}`)
    return `{${parts.join(',')}}`
  }

  const serialized = deterministicStringify(payload)
  return generateSHA256(serialized)
}
