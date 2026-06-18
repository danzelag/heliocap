import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { getProspect, supabaseAdmin } from "@/lib/supabase";

const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export async function POST(req: NextRequest) {
  const auth = requireAdminApi(req);
  if (auth) return auth;

  const body = await req.json().catch(() => null);
  const prospectId = stringValue(body, "prospect_id");
  const product = stringValue(body, "product") || "solar";
  const fileType = stringValue(body, "file_type");
  const fileSize = numberValue(body, "file_size");

  if (!prospectId) {
    return NextResponse.json({ error: "prospect_id is required." }, { status: 400 });
  }
  if (!ALLOWED_TYPES[fileType]) {
    return NextResponse.json({ error: "Upload an mp4, webm, or mov video." }, { status: 400 });
  }
  if (!fileSize || fileSize <= 0) {
    return NextResponse.json({ error: "Video size is required." }, { status: 400 });
  }
  if (fileSize > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: "Video must be 500MB or smaller." }, { status: 400 });
  }

  const prospect = await getProspect(prospectId);
  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found." }, { status: 404 });
  }

  const safeProduct = product === "ev" ? "ev" : "solar";
  const ext = ALLOWED_TYPES[fileType];
  const path = `proposal-videos/${prospectId}/${safeProduct}-${Date.now()}.${ext}`;
  const bucket = supabaseAdmin().storage.from("openclaw");
  const { data: signed, error } = await bucket.createSignedUploadUrl(path, {
    upsert: true,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data: publicFile } = bucket.getPublicUrl(path);
  return NextResponse.json({
    path,
    token: signed.token,
    publicUrl: publicFile.publicUrl,
  });
}

function stringValue(body: unknown, key: string): string {
  if (!body || typeof body !== "object" || !(key in body)) return "";
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(body: unknown, key: string): number | null {
  if (!body || typeof body !== "object" || !(key in body)) return null;
  const value = (body as Record<string, unknown>)[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
