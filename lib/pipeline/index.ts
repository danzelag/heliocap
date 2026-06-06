import { geocodeAddress, qualifyProspect } from "./geocode";
import { fetchSatelliteImage } from "./satellite";
import { fetchSolarInsights, calculateEconomics, generatePanelSvg } from "./solar";
import { fetchCurrentIncentiveRate } from "./outreach";
import { updateProspect, supabaseAdmin } from "../supabase";
import type { Prospect } from "../types";

export async function runPipeline(prospect: Prospect): Promise<{
  success: boolean;
  stages: Record<string, boolean>;
  error?: string;
}> {
  const stages: Record<string, boolean> = {};

  // step 1 — geocode
  const geo = await geocodeAddress(`${prospect.address}, ${prospect.city}, Ontario`);
  if (!geo.ok || !geo.data) {
    return { success: false, stages, error: geo.error };
  }
  stages.geocode = true;

  const { lat, lng } = geo.data;
  await updateProspect(prospect.id, { lat, lng, stage: "geocoded" });

  // step 1b — qualify
  const qual = qualifyProspect({ sqft: prospect.sqft, year_built: prospect.year_built, city: prospect.city });
  if (!qual.pass) {
    await updateProspect(prospect.id, { stage: "skipped" });
    return { success: false, stages, error: `Disqualified: ${qual.reason}` };
  }
  stages.qualify = true;
  await updateProspect(prospect.id, { stage: "qualified" });

  // step 2 — satellite imagery
  const sat = await fetchSatelliteImage(lat, lng, prospect.sqft ?? 50_000, prospect.id);
  if (!sat.ok || !sat.data) {
    return { success: false, stages, error: sat.error };
  }
  stages.satellite = true;
  await updateProspect(prospect.id, {
    satellite_image_url: sat.data.imageUrl,
    stage: "satellite_done",
  });

  // step 3 — solar insights
  const solar = await fetchSolarInsights(lat, lng);
  if (!solar.ok || !solar.data) {
    return { success: false, stages, error: solar.error };
  }
  stages.solar = true;

  const incentiveRate = await fetchCurrentIncentiveRate();
  const economics = calculateEconomics(
    solar.data,
    prospect.year_built ?? 2000,
    incentiveRate
  );

  // generate panel SVG and upload
  const zoom = (prospect.sqft ?? 50_000) >= 200_000 ? 17 : 18;
  const svg = generatePanelSvg(economics.deployedPanels, solar.data, lat, lng, zoom);
  const svgPath = `panels/${prospect.id}/overlay.svg`;

  await supabaseAdmin()
    .storage.from("openclaw")
    .upload(svgPath, Buffer.from(svg), { contentType: "image/svg+xml", upsert: true });

  const { data: svgPublic } = supabaseAdmin().storage
    .from("openclaw")
    .getPublicUrl(svgPath);

  await updateProspect(prospect.id, {
    panel_count: economics.panelCount,
    system_kw: Math.round(economics.systemKw * 10) / 10,
    yearly_kwh: Math.round(economics.yearlyKwh),
    yearly_savings: Math.round(economics.yearlySavings),
    savings_25yr: Math.round(economics.savings25yr),
    system_cost: Math.round(economics.systemCost),
    incentive_amount: Math.round(economics.incentiveAmount),
    panel_svg_url: svgPublic.publicUrl,
    stage: "solar_done",
  });

  stages.economics = true;

  // stamp microsite URL so the dashboard "View Site" link lights up
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (appUrl) {
    await updateProspect(prospect.id, {
      microsite_url: `${appUrl}/${prospect.slug}`,
      stage: "microsite_live",
    });
    stages.microsite = true;
  }

  return { success: true, stages };
}
