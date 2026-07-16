import { NextResponse } from 'next/server'
import { prisma } from '../../../../server/database/db'

export async function GET() {
  const docs = await prisma.document.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 1,
  })

  if (docs.length === 0) {
    return NextResponse.json({ message: 'No documents found' })
  }

  const doc = docs[0]
  const ops = await prisma.operation.findMany({
    where: { documentId: doc.id },
    orderBy: { lamport: 'asc' },
  })

  const lastOps = ops.slice(-10).map((op) => ({
    lamport: op.lamport,
    type: op.type,
    payloadLength: JSON.stringify(op.payload).length,
    payloadPreview: JSON.stringify(op.payload).substring(0, 200),
  }))

  return NextResponse.json({
    documentId: doc.id,
    totalOps: ops.length,
    lastOps,
  })
}
