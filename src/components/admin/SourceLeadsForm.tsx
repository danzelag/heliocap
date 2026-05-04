'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Search, TriangleAlert } from 'lucide-react'

const inputClass = 'w-full border border-white/10 bg-[#090d12] px-3 py-3 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-slate-400'
const labelClass = 'font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500'

type SourceLeadsResponse = {
  success?: boolean
  error?: string
  receipt?: Record<string, unknown> | null
}

export function SourceLeadsForm() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage(null)
    setError(null)

    const formData = new FormData(event.currentTarget)

    try {
      const res = await fetch('/api/source-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: String(formData.get('location') || '').trim(),
          category: String(formData.get('category') || '').trim(),
          max_results: Number(formData.get('max_results') || 25),
          keywords: String(formData.get('keywords') || '').trim(),
        }),
      })

      const data = (await res.json()) as SourceLeadsResponse
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to trigger sourcing workflow.')
      }

      const count = getReceiptCount(data.receipt)
      setMessage(count ? `Source workflow queued. n8n reported ${count} prospects.` : 'Source workflow queued. Refresh after n8n writes prospects.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger sourcing workflow.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-white/10 bg-[#0b1016]/90 p-5 lg:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.26em] text-slate-500">Source prospects</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">Find buildings, do not publish.</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            This triggers the n8n sourcing worker. Results should land in the prospects table only.
          </p>
        </div>
        <Button
          type="submit"
          disabled={loading}
          className="h-11 rounded-none border border-white/15 bg-slate-100 px-5 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-slate-950 hover:bg-white disabled:opacity-50"
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          {loading ? 'Sourcing' : 'Source Leads'}
        </Button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_8rem]">
        <div className="space-y-2">
          <label className={labelClass}>Location</label>
          <input name="location" required defaultValue="Brampton, ON" placeholder="Brampton, ON" className={inputClass} />
        </div>
        <div className="space-y-2">
          <label className={labelClass}>Category</label>
          <select name="category" required defaultValue="warehouse" className={inputClass}>
            <option value="warehouse">Warehouse</option>
            <option value="distribution center">Distribution center</option>
            <option value="manufacturing">Manufacturing</option>
            <option value="industrial">Industrial</option>
            <option value="commercial building">Commercial building</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className={labelClass}>Max results</label>
          <input name="max_results" required type="number" min="1" max="250" defaultValue="25" className={inputClass} />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <label className={labelClass}>Keywords</label>
        <input
          name="keywords"
          defaultValue="warehouse OR distribution center"
          placeholder="Optional search modifiers"
          className={inputClass}
        />
      </div>

      {(message || error) && (
        <div className={`mt-4 flex items-center gap-2 border px-4 py-3 text-sm ${error ? 'border-red-300/25 bg-red-500/10 text-red-100' : 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100'}`}>
          <TriangleAlert className="h-4 w-4" />
          {error || message}
        </div>
      )}
    </form>
  )
}

function getReceiptCount(receipt: Record<string, unknown> | null | undefined) {
  const value = receipt?.count || receipt?.created || receipt?.prospects_created || receipt?.inserted
  return typeof value === 'number' ? value : null
}
