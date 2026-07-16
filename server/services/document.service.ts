import {
  IDocumentRepository,
  ICollaboratorRepository,
  IAuditLogRepository,
} from '../interfaces/repositories'
import { CreateDocumentDTO, UpdateDocumentDTO, DocumentQueryDTO } from '../dtos/document.dto'
import { prisma } from '../database/db'
import { Role } from '@prisma/client'
import { AuthorizationError, NotFoundError } from '../errors'

export function createDocumentService(deps: {
  documentRepo: IDocumentRepository
  collaboratorRepo: ICollaboratorRepository
  auditRepo: IAuditLogRepository
  permissionService: {
    canReadDocument: (u: string, d: string) => Promise<boolean>
    canEditDocument: (u: string, d: string) => Promise<boolean>
    canDeleteDocument: (u: string, d: string) => Promise<boolean>
  }
}) {
  const { documentRepo, collaboratorRepo, auditRepo, permissionService } = deps

  return {
    async createDocument(userId: string, data: CreateDocumentDTO) {
      return prisma.$transaction(
        async (tx) => {
          const slug =
            data.title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/(^-|-$)+/g, '') +
            '-' +
            Date.now().toString(36)

          const document = await documentRepo.create(
            {
              title: data.title,
              slug,
              icon: data.icon,
              coverImage: data.coverImage,
              ownerId: userId,
            },
            tx,
          )

          await collaboratorRepo.create(
            {
              documentId: document.id,
              userId: userId,
              role: Role.OWNER,
            },
            tx,
          )

          await auditRepo.logAction(
            {
              documentId: document.id,
              userId: userId,
              action: 'DOCUMENT_CREATED',
              details: { title: document.title },
            },
            tx,
          )

          return document
        },
        { maxWait: 15000, timeout: 15000 },
      )
    },

    async getDocuments(userId: string, query: DocumentQueryDTO) {
      return documentRepo.findManyWithCursor(userId, query)
    },

    async getDocument(userId: string, documentId: string) {
      const canRead = await permissionService.canReadDocument(userId, documentId)
      if (!canRead) throw new AuthorizationError('You do not have access to this document')

      const document = await documentRepo.findById(documentId)
      if (!document) throw new NotFoundError('Document not found')
      return document
    },

    async updateDocument(userId: string, documentId: string, data: UpdateDocumentDTO) {
      const canEdit = await permissionService.canEditDocument(userId, documentId)
      if (!canEdit) throw new AuthorizationError('You do not have permission to edit this document')

      return prisma.$transaction(
        async (tx) => {
          const updated = await documentRepo.update(documentId, data, tx)

          await auditRepo.logAction(
            {
              documentId,
              userId,
              action: 'DOCUMENT_UPDATED',
              details: Object.keys(data),
            },
            tx,
          )

          return updated
        },
        { maxWait: 15000, timeout: 15000 },
      )
    },

    async deleteDocument(userId: string, documentId: string) {
      const canDelete = await permissionService.canDeleteDocument(userId, documentId)
      if (!canDelete) throw new AuthorizationError('Only the owner can delete this document')

      return prisma.$transaction(
        async (tx) => {
          const deleted = await documentRepo.softDelete(documentId, tx)

          await auditRepo.logAction(
            {
              documentId,
              userId,
              action: 'DOCUMENT_DELETED',
              details: {},
            },
            tx,
          )

          return deleted
        },
        { maxWait: 15000, timeout: 15000 },
      )
    },
  }
}
