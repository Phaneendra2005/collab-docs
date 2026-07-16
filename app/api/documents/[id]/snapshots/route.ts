import { NextResponse } from 'next/server'
import { prisma } from '@/server/database/db'
import { auth } from '@/auth'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: documentId } = await params

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

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    const [snapshots, total] = await Promise.all([
      prisma.documentVersion.findMany({
        where: { documentId },
        orderBy: { versionNum: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          versionNum: true,
          metadata: true,
          createdBy: true,
          createdAt: true,
        },
      }),
      prisma.documentVersion.count({ where: { documentId } }),
    ])

    return NextResponse.json({
      snapshots,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Fetch snapshots error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: documentId } = await params

    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: { collaborators: true },
    })

    if (!doc) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const isOwner = doc.ownerId === session.user.id
    const isEditor = doc.collaborators.some(
      (c) => c.userId === session.user.id && c.role === 'EDITOR',
    )

    if (!isOwner && !isEditor) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { snapshot, metadata } = body

    if (!snapshot) {
      return NextResponse.json({ error: 'Snapshot data required' }, { status: 400 })
    }

    // Get latest version number
    const latestVersion = await prisma.documentVersion.findFirst({
      where: { documentId },
      orderBy: { versionNum: 'desc' },
    })

    const nextVersionNum = (latestVersion?.versionNum || 0) + 1

    const newSnapshot = await prisma.documentVersion.create({
      data: {
        documentId,
        versionNum: nextVersionNum,
        snapshot,
        metadata: metadata || { name: `Version ${nextVersionNum}` },
        createdBy: session.user.id,
      },
    })

    return NextResponse.json({ snapshot: newSnapshot }, { status: 201 })
  } catch (error) {
    console.error('Create snapshot error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
