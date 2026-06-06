import type { PipelineResult } from "../types";

export interface VideoResult {
  videoUrl: string;
  thumbnailUrl: string;
}

const MOTION_PRESETS = {
  solar: "aerial_pullback",
  second_touch: "orbit_clockwise",
  dramatic: "dolly_up",
} as const;

export async function generateHiggsfield(
  satelliteImageUrl: string,
  city: string,
  preset: keyof typeof MOTION_PRESETS = "solar"
): Promise<PipelineResult<{ rawVideoUrl: string }>> {
  const key = process.env.HIGGSFIELD_API_KEY;
  const motionPreset = MOTION_PRESETS[preset];

  const res = await fetch("https://api.higgsfield.ai/v1/generation/image-to-video", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_url: satelliteImageUrl,
      motion_preset: motionPreset,
      prompt: `cinematic aerial reveal of a large commercial building in ${city} ontario, golden hour lighting, smooth pullback camera, photorealistic, 4K`,
      duration: 12,
      aspect_ratio: "16:9",
    }),
  });

  if (!res.ok) {
    return {
      ok: false,
      error: `Higgsfield error ${res.status}: ${await res.text()}`,
    };
  }

  const json = await res.json();
  if (!json.video_url) {
    return { ok: false, error: "No video_url in Higgsfield response" };
  }

  return { ok: true, data: { rawVideoUrl: json.video_url } };
}

export function buildFfmpegCommand(opts: {
  flyoverPath: string;
  overlayPath: string;
  outputPath: string;
  ownerName: string;
  savings25yr: number;
  daysToDeadline: number;
}): string {
  const { flyoverPath, overlayPath, outputPath, ownerName, savings25yr, daysToDeadline } = opts;
  const savingsFormatted = `$${Math.round(savings25yr).toLocaleString()} in savings over 25 years`;
  const deadline = `${daysToDeadline} days to claim your incentive`;

  return [
    `ffmpeg -i "${flyoverPath}" -i "${overlayPath}"`,
    `-filter_complex "[0:v][1:v]concat=n=2:v=1[combined]; [combined]drawtext=text='${ownerName}':x=40:y=h-120:fontsize=32:fontcolor=white:box=1:boxcolor=black@0.5,drawtext=text='${savingsFormatted}':x=40:y=h-80:fontsize=26:fontcolor=#16a34a,drawtext=text='${deadline}':x=w-360:y=40:fontsize=22:fontcolor=#f97316[out]"`,
    `-map "[out]" -c:a copy "${outputPath}"`,
  ].join(" \\\n  ");
}

export async function uploadToBunny(
  localPath: string,
  storagePath: string
): Promise<PipelineResult<{ cdnUrl: string; thumbnailUrl: string }>> {
  const key = process.env.BUNNY_API_KEY;
  const zone = process.env.BUNNY_STORAGE_ZONE;
  const cdnBase = process.env.BUNNY_CDN_URL;

  const fs = await import("fs");
  const buffer = fs.readFileSync(localPath);

  const uploadRes = await fetch(
    `https://storage.bunnycdn.com/${zone}/${storagePath}`,
    {
      method: "PUT",
      headers: {
        AccessKey: key!,
        "Content-Type": "video/mp4",
      },
      body: buffer,
    }
  );

  if (!uploadRes.ok) {
    return { ok: false, error: `Bunny upload failed: ${uploadRes.status}` };
  }

  const cdnUrl = `${cdnBase}/${storagePath}`;
  const thumbnailUrl = cdnUrl.replace(".mp4", "-thumbnail.jpg");

  return { ok: true, data: { cdnUrl, thumbnailUrl } };
}
