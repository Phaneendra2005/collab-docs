import { handleAIRequest } from '../aiHandler'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleAIRequest(
    request,
    params,
    'You are a helpful writing assistant. Fix any grammar, spelling, or punctuation errors in the following text. Do not change the meaning or style of the original text.',
    'GRAMMAR',
  )
}
