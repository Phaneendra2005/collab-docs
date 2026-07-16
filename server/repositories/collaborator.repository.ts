import { ICollaboratorRepository, TransactionClient } from '../interfaces/repositories'
import { prisma } from '../database/db'
import { Role } from '@prisma/client'

export class PrismaCollaboratorRepository implements ICollaboratorRepository {
  async create(data: { documentId: string; userId: string; role: Role }, tx?: TransactionClient) {
    const client = tx || prisma
    return client.collaborator.create({
      data,
    })
  }

  async findByUserAndDocument(userId: string, documentId: string, tx?: TransactionClient) {
    const client = tx || prisma
    return client.collaborator.findUnique({
      where: {
        documentId_userId: {
          documentId,
          userId,
        },
      },
    })
  }

  async findManyByDocument(documentId: string, tx?: TransactionClient) {
    const client = tx || prisma
    return client.collaborator.findMany({
      where: { documentId },
    })
  }

  async delete(id: string, tx?: TransactionClient) {
    const client = tx || prisma
    await client.collaborator.delete({
      where: { id },
    })
  }
}
