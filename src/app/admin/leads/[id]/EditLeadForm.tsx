'use client'

import { useRef, useState } from 'react'
import { Loader2, Satellite } from 'lucide-react'
import AddressAutocomplete, { type PlaceResult } from '@/components/AddressAutocomplete'
import { updateLeadAction } from './actions'

const inputCls = 'w-full rounded-lg border border-[#1e2530] bg-[#0c0d10] px-3 py-2.5 text-[13px] text-[#e0ddd8] placeholder:text-[#2a3040] outline-none transition-colors focus:border-[#d99a3d]/50 focus:ring-1 focus:ring-[#d99a3d]/15'
const selectCls = `${inputCls} appearance-none cursor-pointer`
const labelCls = 'block text-[10px] font-bold uppercase tracking-[0.15em] text-[#4a5560] mb-1.5'

interface Lead {
  id: string
  business_name: string
  contact_name: string | null
  address: string | null
  estimated_savings: number | null
  notes: string | null
  status: 'published' | 'contacted' | 'emailed' | 'replied' | 'booked' | 'archived'
  roof_image_url: string | null
  render_preview_url: string | null
}

export default function EditLeadForm({ lead }: { lead: Lead }) {
  const latRef = useRef<HTMLInputElement>(null)
  const lngRef = useRef<HTMLInputElement>(null)
  const roofImageUrlRef = useRef<HTMLInputElement>(null)
  const renderPreviewUrlRef = useRef<HTMLInputElement>(null)

  const [roofPreview, setRoofPreview] = useState<string | null>(lead.roof_image_url)
  const [roofGenerating, setRoofGenerating] = useState(false)

  const staticMapUrl = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && lead.address
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(lead.address)}&zoom=18&size=900x500&maptype=satellite&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`
    : null

  const displayImage = roofPreview || staticMapUrl

  async function handlePlaceSelect({ formattedAddress, lat, lng }: PlaceResult) {
    if (latRef.current) latRef.current.value = String(lat)
    if (lngRef.current) lngRef.current.value = String(lng)

    const form = document.getElementById('edit-lead-form') as HTMLFormElement | null
    const slug = form?.dataset.slug || formattedAddress.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

    setRoofGenerating(true)
    setRoofPreview(null)
    try {
      const res = await fetch('/api/generate-roof-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, slug, formattedAddress }),
      })
      const data = await res.json()
      if (data.roof_image_url) {
        setRoofPreview(data.roof_image_url)
        if (roofImageUrlRef.current) roofImageUrlRef.current.value = data.roof_image_url
      }
      if (data.render_preview_url && renderPreviewUrlRef.current) {
        renderPreviewUrlRef.current.value = data.render_preview_url
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Roof image generation failed:', err)
      }
    } finally {
      setRoofGenerating(false)
    }
  }

  return (
    <form
      id="edit-lead-form"
      data-slug={lead.business_name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}
      action={updateLeadAction}
      className="space-y-5"
    >
      <input type="hidden" name="id" value={lead.id} />
      <input type="hidden" name="lat" ref={latRef} />
      <input type="hidden" name="lng" ref={lngRef} />
      <input type="hidden" name="roof_image_url" ref={roofImageUrlRef} defaultValue={lead.roof_image_url || ''} />
      <input type="hidden" name="render_preview_url" ref={renderPreviewUrlRef} defaultValue={lead.render_preview_url || ''} />

      {/* Core fields */}
      <div className="rounded-xl border border-[#1e2530] bg-[#111418] overflow-hidden">
        <div className="border-b border-[#1e2530] px-5 py-4 bg-[#0f1216]">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#4a5560]">Proposal</div>
          <div className="mt-1 text-[15px] font-semibold text-[#e0ddd8]">Lead details</div>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelCls}>Business name</label>
              <input
                name="business_name"
                defaultValue={lead.business_name}
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select
                name="status"
                defaultValue={lead.status}
                className={selectCls}
              >
                <option value="published">Published</option>
                <option value="contacted">Contacted</option>
                <option value="emailed">Emailed</option>
                <option value="replied">Replied</option>
                <option value="booked">Booked</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelCls}>Contact name</label>
              <input
                name="contact_name"
                defaultValue={lead.contact_name || ''}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Estimated savings (CAD)</label>
              <input
                name="estimated_savings"
                type="number"
                defaultValue={lead.estimated_savings || ''}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Business address</label>
            <AddressAutocomplete
              name="address"
              defaultValue={lead.address || ''}
              placeholder="Start typing an address"
              onPlaceSelect={handlePlaceSelect}
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* Roof image preview */}
      {(roofGenerating || displayImage) && (
        <div className="rounded-xl border border-[#1e2530] bg-[#111418] overflow-hidden">
          <div className="border-b border-[#1e2530] px-5 py-4 bg-[#0f1216]">
            <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[#4a5560]">
              <Satellite className="h-3 w-3" />
              Roof image
            </label>
          </div>
          <div className="p-5">
            <div className="relative aspect-video overflow-hidden rounded-xl border border-[#1e2530] bg-[#080a0c]">
              {roofGenerating ? (
                <div className="flex h-full flex-col items-center justify-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-[#d99a3d]" />
                  <span className="text-xs text-[#4a5560]">Generating satellite + panel render…</span>
                </div>
              ) : displayImage ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={displayImage} className="h-full w-full object-cover" alt="Property satellite view" />
                  <div className="absolute bottom-2 left-2 rounded border border-white/10 bg-black/70 px-2 py-1 text-[10px] font-semibold text-white/60 backdrop-blur-sm">
                    {roofPreview === lead.roof_image_url ? 'Current render' : roofPreview ? 'New render' : 'Satellite preview'}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="rounded-xl border border-[#1e2530] bg-[#111418] overflow-hidden">
        <div className="border-b border-[#1e2530] px-5 py-4 bg-[#0f1216]">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#4a5560]">Notes</div>
        </div>
        <div className="p-5">
          <textarea
            name="notes"
            rows={4}
            defaultValue={lead.notes || ''}
            placeholder="Internal notes about this lead…"
            className={inputCls}
          />
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          type="submit"
          className="w-full rounded-lg bg-[#d99a3d] px-5 py-2.5 text-[13px] font-bold text-[#1a0e00] hover:bg-[#e6a845] transition-colors"
        >
          Save changes
        </button>
      </div>
    </form>
  )
}
