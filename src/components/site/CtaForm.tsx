'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { submitCtaForm } from './actions'
import { CheckCircle2, Loader2, ArrowUpRight } from 'lucide-react'

export function CtaForm({ leadId }: { leadId: string }) {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const formData = new FormData(e.currentTarget)
    try {
      await submitCtaForm(leadId, formData)
      setSuccess(true)
    } catch (err) {
      console.error(err)
      setError('Failed to submit. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="rounded-xl border border-roi/20 bg-white/[0.04] p-8 text-center backdrop-blur-sm">
        <CheckCircle2 className="mx-auto h-10 w-10 text-roi" />
        <h3 className="mt-4 text-xl font-semibold tracking-tight text-white">Request Received</h3>
        <p className="mt-2 text-sm text-white/60">
          Our infrastructure team will review your details and reach out within one business day to schedule your briefing.
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-xl border border-white/15 bg-white/[0.04] p-8 backdrop-blur-sm"
    >
      <div className="mb-2">
        <h3 className="text-xl font-semibold tracking-tight text-white">
          Schedule Your Briefing
        </h3>
        <p className="mt-1 text-sm text-white/50">Utility rates won't wait. Secure your place.</p>
      </div>

      {error && (
        <p className="text-sm font-semibold text-warning">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">Name</label>
          <Input
            name="name"
            required
            placeholder="Your name"
            className="h-12 rounded-md border-white/15 bg-white/[0.04] px-4 text-white placeholder:text-white/20 focus-visible:border-roi focus-visible:ring-0"
          />
        </div>
        <div>
          <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">Company</label>
          <Input
            name="company"
            required
            placeholder="Company name"
            className="h-12 rounded-md border-white/15 bg-white/[0.04] px-4 text-white placeholder:text-white/20 focus-visible:border-roi focus-visible:ring-0"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">Email</label>
          <Input
            type="email"
            name="email"
            required
            placeholder="you@company.com"
            className="h-12 rounded-md border-white/15 bg-white/[0.04] px-4 text-white placeholder:text-white/20 focus-visible:border-roi focus-visible:ring-0"
          />
        </div>
        <div>
          <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">Phone</label>
          <Input
            type="tel"
            name="phone"
            placeholder="Optional"
            className="h-12 rounded-md border-white/15 bg-white/[0.04] px-4 text-white placeholder:text-white/20 focus-visible:border-roi focus-visible:ring-0"
          />
        </div>
      </div>

      <div>
        <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">Notes (Optional)</label>
        <Textarea
          name="message"
          rows={3}
          placeholder="Timeline, questions, current energy provider..."
          className="resize-none rounded-md border-white/15 bg-white/[0.04] p-4 text-white placeholder:text-white/20 focus-visible:border-roi focus-visible:ring-0"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="group mt-2 inline-flex w-full items-center justify-between gap-4 rounded-md bg-cta px-6 py-4 text-sm font-medium text-white shadow-[0_1px_0_0_rgba(255,255,255,0.1)_inset,0_8px_24px_-12px_rgba(4,120,87,0.6)] transition-colors hover:bg-cta-hover disabled:cursor-not-allowed disabled:bg-cta-hover/80"
      >
        {loading ? (
          <span className="flex w-full items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Processing...
          </span>
        ) : (
          <>
            <span className="font-mono uppercase tracking-widest text-[11px]">Submit Request</span>
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </>
        )}
      </button>
    </form>
  )
}
