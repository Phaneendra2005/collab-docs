import { NextRequest } from 'next/server'
import { createDocumentService } from '../services/document.service'
import { createPermissionService } from '../services/permission.service'
import { PrismaDocumentRepository } from '../repositories/document.repository'
import { PrismaCollaboratorRepository } from '../repositories/collaborator.repository'
import { PrismaAuditLogRepository } from '../repositories/audit-log.repository'
import { validateBody, validateParams } from '../middlewares/validate-request'
import {
  CreateDocumentSchema,
  DocumentQuerySchema,
  UpdateDocumentSchema,
} from '../dtos/document.dto'
import { SuccessResponse, PaginationResponse } from '../responses'
import { auth } from '../../auth'
import { AuthenticationError } from '../errors'

function getDocumentService() {
  const documentRepo = new PrismaDocumentRepository()
  const collaboratorRepo = new PrismaCollaboratorRepository()
  const auditRepo = new PrismaAuditLogRepository()
  const permissionService = createPermissionService({ collaboratorRepo, documentRepo })

  return createDocumentService({
    documentRepo,
    collaboratorRepo,
    auditRepo,
    permissionService,
  })
}

export async function createDocument(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) throw new AuthenticationError()

  const data = await validateBody(req, CreateDocumentSchema)
  const service = getDocumentService()

  const document = await service.createDocument(session.user.id, data)
  return SuccessResponse(document, 201)
}

export async function getDocuments(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) throw new AuthenticationError()

  const query = validateParams(req.nextUrl.searchParams, DocumentQuerySchema)
  const service = getDocumentService()

  const { documents, nextCursor } = await service.getDocuments(session.user.id, query)
  return PaginationResponse(documents, nextCursor)
}

export async function getDocument(req: NextRequest, { params }: { params: any }) {
  const session = await auth()
  if (!session?.user?.id) throw new AuthenticationError()

  const { id } = await params
  const service = getDocumentService()
  const document = await service.getDocument(session.user.id, id)
  return SuccessResponse(document)
}

export async function updateDocument(req: NextRequest, { params }: { params: any }) {
  const session = await auth()
  if (!session?.user?.id) throw new AuthenticationError()

  const { id } = await params
  const data = await validateBody(req, UpdateDocumentSchema)
  const service = getDocumentService()
  const document = await service.updateDocument(session.user.id, id, data)

  // Broadcast rename to Socket Server if title changed
  if (data.title) {
    try {
      // Get all userIds that need to know about this rename (owner + collaborators)
      const fullDoc = await getDocumentService().getDocument(session.user.id, id)
      const collaborators = await new PrismaCollaboratorRepository().findManyByDocument(id)
      const userIds = [fullDoc.ownerId, ...collaborators.map((c: { userId: string }) => c.userId)]

      const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://127.0.0.1:4000'
      await fetch(`${socketUrl}/api/broadcast/rename`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || 'dev-token'}`,
        },
        body: JSON.stringify({ documentId: id, title: data.title, userIds }),
        signal: AbortSignal.timeout(5000),
      })
    } catch (error) {
      console.error('Failed to broadcast rename event to socket server', error)
    }
  }

  return SuccessResponse(document)
}

export async function deleteDocument(req: NextRequest, { params }: { params: any }) {
  const session = await auth()
  if (!session?.user?.id) throw new AuthenticationError()

  const { id } = await params
  const service = getDocumentService()
  const document = await service.deleteDocument(session.user.id, id)
  return SuccessResponse(document)
}
