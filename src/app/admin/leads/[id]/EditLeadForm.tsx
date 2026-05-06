'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Satellite } from 'lucide-react'
import AddressAutocomplete, { type PlaceResult } from '@/components/AddressAutocomplete'
import { updateLeadAction } from './actions'

const inputClass = 'admin-input px-3 py-2.5 text-sm placeholder:text-slate-400'
const labelClass = 'text-xs font-semibold text-stone-400'

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

  async function handlePlaceSelect({ formattedAddress, lat, lng }: PlaceResult) {
    if (latRef.current) latRef.current.value = String(lat)
    if (lngRef.current) lngRef.current.value = String(lng)

    // Derive slug from lead id path doesn't change, use existing slug hint from business name
    // We pass the formatted address as fallback; the backend uses slug for storage path.
    // The slug is already set for this lead — pass it via a data attribute on the form.
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
      className="admin-panel space-y-6 p-4 lg:p-6"
    >
      <input type="hidden" name="id" value={lead.id} />
      <input type="hidden" name="lat" ref={latRef} />
      <input type="hidden" name="lng" ref={lngRef} />
      <input type="hidden" name="roof_image_url" ref={roofImageUrlRef} defaultValue={lead.roof_image_url || ''} />
      <input type="hidden" name="render_preview_url" ref={renderPreviewUrlRef} defaultValue={lead.render_preview_url || ''} />

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <label className={labelClass}>Business name</label>
          <input
            name="business_name"
            defaultValue={lead.business_name}
            required
            className={inputClass}
          />
        </div>
        <div className="space-y-2">
          <label className={labelClass}>Status</label>
          <select
            name="status"
            defaultValue={lead.status}
            className={`${inputClass} appearance-none`}
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

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <label className={labelClass}>Contact name</label>
          <input
            name="contact_name"
            defaultValue={lead.contact_name || ''}
            className={inputClass}
          />
        </div>
        <div className="space-y-2">
          <label className={labelClass}>Estimated savings ($)</label>
          <input
            name="estimated_savings"
            type="number"
            defaultValue={lead.estimated_savings || ''}
            className={inputClass}
          />
        </div>
      </div>

      {/* Address with autocomplete */}
      <div className="space-y-2">
        <label className={labelClass}>Business address</label>
        <AddressAutocomplete
          name="address"
          defaultValue={lead.address || ''}
          placeholder="Start typing an address"
          onPlaceSelect={handlePlaceSelect}
          className={inputClass}
        />
      </div>

      {/* Roof preview after address selection */}
      {(roofGenerating || roofPreview) && (
        <div className="space-y-3">
          <label className={`${labelClass} flex items-center gap-2`}>
            <Satellite className="w-3 h-3" /> Roof image
          </label>
          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-stone-700/70 bg-stone-900/60">
            {roofGenerating ? (
              <div className="flex flex-col items-center gap-2 text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-300" />
                <p className="text-sm font-medium">Fetching image</p>
              </div>
            ) : (
              <>
                <img src={roofPreview!} className="w-full h-full object-cover" alt="Roof satellite view" />
                <div className="absolute left-2 top-2 rounded-full bg-stone-950/90 px-2 py-1 text-xs font-semibold text-stone-300">
                  Generated
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className={labelClass}>Notes</label>
        <textarea
          name="notes"
          rows={4}
          defaultValue={lead.notes || ''}
          className={inputClass}
        />
      </div>

      <div className="flex justify-end border-t border-stone-700/70 pt-4">
        <Button type="submit" className="h-10 rounded-lg bg-amber-300 px-5 text-sm font-semibold text-stone-950 hover:bg-amber-200">
          Save changes
        </Button>
      </div>
    </form>
  )
}
