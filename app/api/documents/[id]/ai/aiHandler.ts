import { NextResponse } from 'next/server'
import { prisma } from '@/server/database/db'
import { auth } from '@/auth'
import { generateText } from '@/lib/ai-provider'

export async function handleAIRequest(
  request: Request,
  params: Promise<{ id: string }>,
  systemPrompt: string,
  actionType: string,
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: documentId } = await params
    const body = await request.json()
    const { text } = body

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

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
      return NextResponse.json({ error: 'Forbidden. Only editors can use AI.' }, { status: 403 })
    }

    const { text: result, usage } = await generateText(text, systemPrompt)

    // Record AI usage
    await prisma.aIHistory.create({
      data: {
        documentId,
        userId: session.user.id,
        prompt: text.substring(0, 1000), // store up to 1000 chars of prompt
        response: result,
        tokensUsed: usage.totalTokens,
        actionType,
      },
    })

    return NextResponse.json({ result })
  } catch (error) {
    console.error(`AI ${actionType} error:`, error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
