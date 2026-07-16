import { handleAIRequest } from '../aiHandler'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleAIRequest(
    request,
    params,
    'You are a helpful writing assistant. Continue the following text naturally, maintaining the same tone, style, and subject matter.',
    'CONTINUE',
  )
}
