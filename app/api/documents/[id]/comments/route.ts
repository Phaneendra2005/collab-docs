export const dynamic = 'force-dynamic'
import { getComments, createComment } from '@/server/controllers/comment.controller'
import { NextRequest } from 'next/server'
import { apiHandler } from '@/server/middlewares/api-handler'

export const GET = apiHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const p = await params
    console.log('ENTER ROUTE', req.method, p)
    return getComments(req, { params: p })
  },
)

export const POST = apiHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const p = await params
    console.log('ENTER ROUTE', req.method, p)
    return createComment(req, { params: p })
  },
)
