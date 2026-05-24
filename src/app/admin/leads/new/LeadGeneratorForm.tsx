'use client'

import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import Link from 'next/link'
import { CheckCircle2, ChevronRight, Home, Loader2, RadioTower, TriangleAlert } from 'lucide-react'
import AddressAutocomplete, { type PlaceResult } from '@/components/AddressAutocomplete'

const panelCls = 'rounded-xl border border-[#1e2530] bg-[#111418] overflow-hidden'
const sectionHead = 'border-b border-[#1e2530] px-5 py-4 bg-[#0f1216]'
const fieldsCls = 'space-y-4 p-5'
const inputCls = 'w-full rounded-lg border border-[#1e2530] bg-[#0c0d10] px-3 py-2.5 text-[13px] text-[#e0ddd8] placeholder:text-[#2a3040] outline-none transition-colors focus:border-[#d99a3d]/50 focus:ring-1 focus:ring-[#d99a3d]/15'
const selectCls = `${inputCls} appearance-none cursor-pointer`
const labelCls = 'block text-[10px] font-bold uppercase tracking-[0.15em] text-[#4a5560] mb-1.5'

type SubmitState = {
  status: 'idle' | 'submitting' | 'success' | 'error'
  message: string | null
  prospectId?: string | null
}

type ResidentialIntakeResponse = {
  success?: boolean
  prospect_id?: string
  error?: string
}

export default function LeadGeneratorForm() {
  const [place, setPlace] = useState<PlaceResult | null>(null)
  const [state, setState] = useState<SubmitState>({ status: 'idle', message: null })

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)

    if (!place) {
      setState({
        status: 'error',
        message: 'Pick the address from autocomplete so the prospect saves with roof coordinates.',
      })
      return
    }

    setState({ status: 'submitting', message: null })

    const payload = {
      first_name: String(formData.get('first_name') || ''),
      last_name: String(formData.get('last_name') || ''),
      email: String(formData.get('email') || ''),
      phone: String(formData.get('phone') || ''),
      address: place.formattedAddress,
      lat: place.lat,
      lng: place.lng,
      monthly_hydro_bill: Number(formData.get('monthly_hydro_bill') || 0),
      annual_kwh: Number(formData.get('annual_kwh') || 0) || null,
      heating_type: String(formData.get('heating_type') || ''),
      home_type: String(formData.get('home_type') || ''),
      owns_home: formData.get('owns_home') === 'yes',
      has_ev: formData.get('has_ev') === 'yes',
      ev_interest: formData.get('ev_interest') === 'on',
      ev_charger_interest: formData.get('ev_charger_interest') === 'on',
      heat_pump_interest: formData.get('heat_pump_interest') === 'on',
      solar_interest: true,
      financing_interest: formData.get('financing_interest') === 'on',
      timeline: String(formData.get('timeline') || ''),
      intake_notes: String(formData.get('intake_notes') || ''),
      consent_to_contact: true,
      lead_source: 'admin_manual_residential_intake',
      website: '',
    }

    try {
      const response = await fetch('/api/residential-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = (await response.json()) as ResidentialIntakeResponse

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Could not save this residential prospect.')
      }

      form.reset()
      setPlace(null)
      setState({
        status: 'success',
        message: 'Residential prospect saved. You can verify the target roof from the prospects table before creating a proposal.',
        prospectId: result.prospect_id || null,
      })
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Could not save this residential prospect.',
      })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <section className={panelCls}>
        <div className={sectionHead}>
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#4a5560]">Manual residential intake</div>
          <div className="mt-1 text-[15px] font-semibold text-[#e0ddd8]">Homeowner details</div>
          <p className="mt-1 text-[12px] text-[#3a4048]">Matches the landing page intake fields.</p>
        </div>

        <div className={fieldsCls}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="First name">
              <input name="first_name" required placeholder="Danzel" className={inputCls} />
            </Field>
            <Field label="Last name">
              <input name="last_name" required placeholder="Gaminde" className={inputCls} />
            </Field>
            <Field label="Email">
              <input name="email" required type="email" placeholder="homeowner@email.com" className={inputCls} />
            </Field>
            <Field label="Phone">
              <input name="phone" required type="tel" placeholder="(416) 555-0199" className={inputCls} />
            </Field>
          </div>

          <Field label="Home address">
            <AddressAutocomplete
              name="address"
              required
              placeholder="Start typing the home address"
              onPlaceSelect={setPlace}
              className={inputCls}
            />
            {place && (
              <p className="mt-1.5 text-[11px] text-emerald-400/80">
                Roof coordinates captured: {place.formattedAddress}
              </p>
            )}
          </Field>
        </div>
      </section>

      <section className={panelCls}>
        <div className={sectionHead}>
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#4a5560]">Energy profile</div>
          <div className="mt-1 text-[15px] font-semibold text-[#e0ddd8]">Savings inputs</div>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Average monthly hydro bill">
            <input
              name="monthly_hydro_bill"
              required
              type="number"
              min="1"
              inputMode="decimal"
              placeholder="250"
              className={inputCls}
            />
          </Field>
          <Field label="Annual kWh, optional">
            <input
              name="annual_kwh"
              type="number"
              min="1"
              inputMode="decimal"
              placeholder="12000"
              className={inputCls}
            />
          </Field>
          <Field label="Current heating">
            <select name="heating_type" required defaultValue="" className={selectCls}>
              <option value="" disabled>Choose heating type</option>
              <option value="natural_gas">Natural gas</option>
              <option value="electric_baseboard">Electric baseboard</option>
              <option value="propane">Propane</option>
              <option value="oil">Oil</option>
              <option value="heat_pump">Heat pump</option>
              <option value="not_sure">Not sure</option>
            </select>
          </Field>
          <Field label="Home type">
            <select name="home_type" required defaultValue="" className={selectCls}>
              <option value="" disabled>Choose home type</option>
              <option value="detached">Detached</option>
              <option value="semi_detached">Semi-detached</option>
              <option value="townhome">Townhome</option>
              <option value="duplex">Duplex</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Owns the home?">
            <select name="owns_home" required defaultValue="" className={selectCls}>
              <option value="" disabled>Choose one</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
          <Field label="Has an EV?">
            <select name="has_ev" required defaultValue="" className={selectCls}>
              <option value="" disabled>Choose one</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
        </div>
      </section>

      <section className={panelCls}>
        <div className={sectionHead}>
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#4a5560]">Bundle</div>
          <div className="mt-1 text-[15px] font-semibold text-[#e0ddd8]">Products to include</div>
        </div>

        <div className={fieldsCls}>
          <div className="grid gap-3 rounded-xl border border-[#1e2530] bg-[#0c0d10] p-4 text-[13px] text-[#e0ddd8] sm:grid-cols-2">
            <label className="flex items-center gap-3">
              <input name="heat_pump_interest" type="checkbox" className="h-4 w-4 rounded border border-[#1e2530] accent-[#d99a3d] cursor-pointer" />
              Include heat pump savings
            </label>
            <label className="flex items-center gap-3">
              <input name="ev_charger_interest" type="checkbox" className="h-4 w-4 rounded border border-[#1e2530] accent-[#d99a3d] cursor-pointer" />
              Include EV charger
            </label>
            <label className="flex items-center gap-3">
              <input name="ev_interest" type="checkbox" className="h-4 w-4 rounded border border-[#1e2530] accent-[#d99a3d] cursor-pointer" />
              Planning to buy an EV
            </label>
            <label className="flex items-center gap-3">
              <input name="financing_interest" type="checkbox" className="h-4 w-4 rounded border border-[#1e2530] accent-[#d99a3d] cursor-pointer" />
              Show financing options
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
            <Field label="Timeline">
              <select name="timeline" required defaultValue="" className={selectCls}>
                <option value="" disabled>Choose timeline</option>
                <option value="asap">As soon as possible</option>
                <option value="1_3_months">1-3 months</option>
                <option value="3_6_months">3-6 months</option>
                <option value="researching">Just researching</option>
              </select>
            </Field>
            <Field label="Notes">
              <input name="intake_notes" placeholder="Anything useful for the proposal?" className={inputCls} />
            </Field>
          </div>
        </div>
      </section>

      {state.message && (
        <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-[13px] ${
          state.status === 'success'
            ? 'border-[#3a2f1e] bg-[#19140c] text-[#d99a3d]'
            : 'border-red-500/20 bg-red-500/5 text-red-300'
        }`}>
          {state.status === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
          <div>
            <div>{state.message}</div>
            {state.status === 'success' && (
              <Link href="/admin/pipeline" prefetch className="mt-2 inline-flex items-center gap-2 text-[12px] font-semibold text-[#d99a3d] hover:text-[#e6a845]">
                <RadioTower className="h-3.5 w-3.5" />
                Open prospects table
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-[#1e2530] bg-[#111418] p-5">
        <button
          type="submit"
          disabled={state.status === 'submitting'}
          className="h-11 w-full rounded-lg bg-[#d99a3d] text-[13px] font-bold text-[#1a0e00] transition-colors hover:bg-[#e6a845] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {state.status === 'submitting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          {state.status === 'submitting' ? 'Saving prospect…' : 'Save residential prospect'}
        </button>

        <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-[#3a4048]">
          <Home className="h-3.5 w-3.5" />
          Create proposals from Prospects after roof verification.
        </div>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  )
}
