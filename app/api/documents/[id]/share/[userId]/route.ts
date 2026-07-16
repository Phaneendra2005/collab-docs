import { changeCollaboratorRole, removeCollaborator } from '@/server/controllers/share.controller'
import { NextRequest } from 'next/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const p = await params
  return changeCollaboratorRole(req, { params: p })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const p = await params
  return removeCollaborator(req, { params: p })
}
