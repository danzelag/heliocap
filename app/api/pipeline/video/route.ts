import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { getProspect, updateProspect } from "@/lib/supabase";
import { generateProposalVideo } from "@/lib/pipeline/video";
import type { ProspectStage } from "@/lib/types";

export async function POST(req: NextRequest) {
  const auth = requireAdminApi(req);
  if (auth) return auth;

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const prospect = await getProspect(id);
  if (!prospect) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // manual attach path: operator pastes a video rendered elsewhere
  const manualVideoUrl = stringOrNull(body.video_url);
  if (manualVideoUrl) {
    if (!isHttpUrl(manualVideoUrl)) {
      return NextResponse.json({ error: "video_url must be an http(s) URL." }, { status: 400 });
    }
    const thumbnail = stringOrNull(body.thumbnail_url);
    if (thumbnail && !isHttpUrl(thumbnail)) {
      return NextResponse.json({ error: "thumbnail_url must be an http(s) URL." }, { status: 400 });
    }

    const updated = await updateProspect(prospect.id, {
      video_url: manualVideoUrl,
      video_thumbnail_url: thumbnail ?? prospect.video_thumbnail_url,
      stage: nextStageAfterVideo(prospect.stage),
    });
    return NextResponse.json({ prospect: updated, source: "manual" });
  }

  // auto-generate path: requires a configured provider (Gemini Omni pending)
  const video = await generateProposalVideo(prospect);
  if (!video.ok || !video.data) {
    return NextResponse.json({ error: video.error }, { status: 501 });
  }

  const updated = await updateProspect(prospect.id, {
    video_url: video.data.videoUrl,
    video_thumbnail_url: video.data.thumbnailUrl,
    stage: nextStageAfterVideo(prospect.stage),
  });
  return NextResponse.json({ prospect: updated, source: "provider" });
}

function nextStageAfterVideo(stage: ProspectStage): ProspectStage {
  const promotable: ProspectStage[] = ["sourced", "geocoded", "qualified", "satellite_done", "solar_done"];
  return promotable.includes(stage) ? "video_done" : stage;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
