'use client'

import { useEffect, useMemo, useState, useTransition, type SetStateAction } from 'react'
import Link from 'next/link'
import { Crosshair, ExternalLink, Loader2, RadioTower, Rocket, Send, Trash2, TriangleAlert, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getProspectVisualCandidate, sortProspectsForAdmin, type Prospect, type ProspectStage, prospectStages } from '@/lib/prospect'
import {
  bulkDeleteProspectsAction,
  bulkPromoteProspectsToLeadsAction,
  deleteProspectAction,
  getProspectVisualPreviewAction,
  getProspectVisualReferencesAction,
  promoteProspectToLeadAction,
  saveProspectStreetViewCaptureAction,
  saveProspectVisualTargetAction,
  triggerProspectEnrichmentAction,
  updateProspectStageAction,
} from '@/app/admin/pipeline/actions'
import { readClientCache, writeClientCache } from '@/lib/client-cache'
import { createClient } from '@/lib/supabase'
import { VisualTargetMap } from '@/components/admin/VisualTargetMap'
import { StreetViewCapture } from '@/components/admin/StreetViewCapture'

type ProspectPipelineTableProps = {
  initialProspects: Prospect[]
}

type VisualReferencePreview = {
  mapTilesImageUrl: string | null
  aerialViewReferenceUrl: string | null
  streetViewReferenceUrls: string[]
  referenceCards: VisualReferenceCard[]
}

type VisualReferenceCard = {
  id: string
  label: string
  type: string
  url: string | null
  unavailableReason: string | null
}

const stageLabels: Record<ProspectStage, string> = {
  sourced: 'Sourced',
  coordinate_review: 'Coordinate Review',
  solar_fetched: 'Solar Fetched',
  enriched: 'Enriched',
  microsite_live: 'Live',
  emailed: 'Emailed',
  replied: 'Replied',
  booked: 'Booked',
  snoozed: 'Snoozed',
  dead: 'Not Qualified',
}
const PROSPECTS_CACHE_KEY = 'admin:prospects'
const activeStageOptions = prospectStages.filter((stage) => stage !== 'dead' && stage !== 'microsite_live')

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
  if (stage === 'coordinate_review') return 'admin-status admin-status-warning px-2.5 py-1'
  if (stage === 'dead') return 'admin-status admin-status-warning px-2.5 py-1'
  if (stage === 'snoozed') return 'admin-status admin-status-warning px-2.5 py-1'
  if (stage === 'solar_fetched' || stage === 'enriched' || stage === 'emailed' || stage === 'replied') {
    return 'admin-status admin-status-running px-2.5 py-1'
  }
  return 'admin-status px-2.5 py-1'
}

function isProposalTarget(prospect: Prospect) {
  return Boolean(prospect.lead_id || prospect.microsite_slug || prospect.pipeline_stage === 'microsite_live')
}

function isNotQualified(prospect: Prospect) {
  return prospect.pipeline_stage === 'dead'
}

function isCoordinateReview(prospect: Prospect) {
  return prospect.pipeline_stage === 'coordinate_review' || Boolean(prospect.needs_review)
}

function needsVisualVerification(prospect: Prospect) {
  return prospect.visual_verified !== true
}

function blocksProposalGeneration(prospect: Prospect) {
  return prospect.pipeline_stage === 'dead'
}

function formatCoordinate(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

function parseCoordinate(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function fallbackReferenceCards(references: VisualReferencePreview): VisualReferenceCard[] {
  return [
    {
      id: 'map-tiles',
      label: 'Map / satellite roof frame',
      type: 'Top-down roof geometry',
      url: references.mapTilesImageUrl,
      unavailableReason: references.mapTilesImageUrl
        ? null
        : 'Unavailable until the visual target preview is generated and saved.',
    },
    {
      id: 'aerial-view',
      label: 'Google Aerial View',
      type: 'Optional 3D aerial identity reference',
      url: references.aerialViewReferenceUrl,
      unavailableReason: references.aerialViewReferenceUrl
        ? null
        : 'Unavailable. Google Aerial View did not return an active image/video for this address or region.',
    },
    ...Array.from({ length: 5 }, (_, index) => {
      const url = references.streetViewReferenceUrls[index] || null

      return {
        id: `street-view-${index + 1}`,
        label: `Street View ${index + 1}`,
        type: index === 0 ? 'Front-facing facade anchor' : 'Street-level angle variant',
        url,
        unavailableReason: url
          ? null
          : 'Unavailable. Street View did not return another usable outdoor angle facing the selected home.',
      }
    }),
  ]
}

export function ProspectPipelineTable({ initialProspects }: ProspectPipelineTableProps) {
  const [prospects, setProspectsState] = useState(() => sortProspectsForAdmin(readClientCache<Prospect[]>(PROSPECTS_CACHE_KEY) || initialProspects))
  const [activeStage, setActiveStage] = useState<ProspectStage | 'active' | 'not_qualified'>('active')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [visualProspect, setVisualProspect] = useState<Prospect | null>(null)
  const [visualLat, setVisualLat] = useState('')
  const [visualLng, setVisualLng] = useState('')
  const [visualZoom, setVisualZoom] = useState(19)
  const [visualNote, setVisualNote] = useState('')
  const [visualPreviewUrl, setVisualPreviewUrl] = useState<string | null>(null)
  const [visualPreviewSource, setVisualPreviewSource] = useState<string | null>(null)
  const [visualReferences, setVisualReferences] = useState<VisualReferencePreview | null>(null)
  const [visualReferencesLoading, setVisualReferencesLoading] = useState(false)
  const [streetViewCaptureLoading, setStreetViewCaptureLoading] = useState(false)
  const [visualError, setVisualError] = useState<string | null>(null)
  const [visualLoading, setVisualLoading] = useState(false)
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
    prospects.filter((prospect) => !isProposalTarget(prospect) && !isNotQualified(prospect)).forEach((prospect) => {
      initial[prospect.pipeline_stage] += 1
    })
    return initial
  }, [prospects])

  const activeProspects = useMemo(
    () => prospects.filter((prospect) => !isProposalTarget(prospect) && !isNotQualified(prospect)),
    [prospects],
  )
  const notQualifiedProspects = useMemo(
    () => prospects.filter((prospect) => isNotQualified(prospect)),
    [prospects],
  )
  const proposalTargetCount = useMemo(
    () => prospects.filter((prospect) => isProposalTarget(prospect)).length,
    [prospects],
  )

  const filteredProspects = activeStage === 'active'
    ? activeProspects
    : activeStage === 'not_qualified'
      ? notQualifiedProspects
      : activeProspects.filter((prospect) => prospect.pipeline_stage === activeStage)
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

  const openVisualVerifier = (prospect: Prospect) => {
    const candidate = getProspectVisualCandidate(prospect)
    setVisualProspect(prospect)
    setVisualLat(formatCoordinate(candidate?.lat))
    setVisualLng(formatCoordinate(candidate?.lng))
    setVisualZoom(prospect.visual_zoom || 19)
    setVisualNote(prospect.visual_review_note || '')
    setVisualPreviewUrl(null)
    setVisualPreviewSource(candidate?.source || null)
    setVisualReferences(null)
    setVisualError(null)

    if (candidate) {
      void refreshVisualPreview(prospect.id, candidate.lat, candidate.lng, prospect.visual_zoom || 19)
      void loadVisualReferences(prospect.id, candidate.lat, candidate.lng)
    } else {
      setVisualError('No coordinates available for this prospect.')
    }
  }

  const loadVisualReferences = async (
    id = visualProspect?.id,
    latValue = parseCoordinate(visualLat),
    lngValue = parseCoordinate(visualLng),
  ) => {
    if (!id) return
    if (latValue == null || lngValue == null) return

    setVisualReferencesLoading(true)
    const result = await getProspectVisualReferencesAction(id, latValue, lngValue)
    if (result.success) {
      setVisualReferences({
        mapTilesImageUrl: result.mapTilesImageUrl || null,
        aerialViewReferenceUrl: result.aerialViewReferenceUrl || null,
        streetViewReferenceUrls: result.streetViewReferenceUrls || [],
        referenceCards: result.referenceCards || [],
      })
    } else {
      setVisualReferences(null)
      setVisualError(result.error || 'Failed to load visual references.')
    }
    setVisualReferencesLoading(false)
  }

  const refreshVisualPreview = async (
    id = visualProspect?.id,
    latValue = parseCoordinate(visualLat),
    lngValue = parseCoordinate(visualLng),
    zoomValue = visualZoom,
  ) => {
    if (!id) return
    if (latValue == null || lngValue == null) {
      setVisualError('Enter valid latitude and longitude first.')
      return
    }

    setVisualLoading(true)
    setVisualError(null)

    const result = await getProspectVisualPreviewAction(id, latValue, lngValue, zoomValue)
    if (result.success) {
      setVisualPreviewUrl(result.imageDataUrl || null)
      setVisualPreviewSource(result.source || null)
      setVisualLat(formatCoordinate(result.lat))
      setVisualLng(formatCoordinate(result.lng))
      setVisualZoom(result.zoom || zoomValue)
    } else {
      setVisualPreviewUrl(null)
      setVisualError(result.error || 'Failed to load visual preview.')
    }

    setVisualLoading(false)
  }

  const saveVisualTarget = () => {
    if (!visualProspect) return
    const latValue = parseCoordinate(visualLat)
    const lngValue = parseCoordinate(visualLng)

    if (latValue == null || lngValue == null) {
      setVisualError('Enter valid latitude and longitude before saving.')
      return
    }

    setVisualLoading(true)
    setVisualError(null)
    startTransition(async () => {
      const result = await saveProspectVisualTargetAction({
        id: visualProspect.id,
        lat: latValue,
        lng: lngValue,
        note: visualNote,
        zoom: visualZoom,
      })

      if (!result.success) {
        setVisualError(result.error || 'Failed to save visual target.')
      } else {
        setVisualPreviewUrl(result.visual_preview_url ?? visualPreviewUrl)
        setProspects((prev) => prev.map((prospect) => (
          prospect.id === visualProspect.id
            ? {
              ...prospect,
              visual_lat: result.visual_lat ?? latValue,
              visual_lng: result.visual_lng ?? lngValue,
              visual_verified: true,
              visual_verified_at: result.visual_verified_at ?? new Date().toISOString(),
              visual_review_note: result.visual_review_note ?? (visualNote.trim() || null),
                      visual_zoom: result.visual_zoom ?? visualZoom,
                      visual_preview_url: result.visual_preview_url ?? prospect.visual_preview_url,
                    }
            : prospect
        )))
        setVisualReferences((prev) => ({
          mapTilesImageUrl: result.visual_preview_url ?? prev?.mapTilesImageUrl ?? visualPreviewUrl,
          aerialViewReferenceUrl: prev?.aerialViewReferenceUrl ?? null,
          streetViewReferenceUrls: prev?.streetViewReferenceUrls ?? [],
          referenceCards: prev?.referenceCards ?? [],
        }))
        void loadVisualReferences(visualProspect.id, latValue, lngValue)
        setMessage(`Visual target verified for ${visualProspect.business_name || visualProspect.address}.`)
      }
      setVisualLoading(false)
    })
  }

  const saveStreetViewCapture = async (capture: {
    pano: string
    lat: number | null
    lng: number | null
    heading: number
    pitch: number
    fov: number
  }) => {
    if (!visualProspect) return

    setStreetViewCaptureLoading(true)
    setVisualError(null)
    const result = await saveProspectStreetViewCaptureAction({
      id: visualProspect.id,
      pano: capture.pano,
      lat: capture.lat,
      lng: capture.lng,
      heading: capture.heading,
      pitch: capture.pitch,
      fov: capture.fov,
    })

    if (!result.success) {
      setVisualError(result.error || 'Failed to save Street View capture.')
    } else {
      setMessage('Manual Street View reference saved for Veo.')
      await loadVisualReferences(
        visualProspect.id,
        parseCoordinate(visualLat),
        parseCoordinate(visualLng),
      )
    }
    setStreetViewCaptureLoading(false)
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
            className={`admin-chip px-3 py-2 transition-colors ${activeStage === 'active' ? 'admin-chip-active' : 'hover:border-stone-600 hover:text-stone-300'}`}
            onClick={() => setActiveStage('active')}
          >
            Active <span className="text-slate-500">{activeProspects.length}</span>
          </button>
          <button
            type="button"
            className={`admin-chip px-3 py-2 transition-colors ${activeStage === 'not_qualified' ? 'admin-chip-active' : 'hover:border-stone-600 hover:text-stone-300'}`}
            onClick={() => setActiveStage('not_qualified')}
          >
            Not Qualified <span className="text-amber-400">{notQualifiedProspects.length}</span>
          </button>
          <Link href="/admin" prefetch className="admin-chip px-3 py-2 transition-colors hover:border-stone-600 hover:text-stone-300">
            Proposal Targets <span className="text-emerald-400">{proposalTargetCount}</span>
          </Link>
          {activeStageOptions.map((stage) => (
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
                    <div className="mt-3 text-sm font-semibold text-stone-300">
                      {activeStage === 'not_qualified' ? 'No filtered prospects' : 'No active prospects'}
                    </div>
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
                        {prospect.visual_verified && <span className="admin-status admin-status-success px-2 py-1">visual verified</span>}
                        {isCoordinateReview(prospect) && <span className="admin-status admin-status-warning px-2 py-1">check coordinates</span>}
                        <span>{prospect.metro || 'Metro pending'} · {prospect.county || 'County pending'}</span>
                      </div>
                      {isCoordinateReview(prospect) && (
                        <div className="mt-2 max-w-xs text-xs text-amber-300">
                          {prospect.review_reason || 'Coordinate validation needs review'}
                          {prospect.coordinate_drift_meters != null ? ` · ${Math.round(prospect.coordinate_drift_meters)}m drift` : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="text-xs font-medium text-stone-300">{prospect.place_id || prospect.parcel_id || 'No ID'}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {prospect.sqft ? `${formatNumber(prospect.sqft)} sqft` : 'Area pending'} · {prospect.year_built || 'Year unknown'}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {prospect.use_code || prospect.category || 'Use code pending'}
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        Visual: {prospect.visual_verified ? `${formatCoordinate(prospect.visual_lat)}, ${formatCoordinate(prospect.visual_lng)}` : 'not verified'}
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
                          variant="outline"
                          className="rounded-md border-stone-700/70 bg-stone-950/70 text-stone-400 hover:bg-stone-900/60"
                          disabled={busy}
                          onClick={() => openVisualVerifier(prospect)}
                          title="Preview and verify the exact building before proposal generation"
                        >
                          <Crosshair className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="rounded-md bg-amber-300 text-stone-950 hover:bg-amber-200"
                          disabled={busy || blocksProposalGeneration(prospect) || hasProposal}
                          onClick={() => handlePromote(prospect.id)}
                          title={
                            needsVisualVerification(prospect)
                                ? 'Create proposal will auto-detect roof center first; verify manually if it cannot.'
                              : prospect.pipeline_stage === 'dead'
                                ? 'Prospect is marked not qualified'
                                : hasProposal ? 'Proposal already made' : 'Promote prospect to proposal worker'
                          }
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

      <Dialog
        open={Boolean(visualProspect)}
        onOpenChange={(open) => {
          if (!open) {
            setVisualProspect(null)
            setVisualPreviewUrl(null)
            setVisualReferences(null)
            setVisualError(null)
          }
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto border border-stone-700/70 bg-stone-950 text-stone-50 shadow-[0_24px_70px_rgba(15,23,42,0.35)] sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle className="text-xl text-stone-50">Verify target building</DialogTitle>
            <DialogDescription className="text-slate-500">
              Drag and zoom the map until the amber reticle sits on the target home roof. Save keeps this window open so you can check the saved satellite frame and street-level angles before creating a proposal.
            </DialogDescription>
          </DialogHeader>

          {visualProspect && (
            <div className="grid gap-5 xl:grid-cols-[1.35fr_0.95fr]">
              <div className="overflow-hidden rounded-2xl border border-stone-700/70 bg-stone-900/60">
                <div className="flex items-center justify-between border-b border-stone-700/70 px-3 py-2 text-xs text-slate-500">
                  <span>{visualPreviewSource ? `Map source: ${visualPreviewSource}` : 'Interactive satellite map'}</span>
                  {visualLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-300" />}
                </div>
                {parseCoordinate(visualLat) != null && parseCoordinate(visualLng) != null ? (
                  <VisualTargetMap
                    lat={parseCoordinate(visualLat)!}
                    lng={parseCoordinate(visualLng)!}
                    zoom={visualZoom}
                    onChange={(target) => {
                      setVisualLat(String(target.lat))
                      setVisualLng(String(target.lng))
                      setVisualZoom(target.zoom)
                      setVisualPreviewUrl(null)
                      setVisualReferences(null)
                    }}
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-stone-950 px-6 text-center text-sm text-slate-500">
                    No coordinates available. Paste latitude and longitude, then refresh.
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-stone-700/70 bg-stone-900/60 p-4">
                  <div className="text-sm font-semibold text-stone-100">
                    {visualProspect.business_name || visualProspect.address.split(',')[0]}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{visualProspect.address}</div>
                  <div className="mt-3 text-xs text-slate-500">
                    Places coords: {formatCoordinate(visualProspect.lat)}, {formatCoordinate(visualProspect.lng)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Geocode coords: {formatCoordinate(visualProspect.geocode_lat)}, {formatCoordinate(visualProspect.geocode_lng)}
                  </div>
                </div>

                <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Visual latitude
                  <input
                    value={visualLat}
                    onChange={(event) => setVisualLat(event.target.value)}
                    className="admin-input mt-2 px-3 py-2.5 text-sm text-stone-100"
                    placeholder="43.123456"
                  />
                </label>

                <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Visual longitude
                  <input
                    value={visualLng}
                    onChange={(event) => setVisualLng(event.target.value)}
                    className="admin-input mt-2 px-3 py-2.5 text-sm text-stone-100"
                    placeholder="-79.123456"
                  />
                </label>

                <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Map zoom
                  <input
                    value={visualZoom}
                    onChange={(event) => setVisualZoom(Number(event.target.value))}
                    type="number"
                    min="16"
                    max="21"
                    className="admin-input mt-2 px-3 py-2.5 text-sm text-stone-100"
                  />
                </label>

                <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Review note
                  <textarea
                    value={visualNote}
                    onChange={(event) => setVisualNote(event.target.value)}
                    className="admin-input mt-2 min-h-20 px-3 py-2.5 text-sm text-stone-100"
                    placeholder="Optional note, e.g. corrected from Google Maps pin"
                  />
                </label>

                {visualPreviewUrl && (
                  <div className="rounded-xl border border-stone-700/70 bg-stone-900/60 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Saved proposal frame</div>
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
                        Used by n8n
                      </span>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={visualPreviewUrl}
                      alt={`Saved satellite preview for ${visualProspect.business_name || visualProspect.address}`}
                      className="mt-3 aspect-video w-full rounded-lg object-cover"
                    />
                  </div>
                )}

                <div className="rounded-xl border border-stone-700/70 bg-stone-900/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Veo reference angles</div>
                      <p className="mt-1 text-xs text-slate-500">
                        These are the extra identity anchors we send alongside the roof frame.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-lg border-stone-700/70 bg-stone-950/70 text-stone-300 hover:bg-stone-900/60"
                      disabled={visualReferencesLoading || visualLoading}
                      onClick={() => void loadVisualReferences()}
                    >
                      {visualReferencesLoading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RadioTower className="mr-2 h-3.5 w-3.5" />}
                      Load angles
                    </Button>
                  </div>

                  {visualReferencesLoading ? (
                    <div className="mt-3 flex aspect-video items-center justify-center rounded-lg border border-stone-800 bg-stone-950 text-xs text-slate-500">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin text-amber-300" />
                      Collecting Google Street View angles...
                    </div>
                  ) : (
                    parseCoordinate(visualLat) != null && parseCoordinate(visualLng) != null && (
                      <div className="mt-3">
                        <StreetViewCapture
                          lat={parseCoordinate(visualLat)!}
                          lng={parseCoordinate(visualLng)!}
                          disabled={streetViewCaptureLoading}
                          onCapture={(capture) => {
                            void saveStreetViewCapture(capture)
                          }}
                        />
                        {streetViewCaptureLoading && (
                          <div className="mt-2 rounded-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
                            <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" />
                            Saving manual Street View reference...
                          </div>
                        )}
                      </div>
                    )
                  )}

                  {!visualReferencesLoading && visualReferences && (
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {(visualReferences.referenceCards.length
                        ? visualReferences.referenceCards
                        : fallbackReferenceCards(visualReferences)
                      ).map((reference) => (
                        <div
                          key={reference.id}
                          className={`overflow-hidden rounded-lg border bg-stone-950 ${
                            reference.url ? 'border-stone-800' : 'border-amber-900/50'
                          }`}
                        >
                          <div className="border-b border-stone-800 px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs font-semibold text-stone-200">{reference.label}</div>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                                reference.url
                                  ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                  : 'border border-amber-500/30 bg-amber-500/10 text-amber-200'
                              }`}>
                                {reference.url ? 'Available' : 'Unavailable'}
                              </span>
                            </div>
                            <div className="mt-1 text-[11px] text-slate-500">{reference.type}</div>
                          </div>

                          {reference.url ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={reference.url}
                                alt={`${reference.label} for ${visualProspect.business_name || visualProspect.address}`}
                                className="aspect-video w-full object-cover"
                              />
                            </>
                          ) : (
                            <div className="flex aspect-video items-center justify-center px-4 text-center text-xs leading-5 text-amber-200/90">
                              {reference.unavailableReason || 'Photo unavailable.'}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {visualReferences && !visualReferences.mapTilesImageUrl && !visualReferences.aerialViewReferenceUrl && visualReferences.streetViewReferenceUrls.length === 0 && (
                    <div className="mt-3 rounded-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
                      No street-level angles were available for these coordinates. Veo will use the saved satellite frame.
                    </div>
                  )}
                </div>

                {visualError && (
                  <div className="rounded-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
                    {visualError}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="mt-2 gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="rounded-lg border-stone-700/70 bg-stone-950/70 text-stone-300 hover:bg-stone-900/60"
              disabled={visualLoading || isPending}
              onClick={() => void refreshVisualPreview()}
            >
              {visualLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crosshair className="mr-2 h-4 w-4" />}
              Generate Preview
            </Button>
            <Button
              type="button"
              className="rounded-lg bg-amber-300 px-4 font-semibold text-stone-950 hover:bg-amber-200"
              disabled={visualLoading || isPending || !visualProspect}
              onClick={saveVisualTarget}
            >
              {(visualLoading || isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save + Mark Verified
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
