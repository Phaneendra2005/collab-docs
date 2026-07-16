import { NextRequest } from 'next/server'
import { prisma } from '../database/db'
import { auth } from '../../auth'
import { AuthenticationError, AuthorizationError, NotFoundError } from '../errors'
import { NotificationService } from '../services/notification.service'
import { SuccessResponse } from '../responses'
import { z } from 'zod'
import { validateBody } from '../middlewares/validate-request'
import { createPermissionService } from '../services/permission.service'
import { PrismaCollaboratorRepository } from '../repositories/collaborator.repository'
import { PrismaDocumentRepository } from '../repositories/document.repository'

const CreateMentionSchema = z.object({
  mentionedUserId: z.string().min(1),
})

function getPermissionService() {
  const collaboratorRepo = new PrismaCollaboratorRepository()
  const documentRepo = new PrismaDocumentRepository()
  return createPermissionService({ collaboratorRepo, documentRepo })
}

export async function createMention(req: NextRequest, { params }: { params: any }) {
  const session = await auth()
  if (!session?.user?.id) throw new AuthenticationError()
  const { id } = await params

  const data = await validateBody(req, CreateMentionSchema)

  // Prevent self-mentions
  if (data.mentionedUserId === session.user.id) {
    return SuccessResponse({ success: true, ignored: 'self-mention' })
  }

  const permissionService = getPermissionService()
  const canRead = await permissionService.canReadDocument(session.user.id, id)
  if (!canRead) throw new AuthorizationError('You do not have access to this document')

  // Validate that the mentioned user actually has access to the document
  const mentionedUserHasAccess = await permissionService.canReadDocument(data.mentionedUserId, id)
  if (!mentionedUserHasAccess) {
    throw new AuthorizationError('Mentioned user is not a collaborator on this document')
  }

  // Prevent duplicate notifications in a short time frame (e.g. 5 minutes)
  const recentMention = await prisma.notification.findFirst({
    where: {
      userId: data.mentionedUserId,
      type: 'MENTION',
      link: `/documents/${id}`,
      createdAt: {
        gte: new Date(Date.now() - 5 * 60 * 1000),
      },
    },
  })

  if (recentMention) {
    return SuccessResponse({ success: true, ignored: 'duplicate' })
  }

  // NotificationService.create automatically inserts exactly ONE notification into the database
  // and emits exactly ONE socket notification to the target user via the webhook.
  await NotificationService.create({
    userId: data.mentionedUserId,
    type: 'MENTION',
    title: 'New Mention',
    body: `${session.user.name || 'Someone'} mentioned you in a document.`,
    link: `/documents/${id}`,
  })

  return SuccessResponse({ success: true })
}
