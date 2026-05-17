import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  await request.text().catch(() => null)
  return NextResponse.json(
    {
      error: 'Commercial prospect scraping is disabled. Residential leads now enter through /api/residential-intake.',
    },
    { status: 410 }
  )
}
