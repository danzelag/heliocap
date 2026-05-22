import sharp from 'sharp'
import {
  buildSolarLayoutDebug,
  buildSolarModel,
  buildSolarPanelLayerSvg,
  collectVisualReferences,
  fetchAndUploadSolarDataLayerAssets,
  fetchSolarInsights,
  listManualStreetViewReferenceUrls,
  selectStaticMapCenter,
  uploadLeadAsset,
} from '@/lib/openclaw-google'
import { filterExcludedReferences } from '@/lib/prospect-admin'
import type { AdminSupabase, ProspectLookup, RoofAssets, WorkflowJob } from '@/lib/proposal-workflow-shared'
import {
  getPresentationRotationDegrees,
  getSolarRgbRasterPlacement,
  getStringArray,
  getUsableSolarRgbLayer,
  PROPOSAL_RENDER_HEIGHT,
  PROPOSAL_RENDER_WIDTH,
  setWorkflowProgress,
} from '@/lib/proposal-workflow-shared'

export async function generateRoofAssets(
  supabase: AdminSupabase,
  job: WorkflowJob,
  prospect: ProspectLookup | null,
): Promise<RoofAssets> {
  await setWorkflowProgress(supabase, job, {
    step: 'Fetching roof and solar data',
    progressPercent: 20,
    buildStatus: 'qualified',
  })

  const solarInsights = await fetchSolarInsights(job.lat, job.lng).catch((error) => {
    console.error('[proposal-workflow] Google Solar fallback:', error)
    return null
  })
  const solarModel = buildSolarModel(solarInsights)
  await setWorkflowProgress(supabase, job, {
    step: 'Solar data fetched',
    progressPercent: 28,
    buildStatus: 'qualified',
    receipt: {
      solar_model: solarModel,
      solar_insights_available: Boolean(solarInsights),
    },
  })

  const mapCenter = selectStaticMapCenter(solarInsights, job.lat, job.lng)
  const solarDataLayerAssets = await fetchAndUploadSolarDataLayerAssets({
    supabase,
    bucket: 'leads',
    slug: job.slug,
    lat: mapCenter.lat,
    lng: mapCenter.lng,
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[proposal-workflow] Solar data layers unavailable: ${message}`)
    return null
  })
  const solarRgbLayer = getUsableSolarRgbLayer(solarDataLayerAssets?.layers || [])
  if (!solarRgbLayer) {
    throw new Error('Solar API RGB imagery is unavailable for this roof. Verify the target or choose another source before publishing.')
  }
  const roofImageUrl = solarRgbLayer.previewUrl

  const visualReferences = await collectVisualReferences({
    supabase,
    bucket: 'leads',
    slug: job.slug,
    lat: mapCenter.lat,
    lng: mapCenter.lng,
    address: job.address,
    mapTilesImageUrl: null,
  })

  if (prospect?.id) {
    const manualStreetViewReferenceUrls = await listManualStreetViewReferenceUrls({
      supabase,
      prospectId: prospect.id,
    })
    visualReferences.streetViewReferenceUrls = [
      ...manualStreetViewReferenceUrls,
      ...visualReferences.streetViewReferenceUrls,
    ].filter((url, index, urls) => urls.indexOf(url) === index)
  }

  if (prospect?.solar_reference_enabled === false) {
    visualReferences.solarApiLayoutImageUrl = null
  } else {
    visualReferences.solarApiLayoutImageUrl = prospect?.solar_reference_url || roofImageUrl
  }

  const excludedReferenceUrls = getStringArray(prospect?.visual_reference_exclusions)
  const filteredVisualReferences = excludedReferenceUrls.length
    ? filterExcludedReferences(visualReferences, excludedReferenceUrls)
    : visualReferences

  const rasterPlacement = getSolarRgbRasterPlacement(solarRgbLayer)
  const panelLayerSvg = buildSolarPanelLayerSvg({
    insights: solarInsights,
    model: solarModel,
    width: PROPOSAL_RENDER_WIDTH,
    height: PROPOSAL_RENDER_HEIGHT,
    rasterPlacement,
  })
  const solarLayoutDebug = buildSolarLayoutDebug(solarInsights, solarModel)

  await setWorkflowProgress(supabase, job, {
    step: 'Black panel layout generated',
    progressPercent: 38,
    buildStatus: 'image_generating',
    receipt: {
      black_panel_layout: true,
      solarPanelCount: solarModel.panelCount,
      solar_layout_debug: solarLayoutDebug,
      solar_data_layers: solarDataLayerAssets,
    },
  })

  const renderImageUrl = await uploadLeadAsset({
    supabase,
    bucket: 'leads',
    slug: job.slug,
    fileName: 'solar-panel-layer.svg',
    body: panelLayerSvg,
    contentType: 'image/svg+xml',
  })

  const renderPreviewBuffer = await buildSolarRgbProposalRender(roofImageUrl, panelLayerSvg)
  const renderPreviewUrl = await uploadLeadAsset({
    supabase,
    bucket: 'leads',
    slug: job.slug,
    fileName: 'render_preview.webp',
    body: renderPreviewBuffer,
    contentType: 'image/webp',
  })

  await setWorkflowProgress(supabase, job, {
    step: 'Reference image uploaded',
    progressPercent: 45,
    buildStatus: 'image_generating',
    receipt: {
      visual_references: filteredVisualReferences,
      reference_set: filteredVisualReferences,
      mapTilesImageUrl: filteredVisualReferences.mapTilesImageUrl,
      aerialViewReferenceUrl: filteredVisualReferences.aerialViewReferenceUrl,
      streetViewReferenceUrls: filteredVisualReferences.streetViewReferenceUrls,
      solarApiLayoutImageUrl: filteredVisualReferences.solarApiLayoutImageUrl,
      visual_target: mapCenter,
      solar_model: solarModel,
      solar_layout_debug: solarLayoutDebug,
      solar_data_layers: solarDataLayerAssets,
      technicalRenderUrl: renderImageUrl,
      solarPanelRenderUrl: renderPreviewUrl,
    },
  })

  if (prospect?.id) {
    await supabase
      .from('prospects')
      .update({
        panel_count: solarModel.panelCount,
        system_kw: solarModel.systemSizeKw,
        yearly_kwh: solarModel.yearlyKwh,
        annual_savings: solarModel.yearlySavings,
        system_cost: solarModel.systemCost,
        federal_itc: solarModel.federalItc,
        payback_years: solarModel.estimatedPayback,
        satellite_url: roofImageUrl,
        render_url: renderImageUrl,
        render_preview_url: renderPreviewUrl,
        solar_quality: solarModel.quality,
        pipeline_stage: 'solar_fetched',
      })
      .eq('id', prospect.id)
  }

  return {
    roofImageUrl,
    renderImageUrl,
    renderPreviewUrl,
    panelLayerSvg,
    presentationRotationDegrees: getPresentationRotationDegrees(solarLayoutDebug),
    solarDataLayers: solarDataLayerAssets?.layers || [],
    solarRgbLayer,
    visualReferences: filteredVisualReferences,
    solarModel,
    mapCenter,
  }
}

export async function generateProposalPreview(
  supabase: AdminSupabase,
  job: WorkflowJob,
  roofAssets: RoofAssets,
) {
  await setWorkflowProgress(supabase, job, {
    step: 'Preparing black panel proposal reference',
    progressPercent: 70,
    buildStatus: 'image_generating',
  })

  const finalRenderBuffer = await buildSolarRgbProposalRender(roofAssets.roofImageUrl, roofAssets.panelLayerSvg)

  const renderPreviewUrl = await uploadLeadAsset({
    supabase,
    bucket: 'leads',
    slug: job.slug,
    fileName: 'deterministic_solar_reference.webp',
    body: finalRenderBuffer,
    contentType: 'image/webp',
  })

  await setWorkflowProgress(supabase, job, {
    step: 'Deterministic proposal image ready',
    progressPercent: 84,
    buildStatus: 'image_generated',
    receipt: {
      blackPanelReferenceImageUrl: roofAssets.renderPreviewUrl,
      cleanedPreviewImageUrl: renderPreviewUrl,
      render_source: 'deterministic_solar_rgb_plus_solar_api_panels',
    },
  })

  return { renderPreviewUrl, source: 'deterministic_solar_rgb_plus_solar_api_panels' as const }
}

async function buildSolarRgbProposalRender(roofImageUrl: string, panelLayerSvg: string) {
  const roofBuffer = await fetchImageBuffer(roofImageUrl)
  const metadata = await sharp(roofBuffer).metadata()
  const sourceWidth = metadata.width || PROPOSAL_RENDER_WIDTH
  const sourceHeight = metadata.height || PROPOSAL_RENDER_HEIGHT
  const scale = Math.min(PROPOSAL_RENDER_WIDTH / sourceWidth, PROPOSAL_RENDER_HEIGHT / sourceHeight)
  const renderedWidth = Math.round(sourceWidth * scale)
  const renderedHeight = Math.round(sourceHeight * scale)
  const left = Math.round((PROPOSAL_RENDER_WIDTH - renderedWidth) / 2)
  const top = Math.round((PROPOSAL_RENDER_HEIGHT - renderedHeight) / 2)
  const background = await sharp(roofBuffer)
    .resize(PROPOSAL_RENDER_WIDTH, PROPOSAL_RENDER_HEIGHT, { fit: 'cover', position: 'center' })
    .blur(18)
    .modulate({ brightness: 0.62, saturation: 0.72 })
    .linear(0.92, -8)
    .webp({ quality: 82, effort: 4 })
    .toBuffer()
  const foreground = await sharp(roofBuffer)
    .resize(renderedWidth, renderedHeight, { fit: 'fill' })
    .modulate({ brightness: 1.06, saturation: 0.9 })
    .linear(1.04, -3)
    .sharpen({ sigma: 0.6, m1: 0.45, m2: 1.2 })
    .webp({ quality: 94, effort: 5 })
    .toBuffer()

  return sharp(background)
    .composite([
      { input: foreground, left, top },
      { input: Buffer.from(panelLayerSvg), left: 0, top: 0 },
    ])
    .webp({ quality: 94, effort: 6 })
    .toBuffer()
}

async function fetchImageBuffer(url: string) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Image fetch failed: ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}
