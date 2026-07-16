import { Document, Collaborator, AuditLog, Invitation, Role, Prisma } from '@prisma/client'

export type TransactionClient = Omit<
  Prisma.TransactionClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

export interface IDocumentRepository {
  create(
    data: { title: string; slug: string; icon?: string; coverImage?: string; ownerId: string },
    tx?: TransactionClient,
  ): Promise<Document>
  findById(id: string, tx?: TransactionClient): Promise<Document | null>
  findManyWithCursor(
    userId: string,
    options: {
      cursor?: string
      limit: number
      search?: string
      sort: 'updatedAt' | 'createdAt' | 'title'
      filter: 'all' | 'owner' | 'shared' | 'favorite' | 'archived'
    },
  ): Promise<{ documents: Document[]; nextCursor: string | null }>
  update(
    id: string,
    data: Partial<Prisma.DocumentUpdateInput>,
    tx?: TransactionClient,
  ): Promise<Document>
  softDelete(id: string, tx?: TransactionClient): Promise<Document>
}

export interface ICollaboratorRepository {
  create(
    data: { documentId: string; userId: string; role: Role },
    tx?: TransactionClient,
  ): Promise<Collaborator>
  findByUserAndDocument(
    userId: string,
    documentId: string,
    tx?: TransactionClient,
  ): Promise<Collaborator | null>
  findManyByDocument(documentId: string, tx?: TransactionClient): Promise<Collaborator[]>
  delete(id: string, tx?: TransactionClient): Promise<void>
}

export interface IAuditLogRepository {
  logAction(
    data: { documentId?: string; userId?: string; action: string; details: any },
    tx?: TransactionClient,
  ): Promise<AuditLog>
}
