import { getNotifications, createNotification } from '@/server/controllers/notification.controller'
import { NextRequest } from 'next/server'
import { apiHandler } from '@/server/middlewares/api-handler'

export const GET = apiHandler(async (req: NextRequest) => getNotifications(req))

export const POST = apiHandler(async (req: NextRequest) => createNotification(req))
