import { NextRequest, NextResponse } from "next/server";
import { calculateEconomics, fetchSolarInsights } from "@/lib/pipeline/solar";
import { buildPreviewMapImageUrl, fetchSolarDataLayers } from "@/lib/solarPreview";
import { getProspect } from "@/lib/supabase";
import { parseSolarDesignFromSvg, summarizeSolarDesign } from "@/lib/solarDesign";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const prospect = await getProspect(id);
  if (!prospect) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lat = prospect.lat;
  const lng = prospect.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === null || lng === null) {
    return NextResponse.json({ error: "Prospect is missing coordinates." }, { status: 400 });
  }

  const [solar, dataLayers, savedDesign] = await Promise.all([
    fetchSolarInsights(lat, lng),
    fetchSolarDataLayers({ lat, lng }),
    loadSavedDesign(prospect.panel_svg_url),
  ]);

  const economics = solar.ok && solar.data ? calculateEconomics(solar.data, prospect.year_built ?? 2000) : null;
  const designSummary = savedDesign ? summarizeSolarDesign(savedDesign) : null;
  const panelCount = designSummary?.panelCount ?? economics?.panelCount ?? prospect.panel_count ?? 0;
  const systemKw = designSummary?.systemKw ?? economics?.systemKw ?? prospect.system_kw ?? 0;
  const yearlyKwh = designSummary?.yearlyKwh ?? economics?.yearlyKwh ?? prospect.yearly_kwh ?? 0;
  const yearlySavings = designSummary?.yearlySavings ?? economics?.yearlySavings ?? prospect.yearly_savings ?? 0;

  return NextResponse.json({
    prospect: {
      id: prospect.id,
      companyName: prospect.company_name,
      address: prospect.address,
      city: prospect.city,
      coordinates: { lat, lng },
      sqft: prospect.sqft,
      yearBuilt: prospect.year_built,
      industry: prospect.industry,
      owner: {
        name: prospect.owner_name,
        title: prospect.owner_title,
        email: prospect.owner_email,
        mobile: prospect.owner_mobile,
      },
    },
    solar: {
      source: savedDesign ? "saved_custom_design" : solar.ok ? "google_solar_api" : "saved_summary",
      panelCount,
      systemKw: Math.round(systemKw * 10) / 10,
      yearlyKwh: Math.round(yearlyKwh),
      yearlySavings: Math.round(yearlySavings),
      savings25yr: Math.round(designSummary?.savings25yr ?? economics?.savings25yr ?? prospect.savings_25yr ?? 0),
      systemCost: Math.round(designSummary?.systemCost ?? economics?.systemCost ?? prospect.system_cost ?? 0),
      incentiveAmount: Math.round(designSummary?.incentiveAmount ?? economics?.incentiveAmount ?? prospect.incentive_amount ?? 0),
      panelCapacityWatts: solar.data?.panelCapacityWatts ?? 400,
      panelDimensionsMeters: {
        width: solar.data?.panelWidthMeters ?? null,
        height: solar.data?.panelHeightMeters ?? null,
      },
      maxArrayPanelsCount: solar.data?.maxArrayPanelsCount ?? null,
      maxArrayAreaMeters2: solar.data?.maxArrayAreaMeters2 ?? null,
      maxSunshineHoursPerYear: solar.data?.maxSunshineHoursPerYear ?? null,
      carbonOffsetFactorKgPerMwh: solar.data?.carbonOffsetFactorKgPerMwh ?? null,
    },
    roof: {
      wholeRoofStats: solar.data?.wholeRoofStats ?? null,
      buildingStats: solar.data?.buildingStats ?? null,
      segments:
        solar.data?.roofSegments.map((segment, index) => ({
          index,
          pitchDegrees: segment.pitchDegrees,
          azimuthDegrees: segment.azimuthDegrees,
          areaMeters2: segment.stats.areaMeters2,
          sunshineQuantiles: segment.stats.sunshineQuantiles,
          center: segment.center,
          boundingBox: segment.boundingBox ?? null,
          planeHeightAtCenterMeters: segment.planeHeightAtCenterMeters ?? null,
        })) ?? [],
      panelConfigs:
        solar.data?.solarPanelConfigs.map((config) => ({
          panelsCount: config.panelsCount,
          yearlyEnergyDcKwh: config.yearlyEnergyDcKwh,
          roofSegmentSummaries: config.roofSegmentSummaries,
        })) ?? [],
    },
    design: savedDesign,
    imagery: {
      satelliteUrl: buildPreviewMapImageUrl(lat, lng, 18),
      solarAnalysisUrl: `/api/solar/analysis-image?lat=${lat}&lng=${lng}&zoom=19&year_built=${prospect.year_built ?? 2000}`,
      savedPanelSvgUrl: prospect.panel_svg_url,
      layerImages: {
        rgb: `/api/solar/layer-image?lat=${lat}&lng=${lng}&layer=rgb`,
        mask: `/api/solar/layer-image?lat=${lat}&lng=${lng}&layer=mask`,
        annualFlux: `/api/solar/layer-image?lat=${lat}&lng=${lng}&layer=annual_flux`,
        monthlyFluxJune: `/api/solar/layer-image?lat=${lat}&lng=${lng}&layer=monthly_flux&month=6`,
        hourlyShadeJuneSolstice: `/api/solar/layer-image?lat=${lat}&lng=${lng}&layer=hourly_shade&month=6&day=21&hour=13`,
        dsm: `/api/solar/layer-image?lat=${lat}&lng=${lng}&layer=dsm`,
      },
      dataLayerAvailability: {
        dsm: Boolean(dataLayers.dsmUrl),
        rgb: Boolean(dataLayers.rgbUrl),
        mask: Boolean(dataLayers.maskUrl),
        annualFlux: Boolean(dataLayers.annualFluxUrl),
        monthlyFlux: Boolean(dataLayers.monthlyFluxUrl),
        hourlyShadeMonths: dataLayers.hourlyShadeUrls.length,
      },
      imageryQuality: dataLayers.imageryQuality ?? solar.data?.imageryQuality ?? null,
      imageryDate: dataLayers.imageryDate ?? solar.data?.imageryDate ?? null,
      imageryProcessedDate: dataLayers.imageryProcessedDate ?? solar.data?.imageryProcessedDate ?? null,
    },
    videoDirection: {
      objective: "Create a concise commercial rooftop solar flyover that starts from geographic context, moves into roof qualification, reveals the editable solar array, and ends on business value.",
      cameraBeats: [
        "Wide 3D approach from nearby road and industrial context.",
        "Tilt down to the roof with a clean target lock on the building footprint.",
        "Transition to top-down solar design with panel layout visible.",
        "Show annual flux and shade context as quick analytical overlays.",
        "End with system size, annual production, estimated savings, and call-to-action.",
      ],
      narrationFacts: [
        `${prospect.address}, ${prospect.city}`,
        `${Math.round(systemKw * 10) / 10} kW DC system`,
        `${Math.round(yearlyKwh).toLocaleString("en-CA")} kWh estimated annual production`,
        `${Math.round(yearlySavings).toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })} estimated year-one savings`,
      ],
      visualRules: [
        "Keep Google imagery attribution visible when map imagery is shown.",
        "Treat solar production and savings as estimates, not guarantees.",
        "Use the saved custom design if present; otherwise use Google Solar API panel placement.",
      ],
    },
  });
}

async function loadSavedDesign(panelSvgUrl: string | null) {
  if (!panelSvgUrl) return null;

  try {
    const res = await fetch(panelSvgUrl, { cache: "no-store" });
    if (!res.ok) return null;
    return parseSolarDesignFromSvg(await res.text());
  } catch {
    return null;
  }
}
