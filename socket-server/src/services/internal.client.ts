import { SocketLogger } from '../logger/socket.logger'

const NEXT_API_URL = process.env.NEXT_API_URL || 'http://127.0.0.1:3000/api/internal'
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'dev-token'

export class InternalServiceClient {
  static async getDocumentRole(
    userId: string,
    documentId: string,
  ): Promise<'VIEWER' | 'EDITOR' | 'OWNER' | null> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(
          `${NEXT_API_URL}/roles?userId=${userId}&documentId=${documentId}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${INTERNAL_SERVICE_TOKEN}`,
            },
            signal: AbortSignal.timeout(5000),
          },
        )
        if (!response.ok) {
          throw new Error(`Internal API returned ${response.status}`)
        }
        const data = (await response.json()) as any
        return data.role || null
      } catch (e: any) {
        if (attempt === 3) {
          SocketLogger.error('Internal API getDocumentRole failed', {
            error: e.message,
            userId,
            documentId,
          })
          return null // Fail closed: reject mutation requests if API is down
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
      }
    }
    return null
  }

  static async getMissingOperations(documentId: string, lastLamportClock: number): Promise<any[]> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(
          `${NEXT_API_URL}/operations?documentId=${documentId}&afterClock=${lastLamportClock}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${INTERNAL_SERVICE_TOKEN}`,
            },
            signal: AbortSignal.timeout(5000),
          },
        )
        if (!response.ok) {
          throw new Error(`Internal API returned ${response.status}`)
        }
        const data = (await response.json()) as any
        return data.operations || []
      } catch (e: any) {
        if (attempt === 3) {
          SocketLogger.error('Internal API getMissingOperations failed', {
            error: e.message,
            documentId,
          })
          return []
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
      }
    }
    return []
  }

  static async persistOperations(documentId: string, operations: any[]): Promise<boolean> {
    try {
      const response = await fetch(`${NEXT_API_URL}/operations/batch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${INTERNAL_SERVICE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documentId, operations }),
        signal: AbortSignal.timeout(5000),
      })
      SocketLogger.info(`Internal API persistOperations response status: ${response.status}`)
      return response.ok
    } catch (e: any) {
      SocketLogger.error('Internal API persistOperations failed', { error: e.message, documentId })
      return false
    }
  }
}
