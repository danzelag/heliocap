import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  const prospectId = stringValue(form.get("prospect_id"));
  const product = stringValue(form.get("product")) || "solar";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Video file is required." }, { status: 400 });
  }
  if (!prospectId) {
    return NextResponse.json({ error: "prospect_id is required." }, { status: 400 });
  }
  if (!ALLOWED_TYPES[file.type]) {
    return NextResponse.json({ error: "Upload an mp4, webm, or mov video." }, { status: 400 });
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: "Video must be 500MB or smaller." }, { status: 400 });
  }

  const ext = ALLOWED_TYPES[file.type];
  const safeProduct = product === "ev" ? "ev" : "solar";
  const path = `proposal-videos/${prospectId}/${safeProduct}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabaseAdmin().storage.from("openclaw").upload(path, buffer, {
    contentType: file.type,
    upsert: true,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data } = supabaseAdmin().storage.from("openclaw").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, path });
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}
