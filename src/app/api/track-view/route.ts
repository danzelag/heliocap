import { NextRequest, NextResponse } from 'next/server'
import { AnalyticsService } from '@/services/analytics.service'

export async function POST(req: NextRequest) {
  try {
    const { leadId, slug } = await req.json()
    if (!leadId || !slug) return NextResponse.json({}, { status: 400 })
    const userAgent = req.headers.get('user-agent') || 'unknown'
    await AnalyticsService.trackPageView(leadId, slug, userAgent)
    return NextResponse.json({})
  } catch {
    return NextResponse.json({}, { status: 500 })
  }
}
