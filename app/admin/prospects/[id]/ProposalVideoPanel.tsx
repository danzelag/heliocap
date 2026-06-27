"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Prospect } from "@/lib/types";

type ProductVideo = "solar" | "ev";

type VideoFields = {
  url: "video_url" | "ev_video_url";
  thumbnail: "video_thumbnail_url" | "ev_video_thumbnail_url";
};

const FIELDS: Record<ProductVideo, VideoFields> = {
  solar: { url: "video_url", thumbnail: "video_thumbnail_url" },
  ev: { url: "ev_video_url", thumbnail: "ev_video_thumbnail_url" },
};

const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

type UploadResponse = {
  path?: string;
  url?: string;
  error?: string;
};

export function ProposalVideoPanel({
  prospect,
  product = "solar",
}: {
  prospect: Prospect;
  product?: ProductVideo;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const fields = FIELDS[product];
  const currentUrl = prospect[fields.url];
  const currentThumbnail = prospect[fields.thumbnail];
  const [videoUrl, setVideoUrl] = useState(currentUrl ?? "");
  const [thumbnailUrl, setThumbnailUrl] = useState(currentThumbnail ?? "");
  const [running, setRunning] = useState<"attach" | "upload" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const ready = Boolean(currentUrl);
  const poster = currentThumbnail ?? prospect.satellite_image_url ?? undefined;
  const title = product === "solar" ? "Solar video" : "EV charger video";
  const description =
    product === "solar"
      ? "Finished Google Omni solar hero video. Paste a URL or upload the final file."
      : "Commercial EV charger video. Used only when EV chargers are included.";

  async function saveVideo(nextVideoUrl: string, nextThumbnailUrl = thumbnailUrl) {
    if (!nextVideoUrl.trim()) {
      setError("Paste or upload a video URL first.");
      return;
    }

    setRunning("attach");
    setError("");
    setMessage("");

    const res = await fetch(`/api/prospects/${prospect.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        [fields.url]: nextVideoUrl.trim(),
        [fields.thumbnail]: nextThumbnailUrl.trim() || null,
        stage: prospect.stage === "microsite_live" ? prospect.stage : "video_done",
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Video save failed.");
      setRunning(null);
      return;
    }

    setMessage("Video saved.");
    setRunning(null);
    router.refresh();
  }

  async function uploadSelectedFile() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose an mp4, webm, or mov file first.");
      return;
    }
    if (!ALLOWED_VIDEO_TYPES.has(file.type)) {
      setError("Upload an mp4, webm, or mov video.");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError("Video must be 500MB or smaller.");
      return;
    }

    setRunning("upload");
    setError("");
    setMessage("");

    const uploadBody = new FormData();
    uploadBody.set("file", file);
    uploadBody.set("prospect_id", prospect.id);
    uploadBody.set("product", product);

    const uploadRes = await fetch("/api/uploads/video", {
      method: "POST",
      body: uploadBody,
    });
    const uploaded: UploadResponse = await uploadRes.json().catch(() => ({}));

    if (!uploadRes.ok || !uploaded.url) {
      setError(uploaded.error ?? "Upload failed.");
      setRunning(null);
      return;
    }

    setVideoUrl(uploaded.url);
    await saveVideo(uploaded.url, thumbnailUrl);
  }

  return (
    <div className="border border-white/[0.07] bg-[#1a1a1f]">
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] p-4">
        <div className="min-w-0">
          <div className="text-sm font-medium text-stone-200">{title}</div>
          <div className="mt-1 text-[11px] text-stone-500">{description}</div>
        </div>
        <span
          className={`shrink-0 border px-2 py-1 text-[9.5px] uppercase tracking-[0.14em] ${
            ready ? "border-[#c08a4b]/50 text-[#d8a866]" : "border-white/12 text-stone-500"
          }`}
        >
          {ready ? "Ready" : "Needed"}
        </span>
      </div>

      <div className="p-4">
        <div className="relative aspect-video overflow-hidden border border-white/12 bg-[#070809]">
          {currentUrl ? (
            <video
              key={currentUrl}
              src={currentUrl}
              poster={poster}
              controls
              preload="metadata"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <>
              {poster ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />
              ) : (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(192,138,75,0.12),transparent_30%),linear-gradient(135deg,#141414,#050505)]" />
              )}
              <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-[11px] uppercase tracking-[0.16em] text-stone-400">
                Manual video not attached
              </div>
            </>
          )}
        </div>

        <div className="mt-4 space-y-2">
          <input
            value={videoUrl}
            onChange={(event) => setVideoUrl(event.target.value)}
            placeholder="Video URL (mp4 / webm / CDN link)"
            className="w-full border border-white/12 bg-[#131316] px-3 py-2 font-mono text-xs text-stone-200 placeholder:text-stone-600 focus:border-[#c08a4b]/50 focus:outline-none"
          />
          <input
            value={thumbnailUrl}
            onChange={(event) => setThumbnailUrl(event.target.value)}
            placeholder="Thumbnail URL (optional)"
            className="w-full border border-white/12 bg-[#131316] px-3 py-2 font-mono text-xs text-stone-200 placeholder:text-stone-600 focus:border-[#c08a4b]/50 focus:outline-none"
          />
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,.mov"
            className="w-full border border-white/12 bg-[#131316] px-3 py-2 text-xs text-stone-300 file:mr-3 file:border-0 file:bg-[#c08a4b] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#131316]"
          />
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => void saveVideo(videoUrl)}
              disabled={running !== null}
              className="border border-[#c08a4b]/55 bg-[#c08a4b]/10 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-[#d8a866] transition hover:bg-[#c08a4b]/18 disabled:cursor-wait disabled:opacity-40"
            >
              {running === "attach" ? "Saving..." : ready ? "Replace URL" : "Attach URL"}
            </button>
            <button
              type="button"
              onClick={() => void uploadSelectedFile()}
              disabled={running !== null}
              className="border border-white/12 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-stone-300 transition hover:bg-[#212128] disabled:cursor-wait disabled:opacity-40"
            >
              {running === "upload" ? "Uploading..." : "Upload video"}
            </button>
          </div>
        </div>

        {message ? <p className="mt-3 border border-[#86a06f]/35 bg-[#86a06f]/10 px-3 py-2 text-xs text-[#a4ba8d]">{message}</p> : null}
        {error ? <p className="mt-3 border border-[#c8704a]/35 bg-[#c8704a]/10 px-3 py-2 text-xs text-[#d99a82]">{error}</p> : null}
      </div>
    </div>
  );
}
