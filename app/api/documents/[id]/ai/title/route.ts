import { handleAIRequest } from '../aiHandler'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleAIRequest(
    request,
    params,
    'You are a helpful assistant. Generate a short, catchy, and relevant title for the following document text. Only output the title text without any quotes or extra context.',
    'TITLE',
  )
}
