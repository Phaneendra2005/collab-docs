import { NextResponse } from 'next/server'
import { prisma } from '@/server/database/db'
import { hashOperation } from '../../../../client/sync/hash'
import { DocumentOperationSchema } from '../../../../shared/types/operation'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const internalSecret = process.env.INTERNAL_SERVICE_TOKEN || 'dev-token'
  if (authHeader !== `Bearer ${internalSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const documentId = searchParams.get('documentId')
  let afterClock = parseInt(searchParams.get('afterClock') || '0', 10)
  if (isNaN(afterClock)) afterClock = 0

  if (!documentId) {
    return NextResponse.json({ error: 'Missing documentId' }, { status: 400 })
  }

  try {
    const ops = await prisma.operation.findMany({
      where: {
        documentId,
        lamport: { gt: afterClock },
      },
      orderBy: {
        lamport: 'asc',
      },
    })

    const mapped = await Promise.all(
      ops.map(async (op) => {
        // IF canonical payload exists, return it directly
        if (op.payload && typeof op.payload === 'object' && 'schemaVersion' in op.payload) {
          return op.payload
        }

        // ELSE attempt legacy upgrade
        const baseObj = {
          operationId: op.id,
          actorId: op.actorId,
          documentId: op.documentId,
          lamportClock: op.lamport,
          parentOperationIds: op.parentId ? [op.parentId] : [],
          documentVersion: 0,
          operationType: op.type,
          payload: op.payload,
          createdAt: op.createdAt.getTime(),
          schemaVersion: 0, // Distinguish upgraded legacy
        }

        const expectedHash = await hashOperation(baseObj)

        return {
          ...baseObj,
          checksum: expectedHash,
          operationHash: expectedHash,
        }
      }),
    )

    // Verify upgrade correctness with shared validator
    const validOperations = mapped.filter((op) => {
      const parsed = DocumentOperationSchema.safeParse(op)
      if (!parsed.success) {
        console.warn(
          `[Replay API] Skipping malformed legacy operation ${op.operationId || 'unknown'}:`,
          parsed.error,
        )
        return false
      }
      return true
    })

    return NextResponse.json({ operations: validOperations })
  } catch (error) {
    console.error('Fetch operations error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
