import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '../database/db'
import { auth } from '../../auth'
import { AuthenticationError, NotFoundError } from '../errors'
import { SuccessResponse } from '../responses'
import { NotificationService } from '../services/notification.service'
import { z } from 'zod'
import { validateBody } from '../middlewares/validate-request'

const CreateNotificationSchema = z.object({
  userId: z.string(),
  title: z.string(),
  body: z.string(),
  type: z.enum(['COMMENT', 'MENTION', 'SHARE', 'ROLE_CHANGE', 'ACCESS_REVOKED']),
  link: z.string().optional(),
})

// We use NotificationService directly instead of duplicating webhook logic here.

export async function getNotifications(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) throw new AuthenticationError()

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 50, // Limit to latest 50 notifications
  })

  return SuccessResponse(notifications)
}

export async function createNotification(req: NextRequest) {
  // This route is typically called internally, but we can expose it if protected
  const session = await auth()
  if (!session?.user?.id) throw new AuthenticationError()

  const data = await validateBody(req, CreateNotificationSchema)

  const notification = await NotificationService.create({
    userId: data.userId,
    title: data.title,
    body: data.body,
    type: data.type as any,
    link: data.link,
  })

  return SuccessResponse(notification)
}

export async function markAsRead(req: NextRequest, { params }: { params: any }) {
  const session = await auth()
  if (!session?.user?.id) throw new AuthenticationError()
  const { id } = await params

  const notification = await prisma.notification.findUnique({ where: { id } })
  if (!notification || notification.userId !== session.user.id) {
    throw new NotFoundError('Notification not found')
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: { isRead: true },
  })

  await NotificationService.triggerWebhook('READ', session.user.id, { id })

  return SuccessResponse(updated)
}

export async function markAllAsRead(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) throw new AuthenticationError()

  await prisma.notification.updateMany({
    where: { userId: session.user.id, isRead: false },
    data: { isRead: true },
  })

  await NotificationService.triggerWebhook('READ', session.user.id, { all: true })

  return SuccessResponse({ success: true })
}

export async function deleteNotification(req: NextRequest, { params }: { params: any }) {
  const session = await auth()
  if (!session?.user?.id) throw new AuthenticationError()
  const { id } = await params

  const notification = await prisma.notification.findUnique({ where: { id } })
  if (!notification || notification.userId !== session.user.id) {
    throw new NotFoundError('Notification not found')
  }

  await prisma.notification.delete({ where: { id } })

  await NotificationService.triggerWebhook('DELETED', session.user.id, { id })

  return SuccessResponse({ success: true })
}
