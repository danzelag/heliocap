'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'
import AddressAutocomplete, { type PlaceResult } from '@/components/AddressAutocomplete'
import { Button } from '@/components/ui/button'

type SubmitState = {
  status: 'idle' | 'submitting' | 'success' | 'error'
  message: string | null
}

const inputClass =
  'h-12 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm text-white outline-none transition focus:border-amber-300/70 focus:ring-4 focus:ring-amber-300/10 placeholder:text-slate-500'

const selectClass = `${inputClass} appearance-none`

export function HomeEnergyIntakeForm() {
  const [place, setPlace] = useState<PlaceResult | null>(null)
  const [state, setState] = useState<SubmitState>({ status: 'idle', message: null })

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)

    if (!place) {
      setState({ status: 'error', message: 'Pick your address from the dropdown so we can lock the right roof.' })
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
      consent_to_contact: formData.get('consent_to_contact') === 'on',
      lead_source: 'residential_landing_page',
      website: String(formData.get('website') || ''),
    }

    try {
      const response = await fetch('/api/residential-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = (await response.json()) as { success?: boolean; error?: string }

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Something went wrong. Please try again.')
      }

      form.reset()
      setPlace(null)
      setState({
        status: 'success',
        message: 'Request received. We saved your home energy profile and will prepare the next step.',
      })
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Something went wrong. Please try again.',
      })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[2rem] border border-white/10 bg-[#0a171f]/90 p-5 shadow-2xl shadow-black/30 backdrop-blur md:p-6">
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-200/80">Free home savings check</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Generate my tailored proposal</h2>
        </div>
        <div className="rounded-full border border-amber-300/25 bg-amber-300/10 p-2 text-amber-200">
          <ShieldCheck className="h-5 w-5" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <input name="first_name" required placeholder="First name" className={inputClass} />
        <input name="last_name" required placeholder="Last name" className={inputClass} />
        <input name="email" required type="email" placeholder="Email" className={inputClass} />
        <input name="phone" required type="tel" placeholder="Phone" className={inputClass} />
      </div>

      <div className="mt-3">
        <AddressAutocomplete
          name="address"
          required
          placeholder="Home address"
          className={inputClass}
          onPlaceSelect={setPlace}
        />
        {place && (
          <p className="mt-2 text-xs text-emerald-200">
            Roof locked: {place.formattedAddress}
          </p>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <input
          name="monthly_hydro_bill"
          required
          type="number"
          min="1"
          inputMode="decimal"
          placeholder="Average monthly hydro bill"
          className={inputClass}
        />
        <input
          name="annual_kwh"
          type="number"
          min="1"
          inputMode="decimal"
          placeholder="Annual kWh, optional"
          className={inputClass}
        />
        <select name="heating_type" required defaultValue="" className={selectClass}>
          <option value="" disabled>Current heating</option>
          <option value="natural_gas">Natural gas</option>
          <option value="electric_baseboard">Electric baseboard</option>
          <option value="propane">Propane</option>
          <option value="oil">Oil</option>
          <option value="heat_pump">Heat pump</option>
          <option value="not_sure">Not sure</option>
        </select>
        <select name="home_type" required defaultValue="" className={selectClass}>
          <option value="" disabled>Home type</option>
          <option value="detached">Detached</option>
          <option value="semi_detached">Semi-detached</option>
          <option value="townhome">Townhome</option>
          <option value="duplex">Duplex</option>
          <option value="other">Other</option>
        </select>
        <select name="owns_home" required defaultValue="" className={selectClass}>
          <option value="" disabled>Do you own the home?</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
        <select name="has_ev" required defaultValue="" className={selectClass}>
          <option value="" disabled>Do you have an EV?</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </div>

      <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-200 sm:grid-cols-2">
        <label className="flex items-center gap-3">
          <input name="heat_pump_interest" type="checkbox" className="h-4 w-4 accent-amber-300" />
          Include heat pump savings
        </label>
        <label className="flex items-center gap-3">
          <input name="ev_charger_interest" type="checkbox" className="h-4 w-4 accent-amber-300" />
          Include EV charger
        </label>
        <label className="flex items-center gap-3">
          <input name="ev_interest" type="checkbox" className="h-4 w-4 accent-amber-300" />
          Planning to buy an EV
        </label>
        <label className="flex items-center gap-3">
          <input name="financing_interest" type="checkbox" className="h-4 w-4 accent-amber-300" />
          Show financing options
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1.2fr]">
        <select name="timeline" required defaultValue="" className={selectClass}>
          <option value="" disabled>Timeline</option>
          <option value="asap">As soon as possible</option>
          <option value="1_3_months">1-3 months</option>
          <option value="3_6_months">3-6 months</option>
          <option value="researching">Just researching</option>
        </select>
        <input name="intake_notes" placeholder="Anything we should know? Optional" className={inputClass} />
      </div>

      <label className="mt-4 flex items-start gap-3 text-xs leading-relaxed text-slate-400">
        <input name="consent_to_contact" required type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-amber-300" />
        I agree Helio Cap can contact me about my home energy proposal. No spam, no weirdness.
      </label>

      <Button
        type="submit"
        disabled={state.status === 'submitting'}
        className="mt-5 h-12 w-full rounded-2xl bg-amber-300 text-base font-bold text-slate-950 hover:bg-amber-200"
      >
        {state.status === 'submitting' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
        {state.status === 'submitting' ? 'Saving request' : 'Get my savings proposal'}
      </Button>

      {state.message && (
        <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
          state.status === 'success'
            ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'
            : 'border-red-300/30 bg-red-300/10 text-red-100'
        }`}>
          {state.message}
        </div>
      )}
    </form>
  )
}
