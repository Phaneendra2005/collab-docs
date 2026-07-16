import { NextRequest } from 'next/server'
import { handleApiError } from '../../utils/api-error-handler'

export function apiHandler(handler: (req: NextRequest, ctx: any) => Promise<any>) {
  return async (req: NextRequest, ctx: any) => {
    try {
      return await handler(req, ctx)
    } catch (error) {
      return handleApiError(error)
    }
  }
}
