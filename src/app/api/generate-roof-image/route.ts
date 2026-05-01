import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

/**
 * POST /api/generate-roof-image
 * Fetches a satellite image for given coordinates, uploads to Supabase Storage,
 * and returns the public URL. Compatible with automated callers (e.g. OpenClaw).
 *
 * Body: { lat, lng, slug, formattedAddress? }
 * Response: { roof_image_url }
 */
export async function POST(request: NextRequest) {
  try {
    const { lat, lng, slug } = await request.json()

    if (lat == null || lng == null) {
      return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 })
    }
    if (!slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 })
    }

    const mapsKey = process.env.GOOGLE_MAPS_STATIC_API_KEY
    if (!mapsKey) {
      return NextResponse.json({ error: 'GOOGLE_MAPS_STATIC_API_KEY not configured' }, { status: 500 })
    }

    // Fetch satellite image from Google Maps Static API
    const mapUrl =
      `https://maps.googleapis.com/maps/api/staticmap` +
      `?center=${lat},${lng}&zoom=19&size=800x600&maptype=satellite&key=${mapsKey}`

    const imageResponse = await fetch(mapUrl)
    if (!imageResponse.ok) {
      throw new Error(`Google Maps Static API returned ${imageResponse.status}: ${await imageResponse.text()}`)
    }

    const imageBuffer = await imageResponse.arrayBuffer()

    // Upload to Supabase Storage at leads/{slug}/roof.png
    const supabase = await createAdminClient()
    const filePath = `${slug}/roof.png`

    const { error: uploadError } = await supabase.storage
      .from('leads')
      .upload(filePath, imageBuffer, { contentType: 'image/png', upsert: true })

    if (uploadError) throw uploadError

    const { data } = supabase.storage.from('leads').getPublicUrl(filePath)

    return NextResponse.json({ roof_image_url: data.publicUrl })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[generate-roof-image]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
