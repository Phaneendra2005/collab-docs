import { NextResponse } from 'next/server'
import { prisma } from '@/server/database/db'
import { auth } from '@/auth'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: documentId, versionId } = await params

    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: { collaborators: true },
    })

    if (!doc) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const isOwner = doc.ownerId === session.user.id
    const isCollab = doc.collaborators.some((c) => c.userId === session.user.id)
    if (!isOwner && !isCollab) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const snapshot = await prisma.documentVersion.findUnique({
      where: { id: versionId },
    })

    if (!snapshot || snapshot.documentId !== documentId) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })
    }

    return NextResponse.json({ snapshot })
  } catch (error) {
    console.error('Fetch snapshot error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
