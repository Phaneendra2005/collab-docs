import { prisma } from '../database/db'

export type NotificationType =
  | 'COMMENT_ADDED'
  | 'COMMENT_REPLY'
  | 'COMMENT_EDITED'
  | 'COMMENT_DELETED'
  | 'COMMENT_RESOLVED'
  | 'COMMENT_REOPENED'
  | 'INVITED'
  | 'REMOVED'
  | 'ROLE_CHANGED'
  | 'MENTION'
  | 'RESTORED'

export interface CreateNotificationParams {
  userId: string // The recipient
  type: NotificationType
  title: string
  body: string
  link?: string
}

export class NotificationService {
  /**
   * Creates a notification, saves it to the database, and broadcasts it via sockets.
   * This MUST be the only way notifications are generated in the application.
   */
  static async create(params: CreateNotificationParams) {
    try {
      // 1. Save to Database
      const notification = await prisma.notification.create({
        data: {
          userId: params.userId,
          title: params.title,
          body: params.body,
          type: params.type,
          link: params.link,
        },
      })

      // 2. Broadcast via Sockets
      await this.triggerWebhook('CREATED', params.userId, notification)

      return notification
    } catch (error) {
      console.error('NotificationService.create failed', error)
      // We don't throw here to prevent failing the primary business logic
      // (e.g., don't fail a comment creation just because notification failed)
      return null
    }
  }

  static async triggerWebhook(
    action: 'CREATED' | 'READ' | 'DELETED',
    userId: string,
    payload?: any,
  ) {
    try {
      const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:4000'
      await fetch(`${socketUrl}/api/broadcast/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || 'dev-token'}`,
        },
        body: JSON.stringify({ userId, action, payload }),
        signal: AbortSignal.timeout(5000),
      })
    } catch (error) {
      console.error('Failed to broadcast notification event to socket server', error)
    }
  }
}
