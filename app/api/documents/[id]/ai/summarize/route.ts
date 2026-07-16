import { handleAIRequest } from '../aiHandler'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleAIRequest(
    request,
    params,
    'You are a helpful assistant that summarizes text concisely.',
    'SUMMARIZE',
  )
}
