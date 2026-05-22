import type { VisualReferenceSet } from '@/lib/openclaw-google'

export type VisualReferenceCard = {
  id: string
  label: string
  type: string
  url: string | null
  unavailableReason: string | null
  canDelete?: boolean
}

export function formatGoogleDate(date?: { year?: number; month?: number; day?: number }) {
  if (!date?.year || !date.month || !date.day) return null
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

export function getProspectStoragePathFromPublicUrl(url: string) {
  try {
    const parsed = new URL(url)
    const marker = '/storage/v1/object/public/prospects/'
    const index = parsed.pathname.indexOf(marker)
    if (index === -1) return null
    return decodeURIComponent(parsed.pathname.slice(index + marker.length))
  } catch {
    return null
  }
}

export function getExcludedReferenceUrls(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((url): url is string => typeof url === 'string' && url.startsWith('http'))
}

export function filterExcludedReferences(referenceSet: VisualReferenceSet, excludedUrls: string[]): VisualReferenceSet {
  if (!excludedUrls.length) return referenceSet
  const excluded = new Set(excludedUrls)

  return {
    ...referenceSet,
    mapTilesImageUrl: referenceSet.mapTilesImageUrl && !excluded.has(referenceSet.mapTilesImageUrl)
      ? referenceSet.mapTilesImageUrl
      : null,
    aerialViewReferenceUrl: referenceSet.aerialViewReferenceUrl && !excluded.has(referenceSet.aerialViewReferenceUrl)
      ? referenceSet.aerialViewReferenceUrl
      : null,
    solarApiLayoutImageUrl: referenceSet.solarApiLayoutImageUrl && !excluded.has(referenceSet.solarApiLayoutImageUrl)
      ? referenceSet.solarApiLayoutImageUrl
      : null,
    cleanedPreviewImageUrl: referenceSet.cleanedPreviewImageUrl && !excluded.has(referenceSet.cleanedPreviewImageUrl)
      ? referenceSet.cleanedPreviewImageUrl
      : null,
    streetViewReferenceUrls: referenceSet.streetViewReferenceUrls.filter((url) => !excluded.has(url)),
  }
}

export function buildVisualReferenceCards(
  referenceSet: VisualReferenceSet,
  manualStreetViewCount = 0,
): VisualReferenceCard[] {
  const cards: VisualReferenceCard[] = [
    {
      id: 'map-tiles',
      label: 'Solar API RGB roof image',
      type: 'Actual Solar API imagery used for confirmation',
      url: referenceSet.mapTilesImageUrl,
      unavailableReason: referenceSet.mapTilesImageUrl
        ? null
        : 'Unavailable until the Solar API image is loaded and saved.',
      canDelete: Boolean(referenceSet.mapTilesImageUrl),
    },
    {
      id: 'solar-api-layout',
      label: 'Solar API roof reference',
      type: 'No-panel roof geometry reference',
      url: referenceSet.solarApiLayoutImageUrl || null,
      unavailableReason: referenceSet.solarApiLayoutImageUrl
        ? null
        : 'Unavailable. Google Solar API did not return panel-candidate geometry for this roof.',
      canDelete: Boolean(referenceSet.solarApiLayoutImageUrl),
    },
    {
      id: 'aerial-view',
      label: 'Google Aerial View',
      type: 'Optional 3D aerial identity reference',
      url: referenceSet.aerialViewReferenceUrl,
      unavailableReason: referenceSet.aerialViewReferenceUrl
        ? null
        : 'Unavailable. Google Aerial View did not return an active image/video for this address or region.',
      canDelete: false,
    },
  ]

  for (let index = 0; index < 5; index += 1) {
    const url = referenceSet.streetViewReferenceUrls[index] || null
    const isManual = index < manualStreetViewCount
    cards.push({
      id: `street-view-${index + 1}`,
      label: isManual ? `Manual Street View ${index + 1}` : `Street View ${index + 1}`,
      type: isManual
        ? 'Manually aimed facade reference'
        : index === 0
          ? 'Front-facing facade anchor'
          : 'Street-level angle variant',
      url,
      unavailableReason: url
        ? null
        : 'Unavailable. Street View did not return another usable outdoor angle facing the selected home.',
      canDelete: Boolean(url),
    })
  }

  return cards
}

export function clampVisualZoom(value: unknown) {
  const zoom = Number(value)
  if (!Number.isFinite(zoom)) return 19
  return Math.min(Math.max(Math.round(zoom), 16), 21)
}
