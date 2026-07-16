import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import jwt from 'jsonwebtoken'
import { prisma } from '@/server/database/db'

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { documentId } = await request.json()

    if (documentId) {
      // Check if user has access to this document
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        include: {
          collaborators: true,
        },
      })

      if (!document) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }

      const isOwner = document.ownerId === session.user.id
      const isCollaborator = document.collaborators.some((c: any) => c.userId === session.user.id)

      if (!isOwner && !isCollaborator) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Generate JWT for Socket.IO Server Authentication
    const token = jwt.sign({ userId: session.user.id }, process.env.NEXTAUTH_SECRET || 'secret', {
      expiresIn: '1h',
    })

    return NextResponse.json({ token })
  } catch (error) {
    console.error('Failed to generate socket token:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
