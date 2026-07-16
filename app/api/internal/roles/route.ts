import { NextResponse } from 'next/server'
import { prisma } from '@/server/database/db'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const userId = url.searchParams.get('userId')
  const documentId = url.searchParams.get('documentId')

  const authHeader = request.headers.get('authorization')
  const internalSecret = process.env.INTERNAL_SERVICE_TOKEN || 'dev-token'
  if (authHeader !== `Bearer ${internalSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!userId || !documentId) {
    return NextResponse.json({ error: 'Missing userId or documentId' }, { status: 400 })
  }

  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: { collaborators: true },
    })

    if (!doc) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    let role = null
    if (doc.ownerId === userId) {
      role = 'OWNER'
    } else {
      const collab = doc.collaborators.find((c) => c.userId === userId)
      if (collab) {
        role = collab.role
      }
    }

    if (!role) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ role })
  } catch (error) {
    console.error('Internal API error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
