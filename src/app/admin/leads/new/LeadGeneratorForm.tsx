'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Check, ChevronRight, Copy, LayoutDashboard, Loader2, TriangleAlert } from 'lucide-react'
import { SolarUtils } from '@/lib/solar-utils'
import AddressAutocomplete, { type PlaceResult } from '@/components/AddressAutocomplete'
import Link from 'next/link'

const inputClass = 'w-full border border-white/10 bg-[#090d12] px-3 py-3 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-slate-400'
const labelClass = 'font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500'

type CreateProposalResponse = {
  success?: boolean
  pending?: boolean
  slug?: string
  url?: string
  proposal_url?: string
  error?: string
}

export default function LeadGeneratorForm() {
  const [loading, setLoading] = useState(false)
  const [successData, setSuccessData] = useState<{ url: string; slug: string } | null>(null)
  const [pendingData, setPendingData] = useState<{ slug: string; message: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const latRef = useRef<HTMLInputElement>(null)
  const lngRef = useRef<HTMLInputElement>(null)
  const businessNameRef = useRef<HTMLInputElement>(null)

  async function geocodeAddress(address: string) {
    const google = (window as any).google
    if (!google?.maps?.Geocoder) return null

    const geocoder = new google.maps.Geocoder()
    const response = await geocoder.geocode({ address })
    const result = response.results?.[0]
    const location = result?.geometry?.location
    if (!location) return null

    return {
      formattedAddress: result.formatted_address || address,
      lat: location.lat(),
      lng: location.lng(),
    }
  }

  async function handlePlaceSelect({ lat, lng, name }: PlaceResult) {
    if (latRef.current) latRef.current.value = String(lat)
    if (lngRef.current) lngRef.current.value = String(lng)

    if (businessNameRef.current && !businessNameRef.current.value && name) {
      businessNameRef.current.value = name
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setErrorMessage(null)
    setPendingData(null)

    const formData = new FormData(e.currentTarget)
    const businessName = String(formData.get('business_name') || '').trim()
    let address = String(formData.get('address') || '').trim()
    let lat = latRef.current?.value ? Number(latRef.current.value) : null
    let lng = lngRef.current?.value ? Number(lngRef.current.value) : null

    try {
      if (!businessName) throw new Error('Business name is required.')
      if (!address) throw new Error('Address is required.')

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        const geocoded = await geocodeAddress(address)
        if (!geocoded) {
          throw new Error('Choose an address from autocomplete so we can send coordinates to n8n.')
        }

        address = geocoded.formattedAddress
        lat = geocoded.lat
        lng = geocoded.lng
        if (latRef.current) latRef.current.value = String(lat)
        if (lngRef.current) lngRef.current.value = String(lng)
      }

      const slug = SolarUtils.generateSlug(businessName)
      const res = await fetch('/api/create-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: businessName,
          address,
          lat,
          lng,
          slug,
        }),
      })

      const data = (await res.json()) as CreateProposalResponse
      if (res.status === 202 && data.pending) {
        setPendingData({
          slug: data.slug || slug,
          message: data.error || 'n8n accepted the request, but the lead is not live yet.',
        })
        return
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'n8n failed to create the proposal.')
      }

      const proposalUrl = data.proposal_url || data.url || `https://heliocap.vercel.app/proposal/${data.slug || slug}`
      setSuccessData({ url: proposalUrl, slug: data.slug || slug })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create proposal.'
      setErrorMessage(message)
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = () => {
    if (successData) {
      navigator.clipboard.writeText(successData.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (successData) {
    return (
      <div className="border border-white/10 bg-[#0b1016] p-8 text-slate-100">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-4 grid h-12 w-12 place-items-center border border-emerald-300/25 bg-emerald-300/10">
              <Check className="h-6 w-6 text-emerald-200" />
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">n8n worker complete</div>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white">Proposal created</h2>
            <p className="mt-2 text-sm text-slate-400">The worker generated assets, published the lead, and returned the live page.</p>
          </div>
          <Link href="/admin" className="inline-flex h-10 items-center justify-center gap-2 border border-white/10 px-4 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-300 transition-colors hover:border-white/25 hover:text-white">
            <LayoutDashboard className="h-3.5 w-3.5" />
            Dashboard
          </Link>
        </div>

        <div className="mt-8 flex items-center gap-2 border border-white/10 bg-[#090d12] p-3">
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-slate-300">{successData.url}</code>
          <Button onClick={copyToClipboard} size="sm" className="rounded-none bg-slate-100 text-slate-950 hover:bg-white">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.18em]">{copied ? 'Copied' : 'Copy'}</span>
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <a href={successData.url} target="_blank" className="flex h-12 items-center justify-center border border-white/15 bg-white text-sm font-semibold text-slate-950 transition-colors hover:bg-slate-200">
            View live page
          </a>
          <Button variant="outline" onClick={() => window.location.reload()} className="h-12 rounded-none border-white/15 bg-transparent font-mono text-[10px] uppercase tracking-[0.2em] text-slate-200 hover:bg-white/10">
            Create another
          </Button>
        </div>
      </div>
    )
  }

  if (pendingData) {
    return (
      <div className="border border-amber-300/20 bg-[#0b1016] p-8 text-slate-100">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-4 grid h-12 w-12 place-items-center border border-amber-300/25 bg-amber-300/10">
              <Loader2 className="h-6 w-6 animate-spin text-amber-200" />
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">n8n worker still running</div>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white">Proposal is queued</h2>
            <p className="mt-2 max-w-xl text-sm text-slate-400">{pendingData.message}</p>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
              Expected slug: {pendingData.slug}
            </p>
          </div>
          <Link href="/admin" className="inline-flex h-10 items-center justify-center gap-2 border border-white/10 px-4 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-300 transition-colors hover:border-white/25 hover:text-white">
            <LayoutDashboard className="h-3.5 w-3.5" />
            Dashboard
          </Link>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Link href="/admin" className="flex h-12 items-center justify-center border border-white/15 bg-white text-sm font-semibold text-slate-950 transition-colors hover:bg-slate-200">
            Check dashboard
          </Link>
          <Button variant="outline" onClick={() => window.location.reload()} className="h-12 rounded-none border-white/15 bg-transparent font-mono text-[10px] uppercase tracking-[0.2em] text-slate-200 hover:bg-white/10">
            Create another
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <input type="hidden" name="lat" ref={latRef} />
      <input type="hidden" name="lng" ref={lngRef} />

      <section className="border border-white/10 bg-[#0b1016]">
        <div className="border-b border-white/10 px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">01 / Proposal request</div>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-white">Send one target to n8n</h2>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label className={labelClass}>Business name</label>
              <input ref={businessNameRef} name="business_name" required placeholder="Apex Logistics Center" className={inputClass} />
            </div>
            <div className="space-y-2">
              <label className={labelClass}>Business address</label>
              <AddressAutocomplete
                name="address"
                required
                placeholder="Start typing an address"
                onPlaceSelect={handlePlaceSelect}
                className={inputClass}
              />
            </div>
          </div>

          <div className="border border-cyan-200/15 bg-cyan-200/[0.035] p-4 text-sm text-slate-400">
            The site sends this target to n8n. n8n generates the roof image, solar data, preview image, and then publishes the proposal through <span className="font-mono text-cyan-100">/api/leads</span>.
          </div>
        </div>
      </section>

      {errorMessage && (
        <div className="flex items-center gap-2 border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          <TriangleAlert className="h-4 w-4" />
          {errorMessage}
        </div>
      )}

      <div className="border border-white/10 bg-[#0b1016] p-5">
        <Button
          type="submit"
          disabled={loading}
          className="h-14 w-full rounded-none bg-slate-100 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-slate-950 hover:bg-white disabled:opacity-50"
        >
          {loading ? <Loader2 className="mr-3 h-5 w-5 animate-spin" /> : <ChevronRight className="mr-3 h-5 w-5" />}
          {loading ? 'Running n8n worker' : 'Create Proposal'}
        </Button>
      </div>
    </form>
  )
}
