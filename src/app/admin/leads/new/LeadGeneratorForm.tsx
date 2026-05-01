'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Check, Copy, Loader2, LayoutDashboard, Upload, Zap, Satellite } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { StorageService } from '@/services/storage.service'
import { SolarUtils } from '@/lib/solar-utils'
import AddressAutocomplete, { type PlaceResult } from '@/components/AddressAutocomplete'
import Link from 'next/link'

export default function LeadGeneratorForm() {
  const [loading, setLoading] = useState(false)
  const [successData, setSuccessData] = useState<{ url: string; slug: string } | null>(null)
  const [copied, setCopied] = useState(false)

  // Roof: can be auto-generated from address or manually uploaded
  const [autoRoofUrl, setAutoRoofUrl] = useState<string | null>(null)
  const [roofGenerating, setRoofGenerating] = useState(false)
  const [manualRoofPreview, setManualRoofPreview] = useState<string | null>(null)
  const manualRoofFileRef = useRef<HTMLInputElement>(null)

  // Render image
  const [renderPreview, setRenderPreview] = useState<string | null>(null)

  // Geocoords captured from autocomplete
  const latRef = useRef<HTMLInputElement>(null)
  const lngRef = useRef<HTMLInputElement>(null)
  // Slug generated at address-selection time so we can upload to the right path
  const pendingSlugRef = useRef<string | null>(null)

  const businessNameRef = useRef<HTMLInputElement>(null)

  // ── Address autocomplete handler ────────────────────────────────────────────
  async function handlePlaceSelect({ formattedAddress, lat, lng }: PlaceResult) {
    if (latRef.current) latRef.current.value = String(lat)
    if (lngRef.current) lngRef.current.value = String(lng)

    // Derive a slug from business name (if filled) or address
    const businessName = businessNameRef.current?.value?.trim() || formattedAddress
    const slug = SolarUtils.generateSlug(businessName)
    pendingSlugRef.current = slug

    // Auto-generate roof image
    setRoofGenerating(true)
    setAutoRoofUrl(null)
    try {
      const res = await fetch('/api/generate-roof-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, slug, formattedAddress }),
      })
      const data = await res.json()
      if (data.roof_image_url) {
        setAutoRoofUrl(data.roof_image_url)
      }
    } catch (err) {
      console.error('Roof image generation failed:', err)
    } finally {
      setRoofGenerating(false)
    }
  }

  // ── Manual file handlers ────────────────────────────────────────────────────
  function handleManualRoofChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => setManualRoofPreview(reader.result as string)
    reader.readAsDataURL(file)
    // Manual upload overrides auto-generated image
    setAutoRoofUrl(null)
  }

  function handleRenderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => setRenderPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  // ── Form submit ─────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const supabase = createClient()

    try {
      const business_name = formData.get('business_name') as string
      let slug = SolarUtils.generateSlug(business_name)

      // Slug conflict check
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()

      if (existingLead) {
        slug = `${slug}-${Math.random().toString(36).substring(2, 6)}`
      }

      // ── Roof image ──────────────────────────────────────────────────────────
      const roofFile = formData.get('roof_image') as File
      let roof_url = autoRoofUrl || ''

      if (roofFile?.size > 0) {
        // Manual upload takes priority
        roof_url = await StorageService.uploadLeadImage(supabase, slug, roofFile, 'roof') || ''
      } else if (autoRoofUrl && pendingSlugRef.current && pendingSlugRef.current !== slug) {
        // Slug changed (conflict suffix added) — re-fetch image under the new slug
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
          }
        } catch { /* keep existing URL on failure */ }
      }

      // ── Solar render ────────────────────────────────────────────────────────
      const renderFile = formData.get('render_image') as File
      let render_url = ''
      if (renderFile?.size > 0) {
        render_url = await StorageService.uploadLeadImage(supabase, slug, renderFile, 'render') || ''
      }

      // ── Estimation ──────────────────────────────────────────────────────────
      const building_type = formData.get('building_type') as string
      const manual_savings = formData.get('savings_override') as string

      let estimated_savings = manual_savings ? parseFloat(manual_savings) : 0
      let estimated_payback = 5.5

      if (!manual_savings) {
        const sqft = SolarUtils.getProxySqftByBuildingType(building_type)
        const rate = SolarUtils.getRateByBuildingType(building_type)
        const est = SolarUtils.calculateEstimation(sqft, rate)
        estimated_savings = est.savings
        estimated_payback = est.payback
      }

      // ── Save lead ───────────────────────────────────────────────────────────
      const { data: lead, error } = await supabase
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
          render_image_url: render_url || null,
          estimated_savings,
          estimated_payback,
          notes: formData.get('notes'),
          status: 'published',
        }])
        .select()
        .single()

      if (error) throw error

      const fullUrl = `${window.location.origin}/site/${slug}`
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

  // ── Roof panel state ────────────────────────────────────────────────────────
  const roofPreviewSrc = manualRoofPreview || autoRoofUrl
  const roofIsAuto = !manualRoofPreview && !!autoRoofUrl

  // ── Success screen ──────────────────────────────────────────────────────────
  if (successData) {
    return (
      <Card className="bg-white border-border p-12 text-center space-y-8 animate-in fade-in zoom-in duration-300 shadow-2xl">
        <div className="w-20 h-20 bg-[#D1FAE5] rounded-full flex items-center justify-center mx-auto">
          <Check className="text-accent w-10 h-10" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-bold text-primary tracking-tight">Portfolio Generated!</h2>
          <p className="text-muted-foreground font-medium">The outreach page for {successData.slug} is now live and ready to send.</p>
        </div>
        <div className="flex items-center gap-2 p-4 bg-muted rounded-sm border border-border overflow-hidden">
          <code className="text-sm font-mono flex-1 text-left truncate">{successData.url}</code>
          <Button onClick={copyToClipboard} size="sm" className="bg-primary hover:bg-secondary shrink-0">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span className="ml-2 font-bold tracking-wider">{copied ? 'COPIED' : 'COPY'}</span>
          </Button>
        </div>
        <div className="pt-4 flex flex-col gap-3">
          <a
            href={successData.url}
            target="_blank"
            className="w-full h-14 bg-accent hover:bg-[#065F46] text-white font-bold text-lg tracking-widest rounded-sm flex items-center justify-center transition-colors"
          >
            VIEW LIVE PAGE
          </a>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={() => window.location.reload()} className="h-12 font-bold tracking-widest uppercase text-[10px]">
              Generate Another
            </Button>
            <Link
              href="/admin"
              className="h-12 font-bold tracking-widest uppercase text-[10px] border border-primary text-primary rounded-sm flex items-center justify-center gap-2 hover:bg-primary hover:text-white transition-colors"
            >
              <LayoutDashboard className="w-3 h-3" />
              Dashboard
            </Link>
          </div>
        </div>
      </Card>
    )
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-sm border border-border shadow-sm p-8 space-y-10">
      {/* Hidden geocoords — populated by AddressAutocomplete */}
      <input type="hidden" name="lat" ref={latRef} />
      <input type="hidden" name="lng" ref={lngRef} />

      {/* Visual Assets */}
      <div className="grid grid-cols-2 gap-8">

        {/* Roof Image — auto-generated or manual fallback */}
        <div className="space-y-4">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Satellite className="w-3 h-3" /> Roof Satellite Image
          </label>
          <div className="relative group border-2 border-dashed border-muted hover:border-accent transition-colors rounded-sm aspect-video flex flex-col items-center justify-center bg-muted/30 overflow-hidden">
            {roofGenerating ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin text-accent" />
                <p className="text-[10px] font-bold tracking-widest uppercase">Fetching Satellite View…</p>
              </div>
            ) : roofPreviewSrc ? (
              <>
                <img src={roofPreviewSrc} className="w-full h-full object-cover" alt="Roof preview" />
                {roofIsAuto && (
                  <div className="absolute top-2 left-2 bg-accent/90 text-white text-[9px] font-bold tracking-widest px-2 py-0.5 rounded-sm uppercase">
                    Auto-Generated
                  </div>
                )}
              </>
            ) : (
              <div className="text-center space-y-1">
                <p className="text-xs font-bold text-muted-foreground">SELECT ADDRESS BELOW</p>
                <p className="text-[10px] text-muted-foreground/50 italic">Satellite view auto-fetched on selection</p>
              </div>
            )}

            {/* Manual upload overlay — always accessible as fallback */}
            <div
              className={`absolute inset-0 flex flex-col items-center justify-center gap-1 cursor-pointer transition-opacity
                ${roofPreviewSrc ? 'opacity-0 group-hover:opacity-100 bg-black/50' : 'opacity-0'}`}
            >
              <Upload className="w-5 h-5 text-white" />
              <p className="text-white text-[10px] font-bold tracking-widest">
                {roofIsAuto ? 'REPLACE WITH UPLOAD' : 'UPLOAD MANUALLY'}
              </p>
            </div>
            <input
              ref={manualRoofFileRef}
              type="file"
              name="roof_image"
              accept="image/*"
              onChange={handleManualRoofChange}
              className="absolute inset-0 opacity-0 cursor-pointer z-10"
            />
          </div>
          {roofIsAuto && (
            <p className="text-[10px] text-muted-foreground/60 italic text-center">
              Hover the image to upload a manual replacement
            </p>
          )}
        </div>

        {/* Solar Render */}
        <div className="space-y-4">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Zap className="w-3 h-3" /> Solar Render
          </label>
          <div className="relative group cursor-pointer border-2 border-dashed border-muted hover:border-accent transition-colors rounded-sm aspect-video flex flex-col items-center justify-center bg-muted/30 overflow-hidden">
            {renderPreview ? (
              <img src={renderPreview} className="w-full h-full object-cover" alt="Render preview" />
            ) : (
              <div className="text-center space-y-1">
                <p className="text-xs font-bold text-muted-foreground group-hover:text-accent">UPLOAD ASSET</p>
                <p className="text-[10px] text-muted-foreground/50 italic">Proposed Render (PNG/JPG)</p>
              </div>
            )}
            <input
              type="file"
              name="render_image"
              accept="image/*"
              required
              onChange={handleRenderChange}
              className="absolute inset-0 opacity-0 cursor-pointer z-10"
            />
            {renderPreview && (
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <p className="text-white text-[10px] font-bold tracking-widest">CHANGE ASSET</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Core Data */}
      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Business Name</label>
          <input
            ref={businessNameRef}
            name="business_name"
            required
            placeholder="e.g. Apex Logistics Center"
            className="w-full px-3 py-3 border border-border rounded-sm bg-white text-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Contact Name</label>
          <input
            name="contact_name"
            required
            placeholder="e.g. John Smith"
            className="w-full px-3 py-3 border border-border rounded-sm bg-white text-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Building Type</label>
          <select
            name="building_type"
            required
            className="w-full px-3 py-3 border border-border rounded-sm bg-white text-primary focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
          >
            <option value="warehouse">Warehouse</option>
            <option value="factory">Manufacturing/Factory</option>
            <option value="office">Office Building</option>
            <option value="cold_storage">Cold Storage</option>
            <option value="retail">Retail/Big Box</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Business Address</label>
          <AddressAutocomplete
            name="address"
            required
            placeholder="Start typing an address…"
            onPlaceSelect={handlePlaceSelect}
            className="w-full px-3 py-3 border border-border rounded-sm bg-white text-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <hr className="border-border" />

      {/* Optional */}
      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground italic opacity-70">Savings Override (Optional)</label>
          <input
            name="savings_override"
            type="number"
            placeholder="Leave blank for AI estimate"
            className="w-full px-3 py-3 border border-border border-dashed rounded-sm bg-muted/10 text-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground italic opacity-70">Internal Notes</label>
          <input
            name="notes"
            placeholder="Source, referral, etc."
            className="w-full px-3 py-3 border border-border border-dashed rounded-sm bg-muted/10 text-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="pt-4">
        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-accent hover:bg-[#065F46] text-white font-bold rounded-sm h-16 text-xl tracking-[0.1em] shadow-lg shadow-accent/20 transition-all"
        >
          {loading ? <Loader2 className="w-6 h-6 animate-spin mr-2" /> : <Zap className="w-5 h-5 mr-3 fill-white" />}
          {loading ? 'GENERATING PORTFOLIO...' : 'GENERATE CLIENT PAGE'}
        </Button>
      </div>
    </form>
  )
}
