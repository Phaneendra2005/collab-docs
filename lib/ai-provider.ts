import Groq from 'groq-sdk'

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
})

export async function generateText(prompt: string, system?: string) {
  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      ...(system ? [{ role: 'system' as const, content: system }] : []),
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.7,
  })

  return {
    text: response.choices[0]?.message?.content ?? '',
    usage: {
      totalTokens: response.usage?.total_tokens ?? 0,
    },
  }
}

export async function streamText(prompt: string, system?: string) {
  const stream = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      ...(system ? [{ role: 'system' as const, content: system }] : []),
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.7,
    stream: true,
  })

  async function* generateStream() {
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) {
        yield content
      }
    }
  }

  return {
    textStream: generateStream(),
  }
}
