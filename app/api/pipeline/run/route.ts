import { NextRequest, NextResponse } from "next/server";
import { getProspect } from "@/lib/supabase";
import { runPipeline } from "@/lib/pipeline";

export async function POST(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const prospect = await getProspect(id);
  if (!prospect) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await runPipeline(prospect);
  return NextResponse.json(result, { status: result.success ? 200 : 422 });
}
