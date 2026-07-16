import { getCollaborators } from '@/server/controllers/share.controller'
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const p = await params
  return getCollaborators(req, { params: p })
}
