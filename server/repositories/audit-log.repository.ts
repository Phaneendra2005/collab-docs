import { IAuditLogRepository, TransactionClient } from '../interfaces/repositories'
import { prisma } from '../database/db'

export class PrismaAuditLogRepository implements IAuditLogRepository {
  async logAction(
    data: { documentId?: string; userId?: string; action: string; details: any },
    tx?: TransactionClient,
  ) {
    const client = tx || prisma
    return client.auditLog.create({
      data: {
        documentId: data.documentId,
        userId: data.userId,
        action: data.action,
        details: data.details,
      },
    })
  }
}
