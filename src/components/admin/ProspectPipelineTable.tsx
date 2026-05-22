'use client'

import { useEffect, useMemo, useState, useTransition, type SetStateAction } from 'react'
import Link from 'next/link'
import { Crosshair, ExternalLink, Loader2, RadioTower, Rocket, Send, Trash2, TriangleAlert, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getProspectVisualCandidate, sortProspectsForAdmin, type Prospect, type ProspectStage, prospectStages } from '@/lib/prospect'
import { getProspectStageBadgeClass, prospectStageLabels } from '@/lib/admin-pipeline'
import { buildVisualReferenceCards, type VisualReferenceCard } from '@/lib/prospect-admin'
import {
  bulkDeleteProspectsAction,
  bulkPromoteProspectsToLeadsAction,
  deleteProspectAction,
  getProspectVisualPreviewAction,
  getProspectVisualReferencesAction,
  getProspectSolarCapabilityAction,
  promoteProspectToLeadAction,
  deleteProspectVisualReferenceAction,
  saveProspectSolarReferenceAction,
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
  cleanedPreviewImageUrl?: string | null
  solarApiLayoutImageUrl: string | null
  solarReferenceEnabled: boolean
  solarReferenceLat: number | null
  solarReferenceLng: number | null
  solarReferenceZoom: number | null
  referenceCards: VisualReferenceCard[]
}

type SolarCapability = {
  building: {
    available: boolean
    centerLat: number | null
    centerLng: number | null
    roofSegmentCount: number
    panelCandidateCount: number
    maxPanelCount: number
    maxArrayAreaSqft: number | null
    maxSunshineHoursPerYear: number | null
    unavailableReason: string | null
  }
  roofSegments: Array<{
    id: number
    areaSqft: number | null
    pitchDegrees: number | null
    azimuthDegrees: number | null
  }>
  dataLayers: {
    available: boolean
    imageryQuality: string | null
    imageryDate: string | null
    imageryProcessedDate: string | null
    unavailableReason: string | null
    cards: Array<{
      id: string
      label: string
      available: boolean
      reason: string | null
      previewUrl?: string | null
      originalUrl?: string | null
    }>
  }
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
  return buildVisualReferenceCards({
    mapTilesImageUrl: references.mapTilesImageUrl,
    aerialViewReferenceUrl: references.aerialViewReferenceUrl,
    streetViewReferenceUrls: references.streetViewReferenceUrls,
    cleanedPreviewImageUrl: references.cleanedPreviewImageUrl || null,
    solarApiLayoutImageUrl: references.solarApiLayoutImageUrl,
  }, 0)
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
  const [deletingReferenceUrl, setDeletingReferenceUrl] = useState<string | null>(null)
  const [solarReferenceLoading, setSolarReferenceLoading] = useState(false)
  const [solarReferenceEnabled, setSolarReferenceEnabled] = useState(true)
  const [solarReferenceLat, setSolarReferenceLat] = useState('')
  const [solarReferenceLng, setSolarReferenceLng] = useState('')
  const [solarReferenceZoom, setSolarReferenceZoom] = useState(19)
  const [solarCapability, setSolarCapability] = useState<SolarCapability | null>(null)
  const [solarCapabilityLoading, setSolarCapabilityLoading] = useState(false)
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
    setSolarCapability(null)
    setSolarReferenceEnabled(prospect.solar_reference_enabled !== false)
    setSolarReferenceLat(formatCoordinate(prospect.solar_reference_lat ?? candidate?.lat ?? null))
    setSolarReferenceLng(formatCoordinate(prospect.solar_reference_lng ?? candidate?.lng ?? null))
    setSolarReferenceZoom(prospect.solar_reference_zoom || prospect.visual_zoom || 19)
    setVisualError(null)

    if (candidate) {
      void refreshVisualPreview(prospect.id, candidate.lat, candidate.lng, prospect.visual_zoom || 19)
      void loadVisualReferences(prospect.id, candidate.lat, candidate.lng)
      void loadSolarCapability(prospect.id, candidate.lat, candidate.lng)
    } else {
      setVisualError('No coordinates available for this prospect.')
    }
  }

  const loadSolarCapability = async (
    id = visualProspect?.id,
    latValue = parseCoordinate(visualLat),
    lngValue = parseCoordinate(visualLng),
  ) => {
    if (!id) return
    if (latValue == null || lngValue == null) return

    setSolarCapabilityLoading(true)
    const result = await getProspectSolarCapabilityAction(id, latValue, lngValue)
    if (result.success && result.building && result.dataLayers) {
      setSolarCapability({
        building: result.building,
        roofSegments: result.roofSegments || [],
        dataLayers: result.dataLayers,
      })
    } else {
      setSolarCapability(null)
      setVisualError(result.error || 'Failed to load Google Solar API roof data.')
    }
    setSolarCapabilityLoading(false)
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
        solarApiLayoutImageUrl: result.solarApiLayoutImageUrl || null,
        solarReferenceEnabled: result.solarReferenceEnabled !== false,
        solarReferenceLat: result.solarReferenceLat ?? null,
        solarReferenceLng: result.solarReferenceLng ?? null,
        solarReferenceZoom: result.solarReferenceZoom ?? null,
        referenceCards: result.referenceCards || [],
      })
      setSolarReferenceEnabled(result.solarReferenceEnabled !== false)
      if (typeof result.solarReferenceLat === 'number') setSolarReferenceLat(String(result.solarReferenceLat))
      if (typeof result.solarReferenceLng === 'number') setSolarReferenceLng(String(result.solarReferenceLng))
      if (typeof result.solarReferenceZoom === 'number') setSolarReferenceZoom(result.solarReferenceZoom)
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
          solarApiLayoutImageUrl: prev?.solarApiLayoutImageUrl ?? null,
          solarReferenceEnabled: prev?.solarReferenceEnabled ?? solarReferenceEnabled,
          solarReferenceLat: prev?.solarReferenceLat ?? parseCoordinate(solarReferenceLat),
          solarReferenceLng: prev?.solarReferenceLng ?? parseCoordinate(solarReferenceLng),
          solarReferenceZoom: prev?.solarReferenceZoom ?? solarReferenceZoom,
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
      setMessage('Manual Street View context saved.')
      await loadVisualReferences(
        visualProspect.id,
        parseCoordinate(visualLat),
        parseCoordinate(visualLng),
      )
    }
    setStreetViewCaptureLoading(false)
  }

  const deleteVisualReference = async (reference: VisualReferenceCard) => {
    if (!visualProspect || !reference.url) return

    setDeletingReferenceUrl(reference.url)
    setVisualError(null)
    const result = await deleteProspectVisualReferenceAction({
      id: visualProspect.id,
      url: reference.url,
    })

    if (!result.success) {
      setVisualError(result.error || 'Failed to delete reference image.')
    } else {
      if (reference.url === visualPreviewUrl) setVisualPreviewUrl(null)
      setMessage(`${reference.label} deleted.`)
      await loadVisualReferences(
        visualProspect.id,
        parseCoordinate(visualLat),
        parseCoordinate(visualLng),
      )
    }
    setDeletingReferenceUrl(null)
  }

  const saveSolarReference = async () => {
    if (!visualProspect) return
    const latValue = parseCoordinate(solarReferenceLat)
    const lngValue = parseCoordinate(solarReferenceLng)

    if (solarReferenceEnabled && (latValue == null || lngValue == null)) {
      setVisualError('Enter valid Solar API reference latitude and longitude.')
      return
    }

    setSolarReferenceLoading(true)
    setVisualError(null)
    const result = await saveProspectSolarReferenceAction({
      id: visualProspect.id,
      lat: latValue ?? parseCoordinate(visualLat) ?? 0,
      lng: lngValue ?? parseCoordinate(visualLng) ?? 0,
      zoom: solarReferenceZoom,
      enabled: solarReferenceEnabled,
    })

    if (!result.success) {
      setVisualError(result.error || 'Failed to update Solar API reference.')
    } else {
      setMessage(solarReferenceEnabled ? 'Solar API roof reference updated.' : 'Solar API roof reference excluded.')
      await loadVisualReferences(
        visualProspect.id,
        parseCoordinate(visualLat),
        parseCoordinate(visualLng),
      )
    }
    setSolarReferenceLoading(false)
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
    <section className="admin-panel min-w-0 overflow-hidden rounded-lg border border-[#30343b] bg-[#181a1f] shadow-[0_14px_34px_rgba(0,0,0,0.24)]">
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
            Create proposal <span className="text-slate-300">{selectedIds.length}</span>
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
              {prospectStageLabels[stage]} <span className="text-slate-500">{counts[stage]}</span>
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

      <div className="min-w-0 overflow-x-auto">
        <table className="admin-data-table w-full min-w-[1060px] table-fixed text-left text-sm">
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
              <th className="w-[26%] px-4 py-3">Prospect</th>
              <th className="w-[18%] px-4 py-3">Home</th>
              <th className="w-[16%] px-4 py-3">Solar</th>
              <th className="w-[16%] px-4 py-3">Contact</th>
              <th className="w-[12%] px-4 py-3">Stage</th>
              <th className="w-[12%] px-4 py-3 text-right">Actions</th>
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
                      <div className="truncate font-semibold text-stone-50">{prospect.business_name || prospect.address.split(',')[0]}</div>
                      <div className="mt-1 line-clamp-2 max-w-xs text-xs leading-5 text-slate-500">{prospect.address}</div>
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
                      <div className="truncate text-sm text-stone-100">{prospect.first_name || prospect.last_name ? `${prospect.first_name || ''} ${prospect.last_name || ''}`.trim() : prospect.owner_name || prospect.owner_llc || 'Contact pending'}</div>
                      <div className="mt-1 truncate text-xs text-slate-500">{prospect.homeowner_email || prospect.owner_email || 'No email yet'}</div>
                      <div className="mt-1 truncate text-xs text-slate-500">{prospect.homeowner_phone || prospect.owner_title || prospect.enrichment_source || 'No phone yet'}</div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getProspectStageBadgeClass(prospect.pipeline_stage)}`}>
                        {prospectStageLabels[prospect.pipeline_stage]}
                      </div>
                      <select
                        value={prospect.pipeline_stage}
                        onChange={(event) => handleStageChange(prospect.id, event.target.value as ProspectStage)}
                        disabled={busy}
                        className="admin-input mt-3 block px-2 py-2 text-xs text-stone-300"
                      >
                        {prospectStages.map((stage) => (
                          <option key={stage} value={stage}>{prospectStageLabels[stage]}</option>
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
        <DialogContent className="max-h-[92vh] overflow-y-auto border border-stone-700/70 bg-stone-950 text-stone-50 shadow-[0_24px_70px_rgba(15,23,42,0.35)] sm:max-w-[min(96vw,1500px)]">
          <DialogHeader>
            <DialogTitle className="text-xl text-stone-50">Verify solar target</DialogTitle>
            <DialogDescription className="text-slate-500">
              Use the map only to lock coordinates. Confirm the actual roof with Google Solar imagery before proposal generation.
            </DialogDescription>
          </DialogHeader>

          {visualProspect && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="admin-eyebrow">Solar target</div>
                    <div className="mt-1 text-sm font-semibold text-stone-100">
                      First center the target, then inspect the Solar API roof image that the render will use.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-stone-700/70 bg-stone-950/70 px-3 py-1 text-slate-300">1. Track on map</span>
                    <span className="rounded-full border border-stone-700/70 bg-stone-950/70 px-3 py-1 text-slate-300">2. Review Solar image</span>
                    <span className="rounded-full border border-stone-700/70 bg-stone-950/70 px-3 py-1 text-slate-300">3. Confirm target</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
                <div className="overflow-hidden rounded-2xl border border-stone-700/70 bg-stone-900/60 shadow-[0_18px_45px_rgba(0,0,0,0.22)]">
                  <div className="flex items-center justify-between border-b border-stone-700/70 px-3 py-2 text-xs text-slate-500">
                    <span>{visualPreviewSource ? `Tracker source: ${visualPreviewSource}` : 'Interactive map tracker'}</span>
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
                        setSolarCapability(null)
                      }}
                    />
                  ) : (
                    <div className="flex aspect-video items-center justify-center bg-stone-950 px-6 text-center text-sm text-slate-500">
                      No coordinates available. Paste latitude and longitude, then refresh.
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-stone-700/70 bg-stone-900/60 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="admin-eyebrow">Target</div>
                        <div className="mt-1 text-base font-semibold text-stone-100">
                          {visualProspect.business_name || visualProspect.address.split(',')[0]}
                        </div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">{visualProspect.address}</div>
                      </div>
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200">
                        Visual lock
                      </span>
                    </div>

                    <div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                      <div className="rounded-lg border border-stone-800 bg-stone-950/70 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-[0.14em]">Places</div>
                        <div className="mt-1 font-mono text-stone-300">{formatCoordinate(visualProspect.lat)}, {formatCoordinate(visualProspect.lng)}</div>
                      </div>
                      <div className="rounded-lg border border-stone-800 bg-stone-950/70 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-[0.14em]">Geocode</div>
                        <div className="mt-1 font-mono text-stone-300">{formatCoordinate(visualProspect.geocode_lat) || 'none'}, {formatCoordinate(visualProspect.geocode_lng) || 'none'}</div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Latitude
                        <input
                          value={visualLat}
                          onChange={(event) => setVisualLat(event.target.value)}
                          className="admin-input mt-2 px-3 py-2.5 font-mono text-sm text-stone-100"
                          placeholder="43.123456"
                        />
                      </label>

                      <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Longitude
                        <input
                          value={visualLng}
                          onChange={(event) => setVisualLng(event.target.value)}
                          className="admin-input mt-2 px-3 py-2.5 font-mono text-sm text-stone-100"
                          placeholder="-79.123456"
                        />
                      </label>

                      <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Zoom
                        <input
                          value={visualZoom}
                          onChange={(event) => setVisualZoom(Number(event.target.value))}
                          type="number"
                          min="16"
                          max="21"
                          className="admin-input mt-2 px-3 py-2.5 font-mono text-sm text-stone-100"
                        />
                      </label>

                      <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Note
                        <input
                          value={visualNote}
                          onChange={(event) => setVisualNote(event.target.value)}
                          className="admin-input mt-2 px-3 py-2.5 text-sm text-stone-100"
                          placeholder="Optional"
                        />
                      </label>
                    </div>
                  </div>

                  {visualPreviewUrl && (
                    <div className="rounded-2xl border border-stone-700/70 bg-stone-900/60 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Solar API roof image</div>
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
                          Review before confirming
                        </span>
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={visualPreviewUrl}
                        alt={`Google Solar roof imagery for ${visualProspect.business_name || visualProspect.address}`}
                        className="mt-3 max-h-[340px] w-full rounded-lg object-contain"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(390px,0.85fr)]">
                <div className="rounded-2xl border border-stone-700/70 bg-stone-900/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Reference deck</div>
                      <p className="mt-1 text-xs text-slate-500">Optional context only. The proposal render uses Solar API imagery and panel geometry.</p>
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
                      Refresh deck
                    </Button>
                  </div>

                  {visualReferencesLoading ? (
                    <div className="mt-3 flex aspect-video items-center justify-center rounded-lg border border-stone-800 bg-stone-950 text-xs text-slate-500">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin text-amber-300" />
                      Collecting optional site context...
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
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
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
                              <div className="flex shrink-0 items-center gap-1.5">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                                  reference.url
                                    ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                    : 'border border-amber-500/30 bg-amber-500/10 text-amber-200'
                                }`}>
                                  {reference.url ? 'Ready' : 'Missing'}
                                </span>
                                {reference.url && reference.canDelete && (
                                  <button
                                    type="button"
                                    className="grid h-6 w-6 place-items-center rounded-md border border-red-900/50 bg-red-950/20 text-red-300 transition-colors hover:bg-red-950/40 disabled:opacity-50"
                                    disabled={deletingReferenceUrl === reference.url}
                                    onClick={() => void deleteVisualReference(reference)}
                                    title={`Delete ${reference.label}`}
                                  >
                                    {deletingReferenceUrl === reference.url
                                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      : <Trash2 className="h-3.5 w-3.5" />}
                                  </button>
                                )}
                              </div>
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
                      No optional context images were available. The proposal render can still use Solar API imagery.
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-stone-700/70 bg-stone-900/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Solar API</div>
                      <p className="mt-1 text-xs text-slate-500">These are the source layers. The RGB image is the real roof image used for the proposal render.</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-lg border-stone-700/70 bg-stone-950/70 text-stone-300 hover:bg-stone-900/60"
                      disabled={solarCapabilityLoading || visualLoading}
                      onClick={() => void loadSolarCapability()}
                    >
                      {solarCapabilityLoading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-2 h-3.5 w-3.5" />}
                      Load data
                    </Button>
                  </div>

                  <div className="mt-4 rounded-xl border border-stone-800 bg-stone-950/70 p-3">
                    <label className="flex items-center justify-between gap-3 text-sm font-semibold text-stone-200">
                      Include Solar API roof reference
                      <input
                        type="checkbox"
                        checked={solarReferenceEnabled}
                        onChange={(event) => setSolarReferenceEnabled(event.target.checked)}
                        className="h-4 w-4 accent-amber-300"
                      />
                    </label>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Lat
                        <input
                          value={solarReferenceLat}
                          onChange={(event) => setSolarReferenceLat(event.target.value)}
                          className="admin-input mt-2 px-3 py-2 font-mono text-xs text-stone-100"
                        />
                      </label>
                      <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Lng
                        <input
                          value={solarReferenceLng}
                          onChange={(event) => setSolarReferenceLng(event.target.value)}
                          className="admin-input mt-2 px-3 py-2 font-mono text-xs text-stone-100"
                        />
                      </label>
                      <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Zoom
                        <input
                          value={solarReferenceZoom}
                          onChange={(event) => setSolarReferenceZoom(Number(event.target.value))}
                          type="number"
                          min="16"
                          max="21"
                          className="admin-input mt-2 px-3 py-2 font-mono text-xs text-stone-100"
                        />
                      </label>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-3 w-full rounded-lg border-stone-700/70 bg-stone-900/70 text-stone-300 hover:bg-stone-800"
                      disabled={solarReferenceLoading}
                      onClick={() => void saveSolarReference()}
                    >
                      {solarReferenceLoading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-2 h-3.5 w-3.5" />}
                      {solarReferenceEnabled ? 'Update Solar reference' : 'Exclude Solar reference'}
                    </Button>
                  </div>

                  {solarCapabilityLoading ? (
                    <div className="mt-3 flex aspect-video items-center justify-center rounded-lg border border-stone-800 bg-stone-950 text-xs text-slate-500">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin text-amber-300" />
                      Reading Google Solar roof data...
                    </div>
                  ) : solarCapability && (
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          ['Roof segments', solarCapability.building.roofSegmentCount || 'Unavailable'],
                          ['Panel candidates', solarCapability.building.panelCandidateCount || 'Unavailable'],
                          ['Max panel count', solarCapability.building.maxPanelCount || 'Unavailable'],
                          ['Max array area', solarCapability.building.maxArrayAreaSqft ? `${formatNumber(solarCapability.building.maxArrayAreaSqft)} sqft` : 'Unavailable'],
                          ['Sun hours/year', solarCapability.building.maxSunshineHoursPerYear || 'Unavailable'],
                          ['Imagery quality', solarCapability.dataLayers.imageryQuality || 'Unavailable'],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-lg border border-stone-800 bg-stone-950 p-3">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
                            <div className="mt-1 text-sm font-semibold text-stone-100">{value}</div>
                          </div>
                        ))}
                      </div>

                      {solarCapability.roofSegments.length > 0 ? (
                        <div className="rounded-lg border border-stone-800 bg-stone-950 p-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Detected roof planes</div>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {solarCapability.roofSegments.map((segment) => (
                              <div key={segment.id} className="rounded-md border border-stone-800 bg-stone-900/60 px-3 py-2 text-xs text-slate-400">
                                <div className="font-semibold text-stone-200">Plane {segment.id}</div>
                                <div>{segment.areaSqft ? `${formatNumber(segment.areaSqft)} sqft` : 'Area unavailable'}</div>
                                <div>Pitch {segment.pitchDegrees ?? 'unknown'}° · Azimuth {segment.azimuthDegrees ?? 'unknown'}°</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
                          {solarCapability.building.unavailableReason || 'Google Solar did not return roof segment geometry for this location.'}
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {solarCapability.dataLayers.cards.map((layer) => (
                          <div key={layer.id} className={`rounded-lg border px-3 py-2 ${
                            layer.available
                              ? 'border-emerald-500/30 bg-emerald-500/10'
                              : 'border-amber-500/30 bg-amber-500/10'
                          }`}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs font-semibold text-stone-100">{layer.label}</div>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                                layer.available ? 'text-emerald-200' : 'text-amber-200'
                              }`}>
                                {layer.available ? 'Available' : 'Unavailable'}
                              </span>
                            </div>
                            {!layer.available && layer.reason && (
                              <div className="mt-1 text-[11px] leading-4 text-amber-200/90">{layer.reason}</div>
                            )}
                            {layer.previewUrl && (
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={layer.previewUrl}
                                  alt={`${layer.label} preview for ${visualProspect.business_name || visualProspect.address}`}
                                  className="mt-2 max-h-44 w-full rounded-md border border-stone-800/80 bg-stone-950 object-contain"
                                />
                              </>
                            )}
                            {layer.originalUrl && (
                              <a
                                href={layer.originalUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-flex text-[11px] font-semibold text-amber-200 hover:text-amber-100"
                              >
                                Open GeoTIFF
                              </a>
                            )}
                          </div>
                        ))}
                      </div>

                      {(solarCapability.dataLayers.imageryDate || solarCapability.dataLayers.imageryProcessedDate) && (
                        <div className="text-[11px] text-slate-500">
                          Imagery date: {solarCapability.dataLayers.imageryDate || 'unknown'} · Processed: {solarCapability.dataLayers.imageryProcessedDate || 'unknown'}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {visualError && (
                  <div className="rounded-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-xs text-amber-200 xl:col-span-2">
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
              Load Solar Image
            </Button>
            <Button
              type="button"
              className="rounded-lg bg-amber-300 px-4 font-semibold text-stone-950 hover:bg-amber-200"
              disabled={visualLoading || isPending || !visualProspect}
              onClick={saveVisualTarget}
            >
              {(visualLoading || isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Solar Target
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
