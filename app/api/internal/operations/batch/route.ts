import { NextResponse } from 'next/server'
import { prisma } from '@/server/database/db'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const internalSecret = process.env.INTERNAL_SERVICE_TOKEN || 'dev-token'
  if (authHeader !== `Bearer ${internalSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { documentId, operations } = await request.json()
    console.log(`[Batch] Received ${operations?.length} ops for doc ${documentId}`)
    if (!documentId || !Array.isArray(operations)) {
      return NextResponse.json({ error: 'Bad Request' }, { status: 400 })
    }

    const data = operations.map((op: any) => ({
      id: op.operationId,
      documentId: op.documentId,
      actorId: op.actorId,
      lamport: op.lamportClock,
      parentId: op.parentOperationIds?.[0] || null,
      type: op.operationType,
      payload: op, // Store entire canonical object
      createdAt: new Date(op.createdAt || Date.now()),
    }))

    await prisma.operation.createMany({
      data,
      skipDuplicates: true,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Batch operations error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
