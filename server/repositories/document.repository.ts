import { IDocumentRepository, TransactionClient } from '../interfaces/repositories'
import { prisma } from '../database/db'
import { Prisma } from '@prisma/client'

export class PrismaDocumentRepository implements IDocumentRepository {
  async create(
    data: { title: string; slug: string; icon?: string; coverImage?: string; ownerId: string },
    tx?: TransactionClient,
  ) {
    const client = tx || prisma
    return client.document.create({
      data,
    })
  }

  async findById(id: string, tx?: TransactionClient) {
    const client = tx || prisma
    return client.document.findUnique({
      where: { id, isDeleted: false },
      include: {
        collaborators: true,
      },
    })
  }

  async findManyWithCursor(
    userId: string,
    options: {
      cursor?: string
      limit: number
      search?: string
      sort: 'updatedAt' | 'createdAt' | 'title'
      filter: 'all' | 'owner' | 'shared' | 'favorite' | 'archived'
    },
  ) {
    const { cursor, limit, search, sort, filter } = options

    let whereClause: Prisma.DocumentWhereInput = {
      isDeleted: false,
      OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
    }

    if (search) {
      whereClause.title = { contains: search, mode: 'insensitive' }
    }

    if (filter === 'owner') {
      whereClause.ownerId = userId
    } else if (filter === 'shared') {
      whereClause.ownerId = { not: userId }
    } else if (filter === 'favorite') {
      whereClause.isFavorite = true
    } else if (filter === 'archived') {
      whereClause.isArchived = true
    } else if (filter === 'all') {
      whereClause.isArchived = false
    }

    let orderByClause: Prisma.DocumentOrderByWithRelationInput = {}
    if (sort === 'title') {
      orderByClause.title = 'asc'
    } else if (sort === 'createdAt') {
      orderByClause.createdAt = 'desc'
    } else {
      orderByClause.updatedAt = 'desc'
    }

    const documents = await prisma.document.findMany({
      where: whereClause,
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: [orderByClause, { id: 'asc' }],
    })

    let nextCursor: string | null = null
    if (documents.length > limit) {
      const nextItem = documents.pop()
      nextCursor = nextItem!.id
    }

    return { documents, nextCursor }
  }

  async update(id: string, data: Partial<Prisma.DocumentUpdateInput>, tx?: TransactionClient) {
    const client = tx || prisma
    return client.document.update({
      where: { id },
      data,
    })
  }

  async softDelete(id: string, tx?: TransactionClient) {
    const client = tx || prisma
    return client.document.update({
      where: { id },
      data: { isDeleted: true },
    })
  }
}
