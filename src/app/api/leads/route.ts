import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { SolarUtils } from '@/lib/solar-utils'

/**
 * Automation Hook for external AIs like OpenClaw.
 * POST /api/leads
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    // In a real production app, we would verify a secret API Key here
    // for OpenClaw to use.
    
    const body = await request.json()
    const { business_name, contact_name, address, roof_sqft, utility_rate, notes } = body

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

    const slug = SolarUtils.generateSlug(business_name)

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
      url: `${process.env.NEXT_PUBLIC_SITE_URL || ''}/proposal/${data.slug}` 
    })

  } catch (error: any) {
    console.error('Automation Hook Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
