import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '../database/db'
import { auth } from '../../auth'
import { AuthenticationError, AuthorizationError, NotFoundError } from '../errors'
import { NotificationService } from '../services/notification.service'
import { SuccessResponse } from '../responses'
import { createPermissionService } from '../services/permission.service'
import { PrismaCollaboratorRepository } from '../repositories/collaborator.repository'
import { PrismaDocumentRepository } from '../repositories/document.repository'
import { z } from 'zod'
import { validateBody } from '../middlewares/validate-request'

const CreateCommentSchema = z.object({
  id: z.string().optional(),
  content: z.string().min(1),
  quote: z.string().optional(),
  parentId: z.string().optional(),
})

const UpdateCommentSchema = z.object({
  content: z.string().min(1),
})

function getPermissionService() {
  const collaboratorRepo = new PrismaCollaboratorRepository()
  const documentRepo = new PrismaDocumentRepository()
  return createPermissionService({ collaboratorRepo, documentRepo })
}

async function triggerWebhook(
  action: 'CREATED' | 'UPDATED' | 'DELETED' | 'RESOLVED' | 'REOPENED',
  documentId: string,
  payload: any,
) {
  try {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:4000'
    const res = await fetch(`${socketUrl}/api/broadcast/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || 'dev-token'}`,
      },
      body: JSON.stringify({ documentId, action, payload }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      console.error(`[Webhook] Failed to broadcast comment event: ${res.status} ${res.statusText}`)
    }
  } catch (error) {
    console.error('[Webhook] Failed to broadcast comment event to socket server', error)
  }
}

export async function getComments(req: NextRequest, { params }: { params: any }) {
  const session = await auth()
  if (!session?.user?.id) throw new AuthenticationError()
  const { id } = await params

  const permissionService = getPermissionService()
  const canRead = await permissionService.canReadDocument(session.user.id, id)
  if (!canRead) throw new AuthorizationError('You do not have access to this document')

  const comments = await prisma.comment.findMany({
    where: { documentId: id, parentId: null },
    include: {
      author: { select: { id: true, name: true, email: true, image: true } },
      replies: {
        include: {
          author: { select: { id: true, name: true, email: true, image: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  console.log(`Fetched ${comments.length} comments for document ${id}`)
  return SuccessResponse(comments)
}

export async function createComment(req: NextRequest, { params }: { params: any }) {
  const session = await auth()
  if (!session?.user?.id) {
    throw new AuthenticationError()
  }
  const { id } = await params

  // 1. Incoming POST body
  const clonedReq = req.clone()
  const rawBody = await clonedReq.json().catch(() => ({}))

  let data
  try {
    data = await validateBody(req, CreateCommentSchema)
  } catch (e: any) {
    throw e
  }

  const permissionService = getPermissionService()
  const role = await permissionService.getRole(session.user.id, id)
  if (!role || role === 'VIEWER') {
    throw new AuthorizationError('You do not have permission to comment on this document')
  }

  let newComment
  try {
    const createInput = {
      id: data.id,
      documentId: id,
      authorId: session.user.id,
      content: data.content,
      quote: data.quote,
      parentId: data.parentId,
    }

    newComment = await prisma.comment.create({
      data: createInput,
      include: {
        author: { select: { id: true, name: true, email: true, image: true } },
      },
    })
  } catch (e: any) {
    throw e
  }

  // Automatically trigger webhook to sync to connected users
  await triggerWebhook('CREATED', id, newComment)

  // Unified Notification Pipeline
  const document = await prisma.document.findUnique({ where: { id } })
  let recipientId = document?.ownerId

  if (data.parentId) {
    const parent = await prisma.comment.findUnique({ where: { id: data.parentId } })
    if (parent) recipientId = parent.authorId
  }

  if (recipientId && recipientId !== session.user.id) {
    const isReply = !!data.parentId
    await NotificationService.create({
      userId: recipientId,
      type: isReply ? 'COMMENT_REPLY' : 'COMMENT_ADDED',
      title: isReply ? 'New Reply' : 'New Comment',
      body: `${session?.user?.name || 'Someone'} ${isReply ? 'replied to your comment' : 'commented on your document'}: "${data.content.substring(0, 50)}..."`,
      link: `/documents/${id}`,
    })
  }

  const responseBody = SuccessResponse(newComment)
  return responseBody
}

export async function updateComment(req: NextRequest, { params }: { params: any }) {
  const session = await auth()
  if (!session?.user?.id) throw new AuthenticationError()
  const { id, commentId } = await params
  const data = await validateBody(req, UpdateCommentSchema)
  const byId = await prisma.comment.findUnique({
    where: { id: commentId },
  })

  const comment = await prisma.comment.findUnique({ where: { id: commentId } })
  if (!comment || comment.documentId !== id) {
    throw new NotFoundError('Comment not found')
  }

  if (comment.authorId !== session.user.id) {
    throw new AuthorizationError('You can only edit your own comments')
  }

  const updatedComment = await prisma.comment.update({
    where: { id: commentId },
    data: { content: data.content },
    include: {
      author: { select: { id: true, name: true, email: true, image: true } },
    },
  })

  await triggerWebhook('UPDATED', id, updatedComment)

  const document = await prisma.document.findUnique({ where: { id } })
  let recipientId = document?.ownerId

  if (comment.parentId) {
    const parent = await prisma.comment.findUnique({ where: { id: comment.parentId } })
    if (parent) recipientId = parent.authorId
  }

  if (recipientId && recipientId !== session.user.id) {
    await NotificationService.create({
      userId: recipientId,
      type: 'COMMENT_EDITED',
      title: 'Comment Edited',
      body: `${session.user.name || 'Someone'} edited a comment: "${data.content.substring(0, 50)}..."`,
      link: `/documents/${id}`,
    })
  }

  return SuccessResponse(updatedComment)
}

export async function resolveComment(req: NextRequest, { params }: { params: any }) {
  const session = await auth()
  if (!session?.user?.id) throw new AuthenticationError()
  const { id, commentId } = await params

  const permissionService = getPermissionService()
  const role = await permissionService.getRole(session.user.id, id)

  if (role !== 'OWNER' && role !== 'EDITOR') {
    throw new AuthorizationError('Only Owners and Editors can resolve or reopen comments')
  }

  const comment = await prisma.comment.findUnique({ where: { id: commentId } })
  if (!comment || comment.documentId !== id) throw new NotFoundError('Comment not found')

  const isResolved = !comment.resolved // toggle

  const updatedComment = await prisma.comment.update({
    where: { id: commentId },
    data: { resolved: isResolved },
    include: {
      author: { select: { id: true, name: true, email: true, image: true } },
    },
  })

  await triggerWebhook(isResolved ? 'RESOLVED' : 'REOPENED', id, updatedComment)

  if (comment.authorId !== session.user.id) {
    await NotificationService.create({
      userId: comment.authorId,
      type: isResolved ? 'COMMENT_RESOLVED' : 'COMMENT_REOPENED',
      title: isResolved ? 'Comment Resolved' : 'Comment Reopened',
      body: `${session.user.name || 'Someone'} ${isResolved ? 'resolved' : 'reopened'} your comment.`,
      link: `/documents/${id}`,
    })
  }

  return SuccessResponse(updatedComment)
}

export async function deleteComment(req: NextRequest, { params }: { params: any }) {
  const session = await auth()
  if (!session?.user?.id) throw new AuthenticationError()
  const { id, commentId } = await params

  const comment = await prisma.comment.findUnique({ where: { id: commentId } })
  if (!comment || comment.documentId !== id) throw new NotFoundError('Comment not found')

  const permissionService = getPermissionService()
  const role = await permissionService.getRole(session.user.id, id)

  if (comment.authorId !== session.user.id && role !== 'OWNER') {
    throw new AuthorizationError('Only the author or the document owner can delete a comment')
  }

  await prisma.comment.delete({ where: { id: commentId } })

  await triggerWebhook('DELETED', id, { id: commentId, parentId: comment.parentId })

  // Only notify if someone else deleted it (e.g. Owner deleted a collaborator's comment)
  if (comment.authorId !== session.user.id) {
    await NotificationService.create({
      userId: comment.authorId,
      type: 'COMMENT_DELETED',
      title: 'Comment Deleted',
      body: `${session.user.name || 'The owner'} deleted your comment.`,
      link: `/documents/${id}`,
    })
  }

  return SuccessResponse({ success: true })
}
