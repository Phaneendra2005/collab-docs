import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { AppError } from '../server/errors'

export function handleApiError(error: unknown) {
  if (error instanceof ZodError) {
    console.error('[API Error] Validation Error:', JSON.stringify(error.issues, null, 2))
    return NextResponse.json({ error: 'Validation Error', details: error.issues }, { status: 400 })
  }

  if (error instanceof AppError) {
    console.error('[API Error] AppError:', error.message, error.statusCode)
    return NextResponse.json({ error: error.message }, { status: error.statusCode })
  }

  // Handle Prisma errors, etc.
  if (error instanceof Error) {
    console.error('[API Error] Standard Error:', error.message, error.stack)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.error('[API Error] Unknown Error:', error)
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
}
