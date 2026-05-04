'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { ExternalLink, Loader2, RadioTower, Rocket, Send, TriangleAlert, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { type Prospect, type ProspectStage, prospectStages } from '@/lib/prospect'
import {
  promoteProspectToLeadAction,
  triggerProspectEnrichmentAction,
  updateProspectStageAction,
} from '@/app/admin/pipeline/actions'

type ProspectPipelineTableProps = {
  initialProspects: Prospect[]
}

const stageLabels: Record<ProspectStage, string> = {
  sourced: 'Sourced',
  solar_fetched: 'Solar Fetched',
  enriched: 'Enriched',
  microsite_live: 'Live',
  emailed: 'Emailed',
  replied: 'Replied',
  booked: 'Booked',
  snoozed: 'Snoozed',
  dead: 'Dead',
}

function formatUSD(value: number | null) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function formatNumber(value: number | null) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value || 0)
}

function stageClass(stage: ProspectStage) {
  if (stage === 'booked') return 'border-emerald-300/35 bg-emerald-300/10 text-emerald-100'
  if (stage === 'microsite_live' || stage === 'emailed' || stage === 'replied') return 'border-cyan-200/30 bg-cyan-200/10 text-cyan-100'
  if (stage === 'dead') return 'border-red-300/30 bg-red-500/10 text-red-100'
  if (stage === 'snoozed') return 'border-amber-300/30 bg-amber-300/10 text-amber-100'
  return 'border-white/10 bg-white/[0.03] text-slate-300'
}

export function ProspectPipelineTable({ initialProspects }: ProspectPipelineTableProps) {
  const [prospects, setProspects] = useState(initialProspects)
  const [activeStage, setActiveStage] = useState<ProspectStage | 'all'>('all')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const counts = useMemo(() => {
    const initial = Object.fromEntries(prospectStages.map((stage) => [stage, 0])) as Record<ProspectStage, number>
    prospects.forEach((prospect) => {
      initial[prospect.pipeline_stage] += 1
    })
    return initial
  }, [prospects])

  const filteredProspects = activeStage === 'all'
    ? prospects
    : prospects.filter((prospect) => prospect.pipeline_stage === activeStage)

  const handleStageChange = (id: string, stage: ProspectStage) => {
    setMessage(null)
    setActiveId(id)
    startTransition(async () => {
      const result = await updateProspectStageAction(id, stage)
      if (!result.success) {
        setMessage(result.error || 'Failed to update prospect stage.')
      } else {
        setProspects((prev) => prev.map((prospect) => (
          prospect.id === id ? { ...prospect, pipeline_stage: stage } : prospect
        )))
      }
      setActiveId(null)
    })
  }

  const handlePromote = (id: string) => {
    setMessage(null)
    setActiveId(id)
    startTransition(async () => {
      const result = await promoteProspectToLeadAction(id)
      if (!result.success) {
        setMessage(result.error || 'Failed to promote prospect.')
      } else {
        setProspects((prev) => prev.map((prospect) => (
          prospect.id === id
            ? {
                ...prospect,
                lead_id: result.lead_id || prospect.lead_id,
                microsite_slug: result.slug || prospect.microsite_slug,
                pipeline_stage: 'microsite_live',
              }
            : prospect
        )))
        setMessage(`Promoted to ${result.url || `/proposal/${result.slug}`}`)
      }
      setActiveId(null)
    })
  }

  const handleEnrich = (id: string) => {
    setMessage(null)
    setActiveId(id)
    startTransition(async () => {
      const result = await triggerProspectEnrichmentAction(id)
      setMessage(result.success ? 'Enrichment webhook fired.' : result.error || 'Failed to trigger enrichment.')
      setActiveId(null)
    })
  }

  return (
    <section className="border border-white/10 bg-black/35 shadow-[0_24px_90px_rgba(0,0,0,0.42)] backdrop-blur-xl">
      <div className="flex flex-col gap-5 border-b border-white/10 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.32em] text-cyan-200/70">
            <RadioTower className="h-4 w-4" />
            OpenClaw pipeline
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">Prospect Command Queue</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors ${activeStage === 'all' ? 'border-cyan-200/40 bg-cyan-200/10 text-cyan-100' : 'border-white/10 bg-white/[0.03] text-slate-500 hover:border-cyan-200/20 hover:text-slate-200'}`}
            onClick={() => setActiveStage('all')}
          >
            All <span className="text-slate-500">{prospects.length}</span>
          </button>
          {prospectStages.map((stage) => (
            <button
              key={stage}
              type="button"
              className={`border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors ${activeStage === stage ? 'border-cyan-200/40 bg-cyan-200/10 text-cyan-100' : 'border-white/10 bg-white/[0.03] text-slate-500 hover:border-cyan-200/20 hover:text-slate-200'}`}
              onClick={() => setActiveStage(stage)}
            >
              {stageLabels[stage]} <span className="text-slate-500">{counts[stage]}</span>
            </button>
          ))}
        </div>
      </div>

      {message && (
        <div className="flex items-center gap-2 border-b border-white/10 bg-slate-950/70 px-5 py-4 text-sm text-slate-300">
          <TriangleAlert className="h-4 w-4 text-amber-200" />
          {message}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.025] font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">
              <th className="px-5 py-4">Prospect</th>
              <th className="px-5 py-4">Parcel</th>
              <th className="px-5 py-4">Solar Signal</th>
              <th className="px-5 py-4">Owner</th>
              <th className="px-5 py-4">Stage</th>
              <th className="px-5 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {filteredProspects.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center">
                  <div className="mx-auto max-w-sm border border-dashed border-white/15 bg-white/[0.025] p-8">
                    <Rocket className="mx-auto h-8 w-8 text-slate-600" />
                    <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">No prospects in this lane</div>
                    <p className="mt-2 text-sm text-slate-400">Once n8n starts sourcing parcels, they will appear here.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredProspects.map((prospect) => {
                const busy = isPending && activeId === prospect.id
                return (
                  <tr key={prospect.id} className="transition-colors hover:bg-cyan-200/[0.035]">
                    <td className="px-5 py-5 align-top">
                      <div className="font-semibold text-white">{prospect.address.split(',')[0]}</div>
                      <div className="mt-1 max-w-xs text-xs text-slate-500">{prospect.address}</div>
                      <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-600">
                        {prospect.metro || 'Metro pending'} · {prospect.county || 'County pending'}
                      </div>
                    </td>
                    <td className="px-5 py-5 align-top">
                      <div className="font-mono text-xs text-slate-300">{prospect.parcel_id || 'No parcel ID'}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {formatNumber(prospect.sqft)} sqft · {prospect.year_built || 'Year unknown'}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{prospect.use_code || 'Use code pending'}</div>
                    </td>
                    <td className="px-5 py-5 align-top">
                      <div className="font-mono text-xs text-cyan-100">
                        {formatNumber(prospect.panel_count)} panels · {prospect.system_kw || 0} kW
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {formatUSD(prospect.annual_savings)} annual · {formatUSD(prospect.federal_itc)} ITC
                      </div>
                      <div className="mt-2 flex gap-2">
                        {prospect.satellite_url && (
                          <a href={prospect.satellite_url} target="_blank" rel="noreferrer" className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400 hover:text-cyan-100">
                            Satellite
                          </a>
                        )}
                        {prospect.render_url && (
                          <a href={prospect.render_url} target="_blank" rel="noreferrer" className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400 hover:text-cyan-100">
                            Render
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-5 align-top">
                      <div className="text-sm text-white">{prospect.owner_name || prospect.owner_llc || 'Owner pending'}</div>
                      <div className="mt-1 text-xs text-slate-500">{prospect.owner_title || prospect.enrichment_source || 'Not enriched'}</div>
                      <div className="mt-1 font-mono text-[10px] text-slate-500">{prospect.owner_email || 'No email yet'}</div>
                    </td>
                    <td className="px-5 py-5 align-top">
                      <div className={`inline-flex border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] ${stageClass(prospect.pipeline_stage)}`}>
                        {stageLabels[prospect.pipeline_stage]}
                      </div>
                      <select
                        value={prospect.pipeline_stage}
                        onChange={(event) => handleStageChange(prospect.id, event.target.value as ProspectStage)}
                        disabled={busy}
                        className="mt-3 block w-full border border-white/10 bg-[#090d12] px-2 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300 outline-none"
                      >
                        {prospectStages.map((stage) => (
                          <option key={stage} value={stage}>{stageLabels[stage]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-5 align-top">
                      <div className="flex justify-end gap-2">
                        {prospect.pipeline_stage === 'solar_fetched' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-none border-white/15 bg-transparent text-slate-200 hover:bg-white/10"
                            disabled={busy}
                            onClick={() => handleEnrich(prospect.id)}
                          >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          className="rounded-none bg-slate-100 text-slate-950 hover:bg-white"
                          disabled={busy || prospect.pipeline_stage === 'dead'}
                          onClick={() => handlePromote(prospect.id)}
                          title="Promote prospect to proposal worker"
                        >
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                        {prospect.microsite_slug && (
                          <Link
                            href={`/proposal/${prospect.microsite_slug}`}
                            className="inline-flex h-9 items-center justify-center border border-white/10 px-3 text-slate-300 transition-colors hover:border-cyan-200/30 hover:text-cyan-100"
                            target="_blank"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
