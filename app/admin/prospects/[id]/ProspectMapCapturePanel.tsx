"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Prospect } from "@/lib/types";
import { GoogleEarthTarget, type EarthCapture } from "../new/GoogleEarthTarget";

type BrowserMapsConfig = {
  apiKey: string;
  earthEnabled: boolean;
};

type UploadResponse = {
  publicUrl?: string;
  error?: string;
};

export function ProspectMapCapturePanel({ prospect }: { prospect: Prospect }) {
  const router = useRouter();
  const [mapsConfig, setMapsConfig] = useState<BrowserMapsConfig | null>(null);
  const [state, setState] = useState<"idle" | "saving">("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const hasLocation = Number.isFinite(prospect.lat) && Number.isFinite(prospect.lng) && prospect.lat !== null && prospect.lng !== null;
  const staticMapUrl = hasLocation
    ? `/api/maps/static?lat=${prospect.lat}&lng=${prospect.lng}&zoom=19&size=1280x720&maptype=satellite`
    : "";
  const previewUrl = prospect.satellite_image_url ?? staticMapUrl;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/maps/browser-config", { signal: controller.signal })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Maps config failed.");
        setMapsConfig(json);
      })
      .catch((nextError) => {
        if (!controller.signal.aborted) {
          setMapsConfig({ apiKey: "", earthEnabled: false });
          setError(nextError instanceof Error ? nextError.message : "Maps config failed.");
        }
      });

    return () => controller.abort();
  }, []);

  async function saveCapture(capture: EarthCapture) {
    await uploadDataUrl(capture.dataUrl, capture.source);
  }

  async function saveStaticMap() {
    if (!staticMapUrl) return;

    setState("saving");
    setMessage("");
    setError("");

    try {
      const res = await fetch(staticMapUrl, { cache: "no-store" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Static map failed: ${res.status}`);
      }
      const dataUrl = await blobToDataUrl(await res.blob());
      await uploadDataUrl(dataUrl, "static_satellite");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Map capture failed.");
      setState("idle");
    }
  }

  async function uploadDataUrl(dataUrl: string, source: string) {
    setState("saving");
    setMessage("");
    setError("");

    const res = await fetch("/api/uploads/map-capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prospect_id: prospect.id,
        image_data: dataUrl,
        source,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as UploadResponse;
    if (!res.ok || !json.publicUrl) {
      setError(json.error ?? "Map image save failed.");
      setState("idle");
      return;
    }

    setMessage("Map image saved to this prospect.");
    setState("idle");
    router.refresh();
  }

  return (
    <div className="border border-white/[0.07] bg-[#1a1a1f]">
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] p-4">
        <div className="min-w-0">
          <div className="text-sm font-medium text-stone-200">Map image for Gemini</div>
          <div className="mt-1 text-[11px] leading-5 text-stone-500">
            Rotate the 3D view, save the image, then use it as the visual input for Gemini Omni.
          </div>
        </div>
        <span className="shrink-0 border border-[#6f8fa0]/40 bg-[#6f8fa0]/10 px-2 py-1 text-[9.5px] uppercase tracking-[0.14em] text-[#9fc4d8]">
          {mapsConfig?.earthEnabled ? "3D ready" : "Static"}
        </span>
      </div>

      <div className="p-4">
        <div className="relative aspect-video overflow-hidden border border-white/12 bg-[#070809]">
          {hasLocation && mapsConfig?.earthEnabled && mapsConfig.apiKey ? (
            <GoogleEarthTarget
              address={prospect.address || prospect.company_name || prospect.contact_name || "Proposal address"}
              apiKey={mapsConfig.apiKey}
              captureBusy={state === "saving"}
              captureLabel="Save image"
              fallbackImageUrl={previewUrl}
              lat={prospect.lat ?? 0}
              lng={prospect.lng ?? 0}
              onCapture={(capture) => void saveCapture(capture)}
            />
          ) : previewUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute bottom-3 left-3 border border-[#d8a866]/40 bg-black/72 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#d8a866]">
                Static satellite
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs uppercase tracking-[0.16em] text-stone-500">
              Add coordinates before capturing a map image.
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void saveStaticMap()}
            disabled={!staticMapUrl || state === "saving"}
            className="border border-white/12 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-stone-300 transition hover:bg-[#212128] disabled:cursor-wait disabled:opacity-40"
          >
            {state === "saving" ? "Saving..." : "Save static map"}
          </button>
          {prospect.satellite_image_url ? (
            <a
              href={prospect.satellite_image_url}
              target="_blank"
              rel="noreferrer"
              className="border border-[#c08a4b]/45 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-[#d8a866] transition hover:bg-[#c08a4b]/10"
            >
              Open saved image
            </a>
          ) : null}
        </div>

        {message ? <p className="mt-3 border border-[#86a06f]/35 bg-[#86a06f]/10 px-3 py-2 text-xs text-[#a4ba8d]">{message}</p> : null}
        {error ? <p className="mt-3 border border-[#c8704a]/35 bg-[#c8704a]/10 px-3 py-2 text-xs leading-5 text-[#d99a82]">{error}</p> : null}
      </div>
    </div>
  );
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read map image."));
    reader.readAsDataURL(blob);
  });
}
