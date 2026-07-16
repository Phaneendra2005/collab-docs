import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '../database/db'
import { auth } from '../../auth'
import { AuthenticationError, AuthorizationError, NotFoundError } from '../errors'
import { SuccessResponse } from '../responses'
import { Role } from '@prisma/client'
import { createPermissionService } from '../services/permission.service'
import { NotificationService } from '../services/notification.service'
import { PrismaCollaboratorRepository } from '../repositories/collaborator.repository'
import { PrismaDocumentRepository } from '../repositories/document.repository'
import { PrismaAuditLogRepository } from '../repositories/audit-log.repository'
import { z } from 'zod'
import { validateBody } from '../middlewares/validate-request'

const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['EDITOR', 'VIEWER']).default('VIEWER'),
})

const UpdateRoleSchema = z.object({
  role: z.enum(['EDITOR', 'VIEWER']),
})

function getPermissionService() {
  const collaboratorRepo = new PrismaCollaboratorRepository()
  const documentRepo = new PrismaDocumentRepository()
  return createPermissionService({ collaboratorRepo, documentRepo })
}

export async function getCollaborators(req: NextRequest, { params }: { params: any }) {
  const session = await auth()
  if (!session?.user?.id) throw new AuthenticationError()

  const { id } = await params
  const permissionService = getPermissionService()
  const canRead = await permissionService.canReadDocument(session.user.id, id)
  if (!canRead) throw new AuthorizationError('You do not have access to this document')

  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true, image: true } },
    },
  })

  if (!document) throw new NotFoundError('Document not found')

  const collaborators = await prisma.collaborator.findMany({
    where: { documentId: id },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  })

  // Combine into a generic list
  const results = collaborators.map((c) => ({
    id: c.userId,
    name: c.user.name,
    email: c.user.email,
    image: c.user.image,
    role: c.role,
  }))

  // Ensure owner is always in the list with OWNER role, even if not in collaborator table explicitly
  if (!results.find((r) => r.id === document.ownerId)) {
    results.unshift({
      id: document.owner.id,
      name: document.owner.name,
      email: document.owner.email,
      image: document.owner.image,
      role: 'OWNER',
    })
  }

  return SuccessResponse(results)
}

async function triggerWebhook(
  action: 'INVITED' | 'REMOVED' | 'ROLE_CHANGED',
  documentId: string,
  targetUserId: string,
  role?: string,
) {
  try {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:4000'
    await fetch(`${socketUrl}/api/broadcast/permissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || 'dev-token'}`,
      },
      body: JSON.stringify({ documentId, targetUserId, action, role }),
      signal: AbortSignal.timeout(5000),
    })
  } catch (error) {
    console.error('Failed to broadcast permission event to socket server', error)
  }
}

export async function inviteCollaborator(req: NextRequest, { params }: { params: any }) {
  const session = await auth()
  if (!session?.user?.id) throw new AuthenticationError()

  const { id } = await params
  const data = await validateBody(req, InviteSchema)

  const permissionService = getPermissionService()
  const canShare = await permissionService.canShareDocument(session.user.id, id)
  if (!canShare) throw new AuthorizationError('Only the owner can share this document')

  // We are bypassing Prisma $transaction for the initial fetches since NextResponse.json cannot be returned easily from within it directly if it expects a specific type without wrapping.
  // Actually, we can just return it.

  // 1. Find User by email
  const targetUser = await prisma.user.findUnique({ where: { email: data.email } })
  if (!targetUser) {
    // Per requirements: Reject unregistered users with 404
    return NextResponse.json({ error: 'User not found with that email address.' }, { status: 404 })
  }

  if (targetUser.id === session.user.id) {
    return NextResponse.json({ error: 'You cannot invite yourself.' }, { status: 400 })
  }

  // 2. Check duplicates
  const existing = await prisma.collaborator.findUnique({
    where: { documentId_userId: { documentId: id, userId: targetUser.id } },
  })
  if (existing) {
    return NextResponse.json({ error: 'User is already a collaborator.' }, { status: 400 })
  }

  const collaborator = await prisma.$transaction(async (tx) => {
    // 3. Create Collaboration Record
    const coll = await tx.collaborator.create({
      data: {
        documentId: id,
        userId: targetUser.id,
        role: data.role as Role,
      },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    })

    // 4. Audit Log
    const auditRepo = new PrismaAuditLogRepository()
    await auditRepo.logAction(
      {
        documentId: id,
        userId: session.user.id,
        action: 'COLLABORATOR_INVITED',
        details: { targetUserId: targetUser.id, role: data.role },
      },
      tx,
    )

    return coll
  })

  // 5. Trigger Webhook
  await triggerWebhook('INVITED', id, targetUser.id, data.role)

  // 6. Generate unified notification
  await NotificationService.create({
    userId: targetUser.id,
    type: 'INVITED',
    title: 'Document Invitation',
    body: `${session.user.name || 'Someone'} invited you to collaborate on a document as ${data.role}.`,
    link: `/documents/${id}`,
  })

  return SuccessResponse({
    id: targetUser.id,
    name: targetUser.name,
    email: targetUser.email,
    image: targetUser.image,
    role: collaborator.role,
  })
}

export async function removeCollaborator(req: NextRequest, { params }: { params: any }) {
  const session = await auth()
  if (!session?.user?.id) throw new AuthenticationError()

  const { id, userId } = await params

  const permissionService = getPermissionService()
  const canManage = await permissionService.canManageRoles(session.user.id, id)
  if (!canManage) throw new AuthorizationError('Only the owner can manage collaborators')

  // Owner cannot remove themselves via this endpoint (prevent orphaned docs)
  const doc = await prisma.document.findUnique({ where: { id } })
  if (doc?.ownerId === userId) {
    return NextResponse.json({ error: 'Cannot remove the document owner.' }, { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.collaborator.delete({
      where: { documentId_userId: { documentId: id, userId } },
    })

    const auditRepo = new PrismaAuditLogRepository()
    await auditRepo.logAction(
      {
        documentId: id,
        userId: session.user.id,
        action: 'COLLABORATOR_REMOVED',
        details: { targetUserId: userId },
      },
      tx,
    )
  })

  await triggerWebhook('REMOVED', id, userId)

  await NotificationService.create({
    userId: userId,
    type: 'REMOVED',
    title: 'Access Revoked',
    body: `${session.user.name || 'Someone'} removed your access to a document.`,
    link: undefined,
  })

  return SuccessResponse({ success: true })
}

export async function changeCollaboratorRole(req: NextRequest, { params }: { params: any }) {
  const session = await auth()
  if (!session?.user?.id) throw new AuthenticationError()

  const { id, userId } = await params
  const data = await validateBody(req, UpdateRoleSchema)

  const permissionService = getPermissionService()
  const canManage = await permissionService.canManageRoles(session.user.id, id)
  if (!canManage) throw new AuthorizationError('Only the owner can manage collaborators')

  const doc = await prisma.document.findUnique({ where: { id } })
  if (doc?.ownerId === userId) {
    return NextResponse.json({ error: 'Cannot change the document owner role.' }, { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.collaborator.update({
      where: { documentId_userId: { documentId: id, userId } },
      data: { role: data.role as Role },
    })

    const auditRepo = new PrismaAuditLogRepository()
    await auditRepo.logAction(
      {
        documentId: id,
        userId: session.user.id,
        action: 'COLLABORATOR_ROLE_CHANGED',
        details: { targetUserId: userId, role: data.role },
      },
      tx,
    )
  })

  await triggerWebhook('ROLE_CHANGED', id, userId, data.role)

  await NotificationService.create({
    userId: userId,
    type: 'ROLE_CHANGED',
    title: 'Role Updated',
    body: `${session.user.name || 'Someone'} changed your role to ${data.role}.`,
    link: `/documents/${id}`,
  })

  return SuccessResponse({ success: true })
}
