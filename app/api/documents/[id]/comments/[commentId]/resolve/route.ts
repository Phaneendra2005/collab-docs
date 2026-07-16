import { resolveComment } from '@/server/controllers/comment.controller'
import { NextRequest } from 'next/server'
import { apiHandler } from '@/server/middlewares/api-handler'

export const PATCH = apiHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string; commentId: string }> }) => {
    const p = await params
    console.log('ENTER ROUTE', req.method, p)
    return resolveComment(req, { params: p })
  },
)
