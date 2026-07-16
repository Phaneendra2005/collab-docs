import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/auth'
import { prisma } from '@/server/database/db'
import TipTapEditor from '@/components/editor/TipTapEditor'
import EditorWrapper from './EditorWrapper'
import DocumentHeader from '@/components/document/DocumentHeader'
import DocumentRoleBadge from '@/components/document/DocumentRoleBadge'
import NotificationBell from '@/components/notifications/NotificationBell'

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/api/auth/signin')
  }

  const { id } = await params

  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      owner: true,
      collaborators: true,
    },
  })

  if (!document) {
    notFound()
  }

  const isOwner = document.ownerId === session.user.id
  const collaboratorRecord = document.collaborators.find(
    (c: { userId: string; role: string }) => c.userId === session.user.id,
  )
  const role = isOwner ? 'OWNER' : collaboratorRecord ? collaboratorRecord.role : 'VIEWER'
  const editable = isOwner || (collaboratorRecord && collaboratorRecord.role === 'EDITOR')

  if (!isOwner && !collaboratorRecord) {
    // Basic permissions check
    return <div className="p-8">You do not have permission to view this document.</div>
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
            title="Back to Dashboard"
          >
            ←
          </Link>
          <DocumentHeader
            documentId={document.id}
            initialTitle={document.title}
            role={role as any}
          />
        </div>
        <div className="flex items-center gap-4">
          <NotificationBell userId={session.user.id} />
          <DocumentRoleBadge initialRole={role as any} />
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-4 md:p-8">
        <div className="max-w-4xl mx-auto h-full">
          {/* We will need to pass a token. For now, we will build a ClientWrapper to fetch it, 
              or rely on the session if we change TipTapEditor to fetch its own token. */}
          <EditorWrapper
            documentId={document.id}
            actorId={session.user.id}
            editable={!!editable}
            role={role as any}
          />
        </div>
      </main>
    </div>
  )
}
