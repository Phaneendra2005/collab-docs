import { handleAIRequest } from '../aiHandler'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleAIRequest(
    request,
    params,
    'You are a helpful writing assistant. Rewrite the following text to be clearer, more professional, and more engaging while preserving the original meaning.',
    'REWRITE',
  )
}
