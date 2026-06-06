import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, listProspects } from "@/lib/supabase";
import type { Prospect } from "@/lib/types";

export async function GET(req: NextRequest) {
  const stage = req.nextUrl.searchParams.get("stage") ?? undefined;
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "50");
  const prospects = await listProspects(stage, limit);
  return NextResponse.json(prospects);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const slug = generateSlug(body.company_name, body.city);

  const { data, error } = await supabaseAdmin()
    .from("prospects")
    .insert({
      ...body,
      slug,
      stage: "sourced",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}

function generateSlug(companyName: string, city: string): string {
  const base = `${companyName}-${city}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}
