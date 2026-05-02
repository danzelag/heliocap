import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { verifyN8nRequest } from '@/lib/n8n-auth'
import { SolarUtils } from '@/lib/solar-utils'

/**
 * Automation Hook for external AIs like OpenClaw.
 * POST /api/leads
 */
export async function POST(request: Request) {
  try {
    const authError = verifyN8nRequest(request)
    if (authError) return authError

    const supabase = await createAdminClient()
    const body = await request.json()
    const {
      business_name,
      contact_name,
      address,
      roof_sqft,
      utility_rate,
      notes,
      roof_image_url,
      render_image_url,
      video_url,
      lat,
      lng,
      building_type,
    } = body

    if (!business_name) {
      return NextResponse.json({ error: 'business_name is required' }, { status: 400 })
    }

    // AI-Powered Estimation if roof_sqft is provided
    let savings = body.estimated_savings
    let payback = body.estimated_payback

    if (roof_sqft && !savings) {
      const estimation = SolarUtils.calculateEstimation(roof_sqft, utility_rate || 0.12)
      savings = estimation.savings
      payback = estimation.payback
    }

    const baseSlug = body.slug ? SolarUtils.generateSlug(String(body.slug)) : SolarUtils.generateSlug(business_name)
    let slug = baseSlug

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const { data: existingLead, error: slugError } = await supabase
        .from('leads')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()

      if (slugError) throw slugError
      if (!existingLead) break
      slug = `${baseSlug}-${attempt + 1}`
    }

    const { data, error } = await supabase
      .from('leads')
      .insert([
        {
          business_name,
          contact_name,
          address,
          slug,
          roof_sqft,
          utility_rate: utility_rate || 0.12,
          estimated_savings: savings,
          estimated_payback: payback,
          roof_image_url: roof_image_url || null,
          render_image_url: render_image_url || roof_image_url || null,
          video_url: video_url || null,
          lat: lat ?? null,
          lng: lng ?? null,
          building_type: building_type || null,
          notes,
          status: 'published'
        }
      ])
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ 
      success: true, 
      lead_id: data.id,
      slug: data.slug,
      url: `${process.env.NEXT_PUBLIC_SITE_URL || ''}/proposal/${data.slug}` 
    })

  } catch (error: any) {
    console.error('Automation Hook Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
