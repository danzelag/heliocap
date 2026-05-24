import {
  buildSolarLayoutDebug,
  buildSolarModel,
  buildSolarPanelLayerSvg,
  buildStylizedSolarDesignPlateSvg,
  collectVisualReferences,
  fetchAndUploadSolarDataLayerAssets,
  fetchSolarInsights,
  getSolarRoofFocusCrop,
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
  buildRenderQualityFlags,
  selectProposalRenderSize,
  setWorkflowProgress,
} from '@/lib/proposal-workflow-shared'
import { buildSolarRgbProposalRender, buildStylizedSolarDesignPlateRender } from '@/lib/proposal-image-compose'

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
  const roofImageSourceUrl = solarRgbLayer.sourceUrl
  const roofImageUrl = solarRgbLayer.previewUrl
  const maskLayer = solarDataLayerAssets?.layers.find((layer) => layer.id === 'mask') || null
  const maskImageUrl = maskLayer?.originalUrl || maskLayer?.previewUrl || null

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
    visualReferences.solarApiLayoutImageUrl = prospect?.solar_reference_url || solarRgbLayer.previewUrl
  }

  const excludedReferenceUrls = getStringArray(prospect?.visual_reference_exclusions)
  const filteredVisualReferences = excludedReferenceUrls.length
    ? filterExcludedReferences(visualReferences, excludedReferenceUrls)
    : visualReferences

  const focusCrop = getSolarRoofFocusCrop({
    insights: solarInsights,
    model: solarModel,
    layer: {
      bounds: solarRgbLayer.bounds,
      previewWidth: solarRgbLayer.sourceWidth,
      previewHeight: solarRgbLayer.sourceHeight,
    },
  })
  const renderSize = selectProposalRenderSize(focusCrop, solarRgbLayer)
  const rasterPlacement = getSolarRgbRasterPlacement(solarRgbLayer, renderSize, focusCrop)
  const solarLayoutDebug = buildSolarLayoutDebug(solarInsights, solarModel)
  const presentationRotationDegrees = getPresentationRotationDegrees(solarLayoutDebug)
  const renderQualityFlags = buildRenderQualityFlags({
    panelCount: solarModel.panelCount,
    focusCrop,
    layer: solarRgbLayer,
    rotationDegrees: presentationRotationDegrees,
    hasMask: Boolean(maskImageUrl),
  })
  const panelLayerSvg = buildSolarPanelLayerSvg({
    insights: solarInsights,
    model: solarModel,
    width: renderSize.width,
    height: renderSize.height,
    rasterPlacement,
  })

  await setWorkflowProgress(supabase, job, {
    step: 'Black panel layout generated',
    progressPercent: 38,
    buildStatus: 'image_generating',
    receipt: {
      black_panel_layout: true,
      solarPanelCount: solarModel.panelCount,
      solar_layout_debug: solarLayoutDebug,
      solar_data_layers: solarDataLayerAssets,
      render_aspect: renderSize.aspect,
      render_size: renderSize,
      mask_source: maskImageUrl ? 'google_solar_mask' : 'none',
      render_quality: renderQualityFlags.length ? 'needs_review' : 'awaiting_review',
      render_quality_flags: renderQualityFlags,
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

  const solarRgbCompositeBuffer = await buildSolarRgbProposalRender({
    roofImageUrl: roofImageSourceUrl,
    panelLayerSvg,
    outputWidth: renderSize.width,
    outputHeight: renderSize.height,
    focusCrop,
    maskImageUrl,
    rotationDegrees: presentationRotationDegrees,
  })
  const solarRgbCompositeUrl = await uploadLeadAsset({
    supabase,
    bucket: 'leads',
    slug: job.slug,
    fileName: 'solar-rgb-panel-composite.webp',
    body: solarRgbCompositeBuffer,
    contentType: 'image/webp',
  })
  const designPlateSvg = buildStylizedSolarDesignPlateSvg({
    insights: solarInsights,
    model: solarModel,
    width: renderSize.width,
    height: renderSize.height,
    address: job.address,
  })
  const designPlateSvgUrl = await uploadLeadAsset({
    supabase,
    bucket: 'leads',
    slug: job.slug,
    fileName: 'solar-design-plate.svg',
    body: designPlateSvg,
    contentType: 'image/svg+xml',
  })
  const renderPreviewBuffer = await buildStylizedSolarDesignPlateRender(designPlateSvg)
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
      solarRgbCompositeRenderUrl: solarRgbCompositeUrl,
      solarDesignPlateSvgUrl: designPlateSvgUrl,
      solarPanelRenderUrl: renderPreviewUrl,
      cleanedPreviewImageUrl: renderPreviewUrl,
      roof_focus_crop: focusCrop,
      render_aspect: renderSize.aspect,
      render_size: renderSize,
      presentationRotationDegrees,
      mask_source: maskImageUrl ? 'google_solar_mask' : 'none',
      render_quality: renderQualityFlags.length ? 'needs_review' : 'awaiting_review',
      render_quality_flags: renderQualityFlags,
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
        satellite_url: solarRgbLayer.previewUrl,
        render_url: designPlateSvgUrl,
        render_preview_url: renderPreviewUrl,
        solar_quality: solarModel.quality,
        pipeline_stage: 'solar_fetched',
      })
      .eq('id', prospect.id)
  }

  return {
    roofImageUrl,
    roofImageSourceUrl,
    maskImageUrl,
    renderImageUrl: designPlateSvgUrl,
    renderPreviewUrl,
    panelLayerSvg,
    focusCrop,
    renderSize,
    presentationRotationDegrees,
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

  await setWorkflowProgress(supabase, job, {
    step: 'Stylized solar design plate ready',
    progressPercent: 84,
    buildStatus: 'image_generated',
    receipt: {
      blackPanelReferenceImageUrl: roofAssets.renderPreviewUrl,
      cleanedPreviewImageUrl: roofAssets.renderPreviewUrl,
      render_source: 'stylized_solar_design_plate',
    },
  })

  return { renderPreviewUrl: roofAssets.renderPreviewUrl, source: 'stylized_solar_design_plate' as const }
}
