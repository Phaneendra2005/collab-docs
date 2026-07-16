import { markAllAsRead } from '@/server/controllers/notification.controller'
import { NextRequest } from 'next/server'
import { apiHandler } from '@/server/middlewares/api-handler'

export const PATCH = apiHandler(async (req: NextRequest) => markAllAsRead(req))
