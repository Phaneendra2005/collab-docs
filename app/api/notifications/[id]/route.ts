import { markAsRead, deleteNotification } from '@/server/controllers/notification.controller'
import { NextRequest } from 'next/server'
import { apiHandler } from '@/server/middlewares/api-handler'

export const PATCH = apiHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const p = await params
    return markAsRead(req, { params: p })
  },
)

export const DELETE = apiHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const p = await params
    return deleteNotification(req, { params: p })
  },
)
