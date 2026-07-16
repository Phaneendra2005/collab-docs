import { updateComment, deleteComment } from '@/server/controllers/comment.controller'
import { NextRequest } from 'next/server'
import { apiHandler } from '@/server/middlewares/api-handler'

export const PATCH = apiHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string; commentId: string }> }) => {
    const p = await params
    console.log('ENTER ROUTE', req.method, p)
    return updateComment(req, { params: p })
  },
)

export const DELETE = apiHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string; commentId: string }> }) => {
    const p = await params
    console.log('ENTER ROUTE', req.method, p)
    return deleteComment(req, { params: p })
  },
)
