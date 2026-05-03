import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { verifyN8nRequest } from '@/lib/n8n-auth'
import {
  buildRasterRenderPreview,
  buildSolarModel,
  buildSolarOverlaySvg,
  fetchSolarInsights,
  fetchStaticSatelliteImage,
  uploadLeadAsset,
} from '@/lib/openclaw-google'

/**
 * POST /api/generate-roof-image
 * Fetches satellite imagery + Google Solar geometry for given coordinates,
 * uploads the raw roof image and panel overlay render to Supabase Storage,
 * and returns OpenClaw-ready modeling data.
 *
 * Body: { lat, lng, slug, formattedAddress?, bucket?: 'leads' | 'prospects' }
 * Response: { roof_image_url, render_image_url, render_preview_url, solar_model }
 */
export async function POST(request: NextRequest) {
  try {
    const { lat, lng, slug, bucket = 'leads' } = await request.json()

    if (bucket !== 'leads' && bucket !== 'prospects') {
      return NextResponse.json({ error: 'bucket must be leads or prospects' }, { status: 400 })
    }

    if (bucket === 'prospects') {
      const authError = verifyN8nRequest(request)
      if (authError) return authError
    }

    if (lat == null || lng == null) {
      return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 })
    }
    if (!slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 })
    }

    const supabase = await createAdminClient()
    const [imageBuffer, solarInsights] = await Promise.all([
      fetchStaticSatelliteImage(Number(lat), Number(lng)),
      fetchSolarInsights(Number(lat), Number(lng)).catch((error) => {
        console.error('[generate-roof-image] Google Solar fallback:', error)
        return null
      }),
    ])
    const solarModel = buildSolarModel(solarInsights)

    const roofImageUrl = await uploadLeadAsset({
      supabase,
      bucket,
      slug,
      fileName: 'roof.png',
      body: imageBuffer,
      contentType: 'image/png',
    })

    const satelliteBase64 = `data:image/png;base64,${Buffer.from(imageBuffer).toString('base64')}`
    const overlaySvg = buildSolarOverlaySvg({
      satelliteUrl: satelliteBase64,
      insights: solarInsights,
      lat: Number(lat),
      lng: Number(lng),
      model: solarModel,
    })

    const renderImageUrl = await uploadLeadAsset({
      supabase,
      bucket,
      slug,
      fileName: 'render.svg',
      body: overlaySvg,
      contentType: 'image/svg+xml',
    })

    const renderPreviewBuffer = await buildRasterRenderPreview(overlaySvg)
    const renderPreviewUrl = await uploadLeadAsset({
      supabase,
      bucket,
      slug,
      fileName: 'render_preview.webp',
      body: renderPreviewBuffer,
      contentType: 'image/webp',
    })

    return NextResponse.json({
      roof_image_url: roofImageUrl,
      render_image_url: renderImageUrl,
      render_preview_url: renderPreviewUrl,
      solar_model: solarModel,
      solar_insights_available: Boolean(solarInsights),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[generate-roof-image]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
