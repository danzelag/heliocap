import { NextRequest, NextResponse } from "next/server";
import { getProspectsByIds } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const ids = Array.isArray(body.ids) ? body.ids.filter((value: unknown): value is string => typeof value === "string") : [];

  if (!ids.length) {
    return NextResponse.json({ error: "Select at least one prospect" }, { status: 400 });
  }

  const prospects = await getProspectsByIds(ids);
  const ready = prospects.filter((prospect) => prospect.owner_email && !["dead", "skipped"].includes(prospect.stage));
  const missingEmail = prospects.filter((prospect) => !prospect.owner_email);
  const blocked = prospects.filter((prospect) => ["dead", "skipped"].includes(prospect.stage));

  return NextResponse.json({
    checked: prospects.length,
    ready: ready.length,
    missingEmail: missingEmail.length,
    blocked: blocked.length,
  });
}
