import { ZodSchema, ZodError } from 'zod'
import { ValidationError } from '../errors'

export async function validateBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  try {
    const body = await req.json()
    return schema.parse(body)
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ValidationError(error.issues.map((e) => e.message).join(', '))
    }
    throw new ValidationError('Invalid JSON body')
  }
}

export function validateParams<T>(searchParams: URLSearchParams, schema: ZodSchema<T>): T {
  try {
    const params = Object.fromEntries(searchParams.entries())
    return schema.parse(params)
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ValidationError(error.issues.map((e) => e.message).join(', '))
    }
    throw new ValidationError('Invalid query parameters')
  }
}
