import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

type ResidentialIntakePayload = {
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  address?: string
  lat?: number | string
  lng?: number | string
  monthly_hydro_bill?: number | string
  annual_kwh?: number | string
  heating_type?: string
  has_ev?: boolean
  ev_interest?: boolean
  heat_pump_interest?: boolean
  solar_interest?: boolean
  ev_charger_interest?: boolean
  home_type?: string
  owns_home?: boolean
  timeline?: string
  financing_interest?: boolean
  consent_to_contact?: boolean
  intake_notes?: string
  lead_source?: string
  website?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ResidentialIntakePayload

    // Lightweight honeypot for public form spam. Pretend success so bots do not learn.
    if (body.website?.trim()) {
      return NextResponse.json({ success: true })
    }

    const firstName = cleanText(body.first_name)
    const lastName = cleanText(body.last_name)
    const email = cleanText(body.email).toLowerCase()
    const phone = cleanText(body.phone)
    const address = cleanText(body.address)
    const lat = toFiniteNumber(body.lat)
    const lng = toFiniteNumber(body.lng)
    const monthlyHydroBill = toPositiveNumber(body.monthly_hydro_bill)
    const annualKwh = toPositiveNumber(body.annual_kwh)

    if (!firstName) return badRequest('first_name is required')
    if (!lastName) return badRequest('last_name is required')
    if (!isValidEmail(email)) return badRequest('A valid email is required')
    if (phone.replace(/\D/g, '').length < 10) return badRequest('A valid phone number is required')
    if (!address) return badRequest('address is required')
    if (lat === null || lng === null) return badRequest('Select a valid address from autocomplete')
    if (monthlyHydroBill === null && annualKwh === null) {
      return badRequest('monthly_hydro_bill or annual_kwh is required')
    }
    if (body.consent_to_contact !== true) {
      return badRequest('consent_to_contact is required')
    }

    const fullName = `${firstName} ${lastName}`.trim()
    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from('prospects')
      .insert({
        address,
        lat,
        lng,
        business_name: `${fullName} Residence`,
        owner_name: fullName,
        owner_email: email,
        owner_phone: phone,
        first_name: firstName,
        last_name: lastName,
        homeowner_email: email,
        homeowner_phone: phone,
        monthly_hydro_bill: monthlyHydroBill,
        annual_kwh: annualKwh,
        heating_type: cleanText(body.heating_type) || null,
        has_ev: body.has_ev ?? null,
        ev_interest: body.ev_interest ?? null,
        heat_pump_interest: body.heat_pump_interest ?? null,
        solar_interest: body.solar_interest ?? true,
        ev_charger_interest: body.ev_charger_interest ?? null,
        home_type: cleanText(body.home_type) || null,
        owns_home: body.owns_home ?? null,
        timeline: cleanText(body.timeline) || null,
        financing_interest: body.financing_interest ?? null,
        consent_to_contact: true,
        intake_notes: cleanText(body.intake_notes) || null,
        category: 'residential_energy_bundle',
        location: inferLocation(address),
        source: 'residential_landing_page',
        lead_source: cleanText(body.lead_source) || 'home_energy_landing_page',
        pipeline_stage: 'sourced',
        coordinate_quality: 'homeowner_submitted',
        needs_review: false,
        visual_lat: lat,
        visual_lng: lng,
        visual_verified: true,
        visual_verified_at: new Date().toISOString(),
        visual_review_note: 'Homeowner-submitted address from residential lead magnet.',
        bundle_interest: {
          solar: body.solar_interest ?? true,
          heatPump: body.heat_pump_interest ?? false,
          evCharger: body.ev_charger_interest ?? false,
          hasEv: body.has_ev ?? false,
          evInterest: body.ev_interest ?? false,
        },
      })
      .select('id')
      .single()

    if (error) {
      console.error('[residential-intake] Supabase insert failed', error)
      return NextResponse.json({ error: 'Could not save your request. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, prospect_id: data.id })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[residential-intake]', message)
    return NextResponse.json({ error: 'Could not save your request. Please try again.' }, { status: 500 })
  }
}

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 })
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 1000) : ''
}

function toFiniteNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function toPositiveNumber(value: unknown) {
  const number = toFiniteNumber(value)
  return number !== null && number > 0 ? number : null
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function inferLocation(address: string) {
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean)
  if (parts.length >= 3) return `${parts.at(-3)}, ${parts.at(-2)}`
  return parts.at(-2) || parts.at(-1) || null
}
