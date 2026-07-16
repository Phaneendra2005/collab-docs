import { inviteCollaborator } from '@/server/controllers/share.controller'
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const p = await params
  return inviteCollaborator(req, { params: p })
}
