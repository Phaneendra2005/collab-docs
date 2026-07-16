import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/server/database/db'
import * as zlib from 'zlib'
import { promisify } from 'util'
import { DocumentOperationSchema } from '../../../../../../shared/types/operation'

const gunzip = promisify(zlib.gunzip)

const rateLimitMap = new Map<string, number>()

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = Date.now()
  const lastSync = rateLimitMap.get(session.user.id) || 0
  // Limit to 1 batch per user per 500ms
  if (now - lastSync < 500) {
    return NextResponse.json({ error: 'Rate limit exceeded. Too many batches.' }, { status: 429 })
  }
  rateLimitMap.set(session.user.id, now)

  const { id: documentId } = await params

  // 1. Permission check
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { collaborators: true },
  })

  if (!document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const isOwner = document.ownerId === session.user.id
  const collab = document.collaborators.find((c) => c.userId === session.user.id)
  const role = isOwner ? 'OWNER' : collab?.role

  // Viewers cannot push operations!
  if (role !== 'OWNER' && role !== 'EDITOR') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    // 2. Read binary payload and decompress
    const arrayBuffer = await request.arrayBuffer()
    const compressedData = Buffer.from(arrayBuffer)

    // Strict size limit to prevent OOM
    if (compressedData.length > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }

    const decompressed = await gunzip(compressedData)
    const jsonStr = decompressed.toString('utf-8')
    const parsedOperations = JSON.parse(jsonStr)

    if (!Array.isArray(parsedOperations)) {
      return NextResponse.json({ error: 'Invalid payload format' }, { status: 400 })
    }

    const operations = []
    for (const op of parsedOperations) {
      const result = DocumentOperationSchema.safeParse(op)
      if (!result.success) {
        console.warn(
          `[Batch] Rejected malformed operation: ${op.operationId || 'unknown'}`,
          result.error,
        )
        continue
      }
      operations.push(result.data)
    }

    if (operations.length === 0) {
      return NextResponse.json({ error: 'No valid operations in batch' }, { status: 400 })
    }

    // 3. Save to database
    const data = operations.map((op: any) => ({
      id: op.operationId,
      documentId: documentId,
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

    // 4. Notify the Socket Server to broadcast to other active clients
    const socketServerUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000'
    const internalSecret = process.env.INTERNAL_SERVICE_TOKEN || 'dev-token'

    await fetch(`${socketServerUrl}/api/broadcast/operations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${internalSecret}`,
      },
      body: JSON.stringify({
        documentId,
        operations,
        senderId: session.user.id,
      }),
    }).catch((err) => {
      console.error('Failed to notify socket server:', err)
      // We do not fail the request if the socket server is down,
      // because the DB persistence succeeded.
    })

    return NextResponse.json({ success: true, synced: data.length })
  } catch (error: any) {
    console.error('Batch sync error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
