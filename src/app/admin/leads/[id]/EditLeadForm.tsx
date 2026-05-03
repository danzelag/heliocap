'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Satellite } from 'lucide-react'
import AddressAutocomplete, { type PlaceResult } from '@/components/AddressAutocomplete'
import { updateLeadAction } from './actions'

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
      console.error('Roof image generation failed:', err)
    } finally {
      setRoofGenerating(false)
    }
  }

  return (
    <form
      id="edit-lead-form"
      data-slug={lead.business_name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}
      action={updateLeadAction}
      className="bg-white rounded-sm border border-border shadow-sm p-8 space-y-8"
    >
      <input type="hidden" name="id" value={lead.id} />
      <input type="hidden" name="lat" ref={latRef} />
      <input type="hidden" name="lng" ref={lngRef} />
      <input type="hidden" name="roof_image_url" ref={roofImageUrlRef} defaultValue={lead.roof_image_url || ''} />
      <input type="hidden" name="render_preview_url" ref={renderPreviewUrlRef} defaultValue={lead.render_preview_url || ''} />

      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Business Name</label>
          <input
            name="business_name"
            defaultValue={lead.business_name}
            required
            className="w-full px-3 py-3 border border-border rounded-sm bg-white text-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Status</label>
          <select
            name="status"
            defaultValue={lead.status}
            className="w-full px-3 py-3 border border-border rounded-sm bg-white text-primary focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
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

      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Contact Name</label>
          <input
            name="contact_name"
            defaultValue={lead.contact_name || ''}
            className="w-full px-3 py-3 border border-border rounded-sm bg-white text-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Estimated Savings ($)</label>
          <input
            name="estimated_savings"
            type="number"
            defaultValue={lead.estimated_savings || ''}
            className="w-full px-3 py-3 border border-border rounded-sm bg-white text-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Address with autocomplete */}
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Business Address</label>
        <AddressAutocomplete
          name="address"
          defaultValue={lead.address || ''}
          placeholder="Start typing to search and auto-fetch satellite view…"
          onPlaceSelect={handlePlaceSelect}
          className="w-full px-3 py-3 border border-border rounded-sm bg-white text-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Roof preview after address selection */}
      {(roofGenerating || roofPreview) && (
        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Satellite className="w-3 h-3" /> Roof Satellite Image
          </label>
          <div className="relative rounded-sm border border-border overflow-hidden aspect-video bg-muted/30 flex items-center justify-center">
            {roofGenerating ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin text-accent" />
                <p className="text-[10px] font-bold tracking-widest uppercase">Fetching Satellite View…</p>
              </div>
            ) : (
              <>
                <img src={roofPreview!} className="w-full h-full object-cover" alt="Roof satellite view" />
                <div className="absolute top-2 left-2 bg-accent/90 text-white text-[9px] font-bold tracking-widest px-2 py-0.5 rounded-sm uppercase">
                  Auto-Generated
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Internal Notes</label>
        <textarea
          name="notes"
          rows={4}
          defaultValue={lead.notes || ''}
          className="w-full px-3 py-3 border border-border rounded-sm bg-white text-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="pt-4 border-t border-border flex justify-end">
        <Button type="submit" className="bg-primary hover:bg-secondary text-white font-bold rounded-sm px-10 h-12 tracking-widest">
          SAVE CHANGES
        </Button>
      </div>
    </form>
  )
}
