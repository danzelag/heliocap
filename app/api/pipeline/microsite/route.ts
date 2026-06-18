import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { getProspect, updateProspect } from "@/lib/supabase";
import { buildProposalUrl } from "@/lib/proposals";

export async function POST(req: NextRequest) {
  const auth = requireAdminApi(req);
  if (auth) return auth;

  const { id } = await req.json();
  const prospect = await getProspect(id);

  if (!prospect) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (prospect.include_solar && !prospect.panel_count) {
    return NextResponse.json({ error: "Run solar analysis first" }, { status: 400 });
  }
  if (prospect.include_solar && !prospect.video_url) {
    return NextResponse.json({ error: "Attach the solar video before generating the microsite." }, { status: 400 });
  }
  if (prospect.proposal_type === "commercial" && prospect.include_ev && !prospect.ev_video_url) {
    return NextResponse.json({ error: "Attach the EV video before generating the microsite." }, { status: 400 });
  }

  const updated = await updateProspect(prospect.id, {
    microsite_url: buildProposalUrl(prospect.slug),
    stage: "microsite_live",
  });

  return NextResponse.json(updated);
}
