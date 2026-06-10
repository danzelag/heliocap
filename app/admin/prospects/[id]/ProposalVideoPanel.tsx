"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Prospect } from "@/lib/types";

export function ProposalVideoPanel({ prospect }: { prospect: Prospect }) {
  const router = useRouter();
  const [videoUrl, setVideoUrl] = useState(prospect.video_url ?? "");
  const [thumbnailUrl, setThumbnailUrl] = useState(prospect.video_thumbnail_url ?? "");
  const [running, setRunning] = useState<"generate" | "attach" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const ready = Boolean(prospect.video_url);
  const poster = prospect.video_thumbnail_url ?? prospect.satellite_image_url ?? undefined;

  async function callVideoPipeline(payload: Record<string, string>, action: "generate" | "attach") {
    setRunning(action);
    setError("");
    setMessage("");

    const res = await fetch("/api/pipeline/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: prospect.id, ...payload }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Video step failed.");
      setRunning(null);
      return;
    }

    setMessage(action === "attach" ? "Flyover attached to the proposal." : "Flyover rendered and attached.");
    setRunning(null);
    router.refresh();
  }

  function attachManual() {
    if (!videoUrl.trim()) {
      setError("Paste a rendered video URL first.");
      return;
    }
    const payload: Record<string, string> = { video_url: videoUrl.trim() };
    if (thumbnailUrl.trim()) payload.thumbnail_url = thumbnailUrl.trim();
    void callVideoPipeline(payload, "attach");
  }

  return (
    <div className="border border-white/[0.07] bg-[#1a1a1f]">
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] p-4">
        <div className="min-w-0">
          <div className="text-sm font-medium text-stone-200">Cinematic flyover</div>
          <div className="mt-1 text-[11px] text-stone-500">
            {ready ? "Plays in the proposal hero" : "Gemini Omni render pending — hero uses the satellite still until attached"}
          </div>
        </div>
        <span
          className={`shrink-0 border px-2 py-1 text-[9.5px] uppercase tracking-[0.14em] ${
            ready ? "border-[#c08a4b]/50 text-[#d8a866]" : "border-white/12 text-stone-500"
          }`}
        >
          {ready ? "Ready" : "Queued"}
        </span>
      </div>

      <div className="p-4">
        <div className="relative aspect-video overflow-hidden border border-white/12 bg-[#070809]">
          {ready ? (
            <video
              key={prospect.video_url}
              src={prospect.video_url ?? undefined}
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
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[11px] uppercase tracking-[0.16em] text-stone-400">
                Flyover render queued
              </div>
            </>
          )}
        </div>

        <div className="mt-4 space-y-2">
          <input
            value={videoUrl}
            onChange={(event) => setVideoUrl(event.target.value)}
            placeholder="Rendered video URL (mp4 / CDN link)"
            className="w-full border border-white/12 bg-[#131316] px-3 py-2 font-mono text-xs text-stone-200 placeholder:text-stone-600 focus:border-[#c08a4b]/50 focus:outline-none"
          />
          <input
            value={thumbnailUrl}
            onChange={(event) => setThumbnailUrl(event.target.value)}
            placeholder="Thumbnail URL (optional)"
            className="w-full border border-white/12 bg-[#131316] px-3 py-2 font-mono text-xs text-stone-200 placeholder:text-stone-600 focus:border-[#c08a4b]/50 focus:outline-none"
          />
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={attachManual}
              disabled={running !== null}
              className="border border-[#c08a4b]/55 bg-[#c08a4b]/10 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-[#d8a866] transition hover:bg-[#c08a4b]/18 disabled:cursor-wait disabled:opacity-40"
            >
              {running === "attach" ? "Attaching..." : ready ? "Replace flyover" : "Attach flyover"}
            </button>
            <button
              type="button"
              onClick={() => void callVideoPipeline({}, "generate")}
              disabled={running !== null}
              className="border border-white/12 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-stone-300 transition hover:bg-[#212128] disabled:cursor-wait disabled:opacity-40"
            >
              {running === "generate" ? "Rendering..." : "Auto-render"}
            </button>
          </div>
        </div>

        {message ? <p className="mt-3 border border-[#86a06f]/35 bg-[#86a06f]/10 px-3 py-2 text-xs text-[#a4ba8d]">{message}</p> : null}
        {error ? <p className="mt-3 border border-[#c8704a]/35 bg-[#c8704a]/10 px-3 py-2 text-xs text-[#d99a82]">{error}</p> : null}
      </div>
    </div>
  );
}
