import { NextRequest, NextResponse } from "next/server";
import { getProspect, updateProspect } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { id } = await req.json();
  const prospect = await getProspect(id);

  if (!prospect) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!prospect.panel_count) {
    return NextResponse.json({ error: "Run solar analysis first" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const micrositeUrl = `${appUrl}/${prospect.slug}`;

  const updated = await updateProspect(prospect.id, {
    microsite_url: micrositeUrl,
    stage: "microsite_live",
  });

  return NextResponse.json(updated);
}
