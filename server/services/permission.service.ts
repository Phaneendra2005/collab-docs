import { ICollaboratorRepository, IDocumentRepository } from '../interfaces/repositories'
import { Role } from '@prisma/client'

export function createPermissionService(deps: {
  collaboratorRepo: ICollaboratorRepository
  documentRepo: IDocumentRepository
}) {
  const { collaboratorRepo, documentRepo } = deps

  const getRole = async (userId: string, documentId: string) => {
    const doc = await documentRepo.findById(documentId)
    if (!doc) return null
    if (doc.ownerId === userId) return Role.OWNER

    const collab = await collaboratorRepo.findByUserAndDocument(userId, documentId)
    return collab ? collab.role : null
  }

  return {
    getRole,
    async canReadDocument(userId: string, documentId: string): Promise<boolean> {
      const role = await getRole(userId, documentId)
      return role !== null
    },
    async canEditDocument(userId: string, documentId: string): Promise<boolean> {
      const role = await getRole(userId, documentId)
      return role === Role.OWNER || role === Role.EDITOR
    },
    async canDeleteDocument(userId: string, documentId: string): Promise<boolean> {
      const role = await getRole(userId, documentId)
      return role === Role.OWNER
    },
    async canInviteUsers(userId: string, documentId: string): Promise<boolean> {
      const role = await getRole(userId, documentId)
      return role === Role.OWNER
    },
    async canShareDocument(userId: string, documentId: string): Promise<boolean> {
      const role = await getRole(userId, documentId)
      return role === Role.OWNER
    },
    async canManageRoles(userId: string, documentId: string): Promise<boolean> {
      const role = await getRole(userId, documentId)
      return role === Role.OWNER
    },
    async canRestoreVersion(userId: string, documentId: string): Promise<boolean> {
      const role = await getRole(userId, documentId)
      return role === Role.OWNER || role === Role.EDITOR
    },
  }
}
