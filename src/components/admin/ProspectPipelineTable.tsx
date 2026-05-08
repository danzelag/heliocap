'use client'

import { useEffect, useMemo, useState, useTransition, type SetStateAction } from 'react'
import Link from 'next/link'
import { ExternalLink, Loader2, RadioTower, Rocket, Send, Trash2, TriangleAlert, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { sortProspectsForAdmin, type Prospect, type ProspectStage, prospectStages } from '@/lib/prospect'
import {
  bulkDeleteProspectsAction,
  bulkPromoteProspectsToLeadsAction,
  deleteProspectAction,
  promoteProspectToLeadAction,
  triggerProspectEnrichmentAction,
  updateProspectStageAction,
} from '@/app/admin/pipeline/actions'
import { readClientCache, writeClientCache } from '@/lib/client-cache'
import { createClient } from '@/lib/supabase'

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
const PROSPECTS_CACHE_KEY = 'admin:prospects'

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
  if (stage === 'booked' || stage === 'microsite_live') return 'admin-status admin-status-success px-2.5 py-1'
  if (stage === 'dead') return 'admin-status admin-status-danger px-2.5 py-1'
  if (stage === 'snoozed') return 'admin-status admin-status-warning px-2.5 py-1'
  if (stage === 'solar_fetched' || stage === 'enriched' || stage === 'emailed' || stage === 'replied') {
    return 'admin-status admin-status-running px-2.5 py-1'
  }
  return 'admin-status px-2.5 py-1'
}

export function ProspectPipelineTable({ initialProspects }: ProspectPipelineTableProps) {
  const [prospects, setProspectsState] = useState(() => sortProspectsForAdmin(readClientCache<Prospect[]>(PROSPECTS_CACHE_KEY) || initialProspects))
  const [activeStage, setActiveStage] = useState<ProspectStage | 'all'>('all')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const setProspects = (next: SetStateAction<Prospect[]>) => {
    setProspectsState((prev) => {
      const resolved = sortProspectsForAdmin(typeof next === 'function' ? next(prev) : next)
      writeClientCache(PROSPECTS_CACHE_KEY, resolved)
      return resolved
    })
  }

  useEffect(() => {
    let mounted = true
    const supabase = createClient()

    const refreshProspects = async () => {
      const { data } = await supabase
        .from('prospects')
        .select('*')
        .order('created_at', { ascending: false })

      if (!mounted || !data) return
      const nextProspects = sortProspectsForAdmin(data as Prospect[])
      setProspectsState(nextProspects)
      writeClientCache(PROSPECTS_CACHE_KEY, nextProspects)
    }

    refreshProspects()
    const poller = window.setInterval(refreshProspects, 7000)
    const channel = supabase
      .channel('admin-prospects-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'prospects',
        },
        (payload) => {
          if (!mounted) return

          const deletedId = (payload.old as Pick<Prospect, 'id'> | null)?.id
          if (payload.eventType === 'DELETE' && deletedId) {
            setProspects((prev) => prev.filter((prospect) => prospect.id !== deletedId))
            setSelectedIds((prev) => prev.filter((id) => id !== deletedId))
            return
          }

          const nextProspect = payload.new as Prospect | null
          if (!nextProspect) return

          setProspects((prev) => {
            const existing = prev.filter((prospect) => prospect.id !== nextProspect.id)
            return sortProspectsForAdmin([nextProspect, ...existing])
          })
        },
      )
      .subscribe()

    return () => {
      mounted = false
      window.clearInterval(poller)
      supabase.removeChannel(channel)
    }
  }, [])

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
  const filteredIds = filteredProspects.map((prospect) => prospect.id)
  const selectedInView = selectedIds.filter((id) => filteredIds.includes(id))
  const allVisibleSelected = filteredIds.length > 0 && selectedInView.length === filteredIds.length

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
        const slug = 'slug' in result ? result.slug : 'prospect'
        const url = 'url' in result ? result.url : null
        const alreadyLive = 'already_live' in result && result.already_live

        if (alreadyLive) {
          setProspects((prev) => prev.map((prospect) => (
            prospect.id === id
              ? {
                ...prospect,
                lead_id: 'lead_id' in result && typeof result.lead_id === 'string' ? result.lead_id : prospect.lead_id,
                microsite_slug: slug,
                pipeline_stage: 'microsite_live',
              }
              : prospect
          )))
          setMessage(`Already live at ${url || `/proposal/${slug}`}`)
        } else {
          setMessage(`Proposal job queued for ${slug}. Watch the proposal build monitor for completion.`)
        }
      }
      setActiveId(null)
    })
  }

  const handleToggleSelection = (id: string) => {
    setSelectedIds((prev) => (
      prev.includes(id) ? prev.filter((selectedId) => selectedId !== id) : [...prev, id]
    ))
  }

  const handleToggleVisibleSelection = () => {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        return prev.filter((id) => !filteredIds.includes(id))
      }

      return [...new Set([...prev, ...filteredIds])]
    })
  }

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return
    if (!window.confirm(`Delete ${selectedIds.length} prospect${selectedIds.length === 1 ? '' : 's'}? This cannot be undone. Published proposals will not be removed.`)) return

    setMessage(null)
    const previous = prospects
    const removing = new Set(selectedIds)
    setProspects((prev) => prev.filter((row) => !removing.has(row.id)))
    setSelectedIds([])

    startTransition(async () => {
      const result = await bulkDeleteProspectsAction([...removing])
      if (!result.success) {
        setProspects(previous)
        setMessage(result.error || 'Failed to delete prospects.')
      } else {
        const n = 'deleted' in result ? result.deleted : removing.size
        setMessage(`Deleted ${n} prospect${n === 1 ? '' : 's'}.`)
      }
    })
  }

  const handleBulkPromote = () => {
    setMessage(null)
    startTransition(async () => {
      const result = await bulkPromoteProspectsToLeadsAction(selectedIds)
      if (!result.success) {
        setMessage(result.error || 'Failed to queue proposal jobs.')
      } else {
        setSelectedIds([])
        const queued = 'queued' in result ? result.queued : 0
        const failed = 'failed' in result ? result.failed : 0
        const failedText = failed ? ` ${failed} failed or missing.` : ''
        setMessage(`${queued} proposal job${queued === 1 ? '' : 's'} queued.${failedText} Watch the proposal build monitor for completion.`)
      }
    })
  }

  const handleDelete = (prospect: Prospect) => {
    const label = prospect.business_name || prospect.address.split(',')[0] || 'this prospect'
    if (!window.confirm(`Delete ${label}? This cannot be undone. Associated published proposals will not be removed.`)) {
      return
    }

    setMessage(null)
    setActiveId(prospect.id)
    const previous = prospects
    setProspects((prev) => prev.filter((row) => row.id !== prospect.id))
    setSelectedIds((prev) => prev.filter((selectedId) => selectedId !== prospect.id))

    startTransition(async () => {
      const result = await deleteProspectAction(prospect.id)
      if (!result.success) {
        setProspects(previous)
        setMessage(result.error || 'Failed to delete prospect.')
      } else {
        setMessage(`Deleted ${label}.`)
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
    <section className="admin-panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-stone-700/70 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
            <RadioTower className="h-4 w-4" />
            Prospects
          </div>
          <h2 className="mt-1 text-xl font-semibold text-stone-50">Pipeline</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={isPending || selectedIds.length === 0}
            onClick={handleBulkPromote}
            className="h-9 rounded-lg bg-amber-300 px-3 text-sm font-semibold text-stone-950 hover:bg-amber-200 disabled:opacity-50"
          >
            {isPending && !activeId ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}
            Create <span className="text-slate-300">{selectedIds.length}</span>
          </Button>
          <Button
            type="button"
            disabled={isPending || selectedIds.length === 0}
            onClick={handleBulkDelete}
            className="h-9 rounded-lg border border-red-900/60 bg-stone-950/70 px-3 text-sm font-semibold text-red-300 hover:bg-red-950/30 disabled:opacity-50"
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete <span className="text-red-400">{selectedIds.length}</span>
          </Button>
          <button
            type="button"
            className={`admin-chip px-3 py-2 transition-colors ${activeStage === 'all' ? 'admin-chip-active' : 'hover:border-stone-600 hover:text-stone-300'}`}
            onClick={() => setActiveStage('all')}
          >
            All <span className="text-slate-500">{prospects.length}</span>
          </button>
          {prospectStages.map((stage) => (
            <button
              key={stage}
              type="button"
              className={`admin-chip px-3 py-2 transition-colors ${activeStage === stage ? 'admin-chip-active' : 'hover:border-stone-600 hover:text-stone-300'}`}
              onClick={() => setActiveStage(stage)}
            >
              {stageLabels[stage]} <span className="text-slate-500">{counts[stage]}</span>
            </button>
          ))}
        </div>
      </div>

      {message && (
        <div className="flex items-center gap-2 border-b border-stone-700/70 bg-stone-900/60 px-4 py-3 text-sm text-stone-400">
          <TriangleAlert className="h-4 w-4 text-amber-300" />
          {message}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead>
            <tr className="border-b border-stone-700/70 bg-stone-900/60 text-xs font-semibold uppercase text-slate-500">
              <th className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all visible prospects"
                  checked={allVisibleSelected}
                  onChange={handleToggleVisibleSelection}
                  className="h-4 w-4 rounded-sm border-stone-600 accent-emerald-600"
                />
              </th>
              <th className="px-4 py-3">Prospect</th>
              <th className="px-4 py-3">Parcel</th>
              <th className="px-4 py-3">Solar</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-800">
            {filteredProspects.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <div className="mx-auto max-w-sm rounded-lg border border-dashed border-stone-600 bg-stone-900/60 p-6">
                    <Rocket className="mx-auto h-7 w-7 text-slate-400" />
                    <div className="mt-3 text-sm font-semibold text-stone-300">No prospects</div>
                  </div>
                </td>
              </tr>
            ) : (
              filteredProspects.map((prospect) => {
                const busy = isPending && activeId === prospect.id
                const hasProposal = Boolean(prospect.lead_id || prospect.microsite_slug)
                const hasSolarData = Boolean(
                  prospect.panel_count ||
                  prospect.system_kw ||
                  prospect.annual_savings ||
                  prospect.federal_itc ||
                  prospect.satellite_url ||
                  prospect.render_url ||
                  prospect.render_preview_url
                )
                return (
                  <tr key={prospect.id} className="transition-colors hover:bg-stone-900/60">
                    <td className="px-4 py-4 align-top">
                      <input
                        type="checkbox"
                        aria-label={`Select ${prospect.business_name || prospect.address}`}
                        checked={selectedIds.includes(prospect.id)}
                        onChange={() => handleToggleSelection(prospect.id)}
                        className="h-4 w-4 rounded-sm border-stone-600 accent-emerald-600"
                      />
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="font-semibold text-stone-50">{prospect.business_name || prospect.address.split(',')[0]}</div>
                      <div className="mt-1 max-w-xs text-xs text-slate-500">{prospect.address}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-400">
                        {hasProposal && <span className="admin-status admin-status-success px-2 py-1">proposal made</span>}
                        <span>{prospect.metro || 'Metro pending'} · {prospect.county || 'County pending'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="text-xs font-medium text-stone-300">{prospect.place_id || prospect.parcel_id || 'No ID'}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {prospect.sqft ? `${formatNumber(prospect.sqft)} sqft` : 'Area pending'} · {prospect.year_built || 'Year unknown'}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {prospect.use_code || prospect.category || 'Use code pending'}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      {hasSolarData ? (
                        <>
                          <div className="text-xs font-medium text-stone-300">
                            {formatNumber(prospect.panel_count)} panels · {prospect.system_kw || 0} kW
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {formatUSD(prospect.annual_savings)} annual · {formatUSD(prospect.federal_itc)} ITC
                          </div>
                        </>
                      ) : (
                        <div className="text-xs font-medium text-stone-300">Solar pending</div>
                      )}
                      <div className="mt-2 flex gap-2">
                        {prospect.satellite_url && (
                          <a href={prospect.satellite_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-slate-500 hover:text-primary">
                            Satellite
                          </a>
                        )}
                        {(prospect.render_preview_url || prospect.render_url) && (
                          <a href={prospect.render_preview_url || prospect.render_url || '#'} target="_blank" rel="noreferrer" className="text-xs font-medium text-slate-500 hover:text-primary">
                            Render
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="text-sm text-stone-100">{prospect.owner_name || prospect.owner_llc || 'Owner pending'}</div>
                      <div className="mt-1 text-xs text-slate-500">{prospect.owner_title || prospect.enrichment_source || 'Not enriched'}</div>
                      <div className="mt-1 text-xs text-slate-500">{prospect.owner_email || 'No email yet'}</div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${stageClass(prospect.pipeline_stage)}`}>
                        {stageLabels[prospect.pipeline_stage]}
                      </div>
                      <select
                        value={prospect.pipeline_stage}
                        onChange={(event) => handleStageChange(prospect.id, event.target.value as ProspectStage)}
                        disabled={busy}
                        className="admin-input mt-3 block px-2 py-2 text-xs text-stone-300"
                      >
                        {prospectStages.map((stage) => (
                          <option key={stage} value={stage}>{stageLabels[stage]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex justify-end gap-2">
                        {prospect.pipeline_stage === 'solar_fetched' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-md border-stone-700/70 bg-stone-950/70 text-stone-400 hover:bg-stone-900/60"
                            disabled={busy}
                            onClick={() => handleEnrich(prospect.id)}
                          >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          className="rounded-md bg-amber-300 text-stone-950 hover:bg-amber-200"
                          disabled={busy || prospect.pipeline_stage === 'dead' || hasProposal}
                          onClick={() => handlePromote(prospect.id)}
                          title={hasProposal ? 'Proposal already made' : 'Promote prospect to proposal worker'}
                        >
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : hasProposal ? <ExternalLink className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                        </Button>
                        {prospect.microsite_slug && (
                          <Link
                            href={`/proposal/${prospect.microsite_slug}`}
                            className="inline-flex h-9 items-center justify-center rounded-md border border-stone-700/70 px-3 text-stone-400 transition-colors hover:bg-stone-900/60"
                            target="_blank"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="rounded-md border-red-900/60 bg-stone-950/70 text-red-300 hover:bg-red-950/30"
                          disabled={busy}
                          onClick={() => handleDelete(prospect)}
                          title="Delete prospect"
                        >
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
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
