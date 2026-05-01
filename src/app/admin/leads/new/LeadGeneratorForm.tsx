'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Check, ChevronRight, Copy, ImageUp, LayoutDashboard, Loader2, Satellite, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { StorageService } from '@/services/storage.service'
import { SolarUtils } from '@/lib/solar-utils'
import AddressAutocomplete, { type PlaceResult } from '@/components/AddressAutocomplete'
import Link from 'next/link'

const inputClass = 'w-full border border-white/10 bg-[#090d12] px-3 py-3 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-slate-400'
const labelClass = 'font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500'

type SolarModel = {
  panelCount: number
  maxPanelCount: number
  systemSizeKw: number
  yearlyKwh: number
  yearlySavings: number
  savings25yr: number
  systemCost: number
  federalItc: number
  estimatedPayback: number
  utilityRate: number
  usableRoofAreaSqft: number | null
  quality: 'google_solar' | 'fallback'
}

function buildNotes(notes: string, model: SolarModel | null) {
  if (!model) return notes

  const modelSummary = [
    'OpenClaw Google Solar model',
    `quality=${model.quality}`,
    `panels=${model.panelCount}/${model.maxPanelCount}`,
    `system_kw=${model.systemSizeKw}`,
    `yearly_kwh=${model.yearlyKwh}`,
    `yearly_savings=${model.yearlySavings}`,
    `federal_itc=${model.federalItc}`,
  ].join('; ')

  return notes ? `${notes}\n\n${modelSummary}` : modelSummary
}

export default function LeadGeneratorForm() {
  const [loading, setLoading] = useState(false)
  const [successData, setSuccessData] = useState<{ url: string; slug: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [autoRoofUrl, setAutoRoofUrl] = useState<string | null>(null)
  const [roofGenerating, setRoofGenerating] = useState(false)
  const [manualRoofPreview, setManualRoofPreview] = useState<string | null>(null)
  const [renderPreview, setRenderPreview] = useState<string | null>(null)
  const [autoRenderUrl, setAutoRenderUrl] = useState<string | null>(null)
  const [solarModel, setSolarModel] = useState<SolarModel | null>(null)
  const [intelligenceError, setIntelligenceError] = useState<string | null>(null)

  const manualRoofFileRef = useRef<HTMLInputElement>(null)
  const latRef = useRef<HTMLInputElement>(null)
  const lngRef = useRef<HTMLInputElement>(null)
  const pendingSlugRef = useRef<string | null>(null)
  const businessNameRef = useRef<HTMLInputElement>(null)

  async function handlePlaceSelect({ formattedAddress, lat, lng }: PlaceResult) {
    if (latRef.current) latRef.current.value = String(lat)
    if (lngRef.current) lngRef.current.value = String(lng)

    const businessName = businessNameRef.current?.value?.trim() || formattedAddress
    const slug = SolarUtils.generateSlug(businessName)
    pendingSlugRef.current = slug

    setRoofGenerating(true)
    setAutoRoofUrl(null)
    setAutoRenderUrl(null)
    setSolarModel(null)
    setIntelligenceError(null)
    try {
      const res = await fetch('/api/generate-roof-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, slug, formattedAddress }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch site intelligence')
      if (data.roof_image_url) setAutoRoofUrl(data.roof_image_url)
      if (data.render_image_url) {
        setAutoRenderUrl(data.render_image_url)
        setRenderPreview(data.render_image_url)
      }
      if (data.solar_model) setSolarModel(data.solar_model)
    } catch (err) {
      console.error('Roof image generation failed:', err)
      setIntelligenceError(err instanceof Error ? err.message : 'Site intelligence failed')
    } finally {
      setRoofGenerating(false)
    }
  }

  function handleManualRoofChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => setManualRoofPreview(reader.result as string)
    reader.readAsDataURL(file)
    setAutoRoofUrl(null)
  }

  function handleRenderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => setRenderPreview(reader.result as string)
    reader.readAsDataURL(file)
    setAutoRenderUrl(null)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const supabase = createClient()

    try {
      const business_name = formData.get('business_name') as string
      let slug = SolarUtils.generateSlug(business_name)

      const { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()

      if (existingLead) {
        slug = `${slug}-${Math.random().toString(36).substring(2, 6)}`
      }

      const roofFile = formData.get('roof_image') as File
      let roof_url = autoRoofUrl || ''

      if (roofFile?.size > 0) {
        roof_url = await StorageService.uploadLeadImage(supabase, slug, roofFile, 'roof') || ''
      } else if (autoRoofUrl && pendingSlugRef.current && pendingSlugRef.current !== slug) {
        try {
          const lat = latRef.current?.value
          const lng = lngRef.current?.value
          if (lat && lng) {
            const res = await fetch('/api/generate-roof-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lat: parseFloat(lat), lng: parseFloat(lng), slug }),
            })
            const data = await res.json()
            roof_url = data.roof_image_url || roof_url
            if (data.render_image_url) {
              setAutoRenderUrl(data.render_image_url)
              setRenderPreview(data.render_image_url)
            }
            if (data.solar_model) setSolarModel(data.solar_model)
          }
        } catch {
          // Keep the already generated URL if re-keying the storage path fails.
        }
      }

      const renderFile = formData.get('render_image') as File
      let render_url = autoRenderUrl || ''
      if (renderFile?.size > 0) {
        render_url = await StorageService.uploadLeadImage(supabase, slug, renderFile, 'render') || ''
      }

      const building_type = formData.get('building_type') as string
      const manual_savings = formData.get('savings_override') as string

      let estimated_savings = manual_savings ? parseFloat(manual_savings) : 0
      let estimated_payback = 5.5

      if (!manual_savings && solarModel) {
        estimated_savings = solarModel.yearlySavings
        estimated_payback = solarModel.estimatedPayback
      } else if (!manual_savings) {
        const sqft = SolarUtils.getProxySqftByBuildingType(building_type)
        const rate = SolarUtils.getRateByBuildingType(building_type)
        const est = SolarUtils.calculateEstimation(sqft, rate)
        estimated_savings = est.savings
        estimated_payback = est.payback
      }

      const { error } = await supabase
        .from('leads')
        .insert([{
          business_name,
          contact_name: formData.get('contact_name'),
          address: formData.get('address'),
          lat: latRef.current?.value ? parseFloat(latRef.current.value) : null,
          lng: lngRef.current?.value ? parseFloat(lngRef.current.value) : null,
          building_type,
          slug,
          roof_image_url: roof_url || null,
          render_image_url: render_url || roof_url || null,
          estimated_savings,
          estimated_payback,
          roof_sqft: solarModel?.usableRoofAreaSqft || null,
          utility_rate: solarModel?.utilityRate || null,
          notes: buildNotes(formData.get('notes') as string, solarModel),
          status: 'published',
        }])
        .select()
        .single()

      if (error) throw error

      const fullUrl = `${window.location.origin}/proposal/${slug}`
      setSuccessData({ url: fullUrl, slug })
    } catch (err) {
      console.error(err)
      alert('Failed to generate page. Check console.')
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

  const roofPreviewSrc = manualRoofPreview || autoRoofUrl
  const roofIsAuto = !manualRoofPreview && !!autoRoofUrl

  if (successData) {
    return (
      <div className="border border-white/10 bg-[#0b1016] p-8 text-slate-100">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-4 grid h-12 w-12 place-items-center border border-emerald-300/25 bg-emerald-300/10">
              <Check className="h-6 w-6 text-emerald-200" />
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">Publication complete</div>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white">Portfolio generated</h2>
            <p className="mt-2 text-sm text-slate-400">The outreach page for {successData.slug} is live.</p>
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
            Generate another
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
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">01 / Site imagery</div>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-white">Google site intelligence</h2>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <div className="space-y-3">
            <label className={labelClass}>Roof satellite image</label>
            <div className="relative min-h-64 overflow-hidden border border-white/10 bg-[#090d12]">
              {roofGenerating ? (
                <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em]">Fetching satellite + solar geometry</p>
                </div>
              ) : roofPreviewSrc ? (
                <>
                  <img src={roofPreviewSrc} className="h-64 w-full object-cover" alt="Roof preview" />
                  {roofIsAuto && (
                    <div className="absolute left-3 top-3 border border-white/15 bg-black/65 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-white">
                      Auto-generated
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-slate-500">
                  <Satellite className="h-7 w-7" />
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em]">Select an address to fetch imagery</p>
                  <p className="max-w-xs text-xs text-slate-600">Manual upload remains available as a fallback.</p>
                </div>
              )}

              <input
                ref={manualRoofFileRef}
                type="file"
                name="roof_image"
                accept="image/*"
                onChange={handleManualRoofChange}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Upload className="h-3.5 w-3.5" />
              Click the image area to replace with an uploaded roof asset.
            </div>
            {intelligenceError && (
              <div className="border border-amber-300/25 bg-amber-300/10 p-3 text-xs text-amber-100">
                Google site intelligence did not complete: {intelligenceError}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <label className={labelClass}>Solar panel render</label>
            <div className="relative min-h-64 overflow-hidden border border-white/10 bg-[#090d12]">
              {renderPreview ? (
                <img src={renderPreview} className="h-64 w-full object-cover" alt="Render preview" />
              ) : (
                <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-slate-500">
                  <ImageUp className="h-7 w-7" />
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em]">Auto-render appears after address lookup</p>
                  <p className="text-xs text-slate-600">Optional manual PNG/JPG upload overrides it.</p>
                </div>
              )}
              <input
                type="file"
                name="render_image"
                accept="image/*"
                onChange={handleRenderChange}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </div>
            {solarModel && (
              <div className="grid grid-cols-2 gap-2">
                <div className="border border-white/10 bg-white/[0.025] p-3">
                  <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Panels</div>
                  <div className="num mt-1 text-lg font-semibold text-white">{solarModel.panelCount.toLocaleString()}</div>
                </div>
                <div className="border border-white/10 bg-white/[0.025] p-3">
                  <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">System</div>
                  <div className="num mt-1 text-lg font-semibold text-white">{solarModel.systemSizeKw.toLocaleString()} kW</div>
                </div>
                <div className="border border-white/10 bg-white/[0.025] p-3">
                  <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Year 1</div>
                  <div className="num mt-1 text-lg font-semibold text-white">${solarModel.yearlySavings.toLocaleString()}</div>
                </div>
                <div className="border border-white/10 bg-white/[0.025] p-3">
                  <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Federal ITC</div>
                  <div className="num mt-1 text-lg font-semibold text-white">${solarModel.federalItc.toLocaleString()}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="border border-white/10 bg-[#0b1016]">
        <div className="border-b border-white/10 px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">02 / Target dossier</div>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-white">Business and site details</h2>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label className={labelClass}>Business name</label>
              <input ref={businessNameRef} name="business_name" required placeholder="Apex Logistics Center" className={inputClass} />
            </div>
            <div className="space-y-2">
              <label className={labelClass}>Contact name</label>
              <input name="contact_name" required placeholder="John Smith" className={inputClass} />
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label className={labelClass}>Building type</label>
              <select name="building_type" required className={`${inputClass} appearance-none`}>
                <option value="warehouse">Warehouse</option>
                <option value="factory">Manufacturing/Factory</option>
                <option value="office">Office Building</option>
                <option value="cold_storage">Cold Storage</option>
                <option value="retail">Retail/Big Box</option>
              </select>
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
        </div>
      </section>

      <section className="border border-white/10 bg-[#0b1016]">
        <div className="border-b border-white/10 px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">03 / Economics</div>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-white">Modeling inputs</h2>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-2">
          <div className="space-y-2">
            <label className={labelClass}>Savings override</label>
            <input name="savings_override" type="number" placeholder="Leave blank for modeled estimate" className={inputClass} />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>Internal notes</label>
            <input name="notes" placeholder="Source, referral, campaign notes" className={inputClass} />
          </div>
        </div>
      </section>

      <div className="border border-white/10 bg-[#0b1016] p-5">
        <Button
          type="submit"
          disabled={loading}
          className="h-14 w-full rounded-none bg-slate-100 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-slate-950 hover:bg-white disabled:opacity-50"
        >
          {loading ? <Loader2 className="mr-3 h-5 w-5 animate-spin" /> : <ChevronRight className="mr-3 h-5 w-5" />}
          {loading ? 'Publishing portfolio' : 'Generate client page'}
        </Button>
      </div>
    </form>
  )
}
