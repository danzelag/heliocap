import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { buildProposalUrl, getProposalStage } from "@/lib/proposals";
import { fetchSatelliteImage } from "@/lib/pipeline/satellite";
import { getProspectsByIds, listProposals, updateProspect } from "@/lib/supabase";
import type { Prospect } from "@/lib/types";

export async function GET(req: NextRequest) {
  const auth = requireAdminApi(req);
  if (auth) return auth;

  const proposals = await listProposals(150);
  return NextResponse.json(proposals);
}

export async function POST(req: NextRequest) {
  const auth = requireAdminApi(req);
  if (auth) return auth;

  const body = await req.json();
  const ids = Array.isArray(body.ids) ? body.ids.filter((value: unknown): value is string => typeof value === "string") : [];

  if (!ids.length) {
    return NextResponse.json({ error: "Select at least one prospect" }, { status: 400 });
  }

  const prospects = await getProspectsByIds(ids);
  if (!prospects.length) {
    return NextResponse.json({ error: "No prospects found" }, { status: 404 });
  }

  const eligible = prospects.filter((prospect) => !["dead", "skipped"].includes(prospect.stage) && validateForPublish(prospect).length === 0);
  const blocked = prospects.length - eligible.length;
  if (!eligible.length) {
    const reasons = prospects.flatMap(validateForPublish);
    return NextResponse.json(
      { error: reasons[0] ?? "Selected prospects are blocked from proposal publishing" },
      { status: 400 }
    );
  }

  const created = await Promise.all(
    eligible.map(async (prospect) => {
      const updates: Partial<Prospect> = {
        microsite_url: buildProposalUrl(prospect.slug),
        stage: getProposalStage(prospect),
      };

      // the microsite hero needs the building visual; backfill it on publish
      if (!prospect.satellite_image_url && prospect.lat != null && prospect.lng != null) {
        const sat = await fetchSatelliteImage(prospect.lat, prospect.lng, prospect.sqft ?? 50_000, prospect.id);
        if (sat.ok && sat.data) {
          updates.satellite_image_url = sat.data.imageUrl;
        }
      }

      return updateProspect(prospect.id, updates);
    })
  );

  return NextResponse.json({
    count: created.filter(Boolean).length,
    blocked,
    proposals: created.filter((prospect): prospect is NonNullable<typeof prospect> => Boolean(prospect)),
  });
}

function validateForPublish(prospect: Prospect) {
  const errors: string[] = [];
  if (["dead", "skipped"].includes(prospect.stage)) errors.push("Selected prospects are blocked from proposal publishing.");
  if (prospect.proposal_type === "commercial" && !prospect.company_name) errors.push("Company name is required.");
  if (prospect.proposal_type === "residential" && !prospect.contact_name && !prospect.owner_name) {
    errors.push("Homeowner name is required.");
  }
  if (prospect.include_solar && !prospect.video_url) errors.push("Solar video is required before publishing.");
  if (prospect.proposal_type === "commercial" && prospect.include_ev && !prospect.ev_video_url) {
    errors.push("EV video is required before publishing a commercial EV section.");
  }
  return errors;
}
