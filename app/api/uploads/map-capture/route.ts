import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { getProspect, supabaseAdmin, updateProspect } from "@/lib/supabase";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(req: NextRequest) {
  const auth = requireAdminApi(req);
  if (auth) return auth;

  const body = await req.json().catch(() => null);
  const prospectId = stringValue(body, "prospect_id");
  const imageData = stringValue(body, "image_data");
  const source = stringValue(body, "source") || "map_capture";

  if (!prospectId) {
    return NextResponse.json({ error: "prospect_id is required." }, { status: 400 });
  }

  const prospect = await getProspect(prospectId);
  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found." }, { status: 404 });
  }

  const parsed = parseDataUrl(imageData);
  if (!parsed) {
    return NextResponse.json({ error: "image_data must be a base64 data URL." }, { status: 400 });
  }

  const ext = IMAGE_TYPES[parsed.contentType];
  if (!ext) {
    return NextResponse.json({ error: "Upload a JPEG, PNG, or WebP map capture." }, { status: 400 });
  }

  if (parsed.buffer.byteLength > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Map capture must be 12MB or smaller." }, { status: 400 });
  }

  const safeSource = source.replace(/[^a-z0-9_-]/gi, "-").toLowerCase().slice(0, 40) || "map-capture";
  const path = `map-captures/${prospect.id}/${safeSource}-${Date.now()}.${ext}`;
  const bucket = supabaseAdmin().storage.from("openclaw");
  const { error } = await bucket.upload(path, parsed.buffer, {
    contentType: parsed.contentType,
    upsert: true,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data } = bucket.getPublicUrl(path);
  const updated = await updateProspect(prospect.id, {
    satellite_image_url: data.publicUrl,
  });

  return NextResponse.json({
    publicUrl: data.publicUrl,
    prospect: updated,
  });
}

function stringValue(body: unknown, key: string): string {
  if (!body || typeof body !== "object" || !(key in body)) return "";
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function parseDataUrl(value: string) {
  const match = value.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;

  try {
    return {
      contentType: match[1].toLowerCase(),
      buffer: Buffer.from(match[2].replace(/\s/g, ""), "base64"),
    };
  } catch {
    return null;
  }
}
