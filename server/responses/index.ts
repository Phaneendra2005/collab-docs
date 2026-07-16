import { NextResponse } from 'next/server'

export function SuccessResponse<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status })
}

export function ErrorResponse(error: string, status = 500, details?: unknown) {
  return NextResponse.json({ error, details }, { status })
}

export function PaginationResponse<T>(data: T[], nextCursor: string | null, totalCount?: number) {
  return NextResponse.json({
    data,
    meta: {
      nextCursor,
      totalCount,
    },
  })
}
