import { NextRequest, NextResponse } from 'next/server'
import { fetchSolarInsights } from '@/lib/openclaw-google'

export async function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get('lat') ?? '')
  const lng = parseFloat(req.nextUrl.searchParams.get('lng') ?? '')

  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 })
  }

  try {
    const insights = await fetchSolarInsights(lat, lng)
    return NextResponse.json(insights ?? null, {
      headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600' },
    })
  } catch (err) {
    console.error('[solar-insights]', err)
    return NextResponse.json({ error: 'Solar API error' }, { status: 502 })
  }
}
