"use client";

import { useEffect, useRef, useState } from "react";

const CESIUM_VERSION = "1.142";
const CESIUM_SCRIPT = `https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VERSION}/Build/Cesium/Cesium.js`;
const CESIUM_CSS = `https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VERSION}/Build/Cesium/Widgets/widgets.css`;

type EarthSource = "loading" | "earth_capture" | "earth_live" | "google_maps_satellite_fallback";

type GoogleEarthTargetProps = {
  address: string;
  apiKey: string | null;
  fallbackImageUrl: string;
  lat: number;
  lng: number;
};

declare global {
  interface Window {
    Cesium?: CesiumGlobal;
    __openclawCesiumPromise?: Promise<CesiumGlobal>;
  }
}

type CesiumGlobal = {
  Viewer: new (container: Element, options: Record<string, unknown>) => CesiumViewer;
  Cesium3DTileset: new (options: Record<string, unknown>) => CesiumTileset;
  Cartesian3: {
    fromDegrees: (lng: number, lat: number, height?: number) => unknown;
  };
  Math: {
    toRadians: (degrees: number) => number;
  };
  Color: new (r: number, g: number, b: number, a: number) => unknown;
};

type CesiumViewer = {
  scene: {
    canvas: HTMLCanvasElement;
    globe: { show: boolean };
    primitives: { add: (primitive: CesiumTileset) => CesiumTileset };
    requestRender: () => void;
    backgroundColor: unknown;
    fxaa: boolean;
    postProcessStages: { fxaa: { enabled: boolean } };
    screenSpaceCameraController: { enableCollisionDetection: boolean };
  };
  camera: {
    setView: (options: Record<string, unknown>) => void;
  };
  resize: () => void;
  destroy: () => void;
  isDestroyed: () => boolean;
};

type CesiumTileset = {
  readyPromise?: Promise<unknown>;
};

export function GoogleEarthTarget({ address, apiKey, fallbackImageUrl, lat, lng }: GoogleEarthTargetProps) {
  const [source, setSource] = useState<EarthSource>(apiKey ? "loading" : "google_maps_satellite_fallback");
  const [captureUrl, setCaptureUrl] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(
    apiKey ? null : "Google Earth 3D is unavailable for this browser session. Showing Google Maps satellite fallback."
  );
  const [credits, setCredits] = useState("3D Tiles");
  const [viewerOpen, setViewerOpen] = useState(false);
  const embeddedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let viewer: CesiumViewer | null = null;
    const browserKey = apiKey ?? "";

    if (!browserKey || !embeddedRef.current) {
      setSource("google_maps_satellite_fallback");
      return undefined;
    }

    async function mount() {
      try {
        const Cesium = await loadCesium();
        if (cancelled || !embeddedRef.current) return;

        viewer = createViewer(Cesium, embeddedRef.current);
        await attachTileset(Cesium, viewer, browserKey, lat, lng);

        if (cancelled || !embeddedRef.current) return;

        const creditText = collectCredits(embeddedRef.current);
        if (creditText) {
          setCredits(creditText);
        }

        try {
          const dataUrl = viewer.scene.canvas.toDataURL("image/jpeg", 0.92);
          if (!cancelled) {
            setCaptureUrl(dataUrl);
            setSource("earth_capture");
            setWarning(null);
          }
        } catch {
          if (!cancelled) {
            setSource("earth_live");
            setWarning("Google Earth 3D rendered live, but the still capture was blocked. Keeping the live 3D target active.");
          }
        }
      } catch (error) {
        if (!cancelled) {
          setSource("google_maps_satellite_fallback");
          setWarning(
            error instanceof Error
              ? `Google Earth 3D did not render. Showing Google Maps satellite fallback. ${error.message}`
              : "Google Earth 3D did not render. Showing Google Maps satellite fallback."
          );
        }
      }
    }

    mount();

    return () => {
      cancelled = true;
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
      }
    };
  }, [apiKey, lat, lng]);

  const usesEarth = source === "earth_capture" || source === "earth_live";

  return (
    <>
      <div className="relative aspect-[16/10] min-h-[340px] overflow-hidden border border-white/[0.08] bg-black lg:min-h-[520px]">
        {source === "earth_capture" && captureUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={captureUrl} alt={`${address} Google Earth target`} className="h-full w-full object-cover" />
            <AttributionBadge text={credits} />
          </>
        ) : source === "google_maps_satellite_fallback" ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fallbackImageUrl} alt={`${address} Google Maps satellite fallback`} className="h-full w-full object-cover opacity-90" />
            <AttributionBadge text="Google Maps satellite" />
          </>
        ) : (
          <div ref={embeddedRef} className="absolute inset-0" />
        )}

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] bg-[length:52px_52px]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.12)_0%,rgba(0,0,0,0)_26%,rgba(0,0,0,0)_70%,rgba(0,0,0,.38)_100%)]" />
        <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 border border-[#d8a866]/85">
          <span className="absolute -left-1 -top-1 h-3.5 w-3.5 border-l border-t border-[#d8a866]" />
          <span className="absolute -right-1 -top-1 h-3.5 w-3.5 border-r border-t border-[#d8a866]" />
          <span className="absolute -bottom-1 -left-1 h-3.5 w-3.5 border-b border-l border-[#d8a866]" />
          <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 border-b border-r border-[#d8a866]" />
        </div>

        <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-2">
          <span className="border border-[#d8a866]/40 bg-black/72 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#d8a866]">
            {source === "earth_capture"
              ? "Earth capture"
              : source === "earth_live"
                ? "Earth live"
                : source === "loading"
                  ? "Earth loading"
                  : "Maps fallback"}
          </span>
          {usesEarth ? (
            <button
              type="button"
              onClick={() => setViewerOpen(true)}
              className="border border-white/12 bg-black/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-stone-200 transition hover:border-[#d8a866]/45 hover:text-[#d8a866]"
            >
              Open 3D inspect
            </button>
          ) : null}
        </div>
      </div>

      {warning ? (
        <p className="mt-3 border border-[#c08a4b]/25 bg-[#c08a4b]/10 px-3 py-2 text-xs leading-5 text-[#d8a866]">{warning}</p>
      ) : (
        <p className="mt-3 border border-white/[0.08] bg-[#111116] px-3 py-2 text-xs leading-5 text-stone-400">
          Earth-style photorealistic 3D target is active. Open the live inspector if you want to orbit the property before generating the proposal.
        </p>
      )}

      {viewerOpen && apiKey ? (
        <EarthInspectModal address={address} apiKey={apiKey} lat={lat} lng={lng} onClose={() => setViewerOpen(false)} />
      ) : null}
    </>
  );
}

function EarthInspectModal({
  address,
  apiKey,
  lat,
  lng,
  onClose,
}: {
  address: string;
  apiKey: string;
  lat: number;
  lng: number;
  onClose: () => void;
}) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let viewer: CesiumViewer | null = null;

    async function mount() {
      try {
        const Cesium = await loadCesium();
        if (cancelled || !viewerRef.current) return;
        viewer = createViewer(Cesium, viewerRef.current);
        await attachTileset(Cesium, viewer, apiKey, lat, lng);
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Google Earth 3D failed to load.");
        }
      }
    }

    mount();

    return () => {
      cancelled = true;
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
      }
    };
  }, [apiKey, lat, lng]);

  return (
    <div className="fixed inset-0 z-50 bg-black/82 backdrop-blur-sm">
      <div className="flex h-full flex-col px-4 py-4 sm:px-6 sm:py-6">
        <div className="mb-4 flex items-start justify-between gap-4 border border-white/[0.08] bg-[#141418] px-4 py-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#d8a866]">Google Earth 3D inspect</div>
            <div className="mt-1 text-sm text-stone-200">{address}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border border-white/12 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-stone-300 transition hover:border-[#d8a866]/45 hover:text-[#d8a866]"
          >
            Close
          </button>
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden border border-white/[0.08] bg-black">
          <div ref={viewerRef} className="absolute inset-0" />
          {error ? (
            <div className="absolute inset-x-6 top-6 border border-[#c08a4b]/25 bg-[#c08a4b]/10 px-4 py-3 text-sm text-[#d8a866]">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AttributionBadge({ text }: { text: string }) {
  return (
    <div className="absolute bottom-3 right-3 max-w-[52%] border border-white/[0.08] bg-black/72 px-2.5 py-1 font-mono text-[9px] leading-4 text-stone-300">
      {text || "Google"}
    </div>
  );
}

function createViewer(Cesium: CesiumGlobal, container: Element) {
  const viewer = new Cesium.Viewer(container, {
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    requestRenderMode: true,
    shouldAnimate: false,
  });

  viewer.scene.globe.show = false;
  viewer.scene.backgroundColor = new Cesium.Color(0.02, 0.02, 0.03, 1);
  viewer.scene.fxaa = true;
  viewer.scene.postProcessStages.fxaa.enabled = true;
  viewer.scene.screenSpaceCameraController.enableCollisionDetection = false;

  return viewer;
}

async function attachTileset(Cesium: CesiumGlobal, viewer: CesiumViewer, apiKey: string, lat: number, lng: number) {
  const tileset = viewer.scene.primitives.add(
    new Cesium.Cesium3DTileset({
      url: `https://tile.googleapis.com/v1/3dtiles/root.json?key=${encodeURIComponent(apiKey)}`,
      showCreditsOnScreen: true,
      maximumScreenSpaceError: 1.5,
      maximumCacheOverflowBytes: 256 * 1024 * 1024,
    })
  );

  if (tileset.readyPromise) {
    await tileset.readyPromise;
  }

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(lng, lat, 430),
    orientation: {
      heading: Cesium.Math.toRadians(28),
      pitch: Cesium.Math.toRadians(-58),
      roll: 0,
    },
  });

  viewer.resize();
  viewer.scene.requestRender();
  await wait(2400);
  viewer.scene.requestRender();
  await wait(450);
}

async function loadCesium() {
  if (window.Cesium) {
    return window.Cesium;
  }

  if (!window.__openclawCesiumPromise) {
    window.__openclawCesiumPromise = new Promise<CesiumGlobal>((resolve, reject) => {
      if (!document.querySelector(`link[href="${CESIUM_CSS}"]`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = CESIUM_CSS;
        document.head.appendChild(link);
      }

      const existing = document.querySelector<HTMLScriptElement>(`script[src="${CESIUM_SCRIPT}"]`);
      if (existing) {
        existing.addEventListener("load", () => {
          if (window.Cesium) resolve(window.Cesium);
        });
        existing.addEventListener("error", () => reject(new Error("Cesium script failed to load.")));
        return;
      }

      const script = document.createElement("script");
      script.src = CESIUM_SCRIPT;
      script.async = true;
      script.onload = () => {
        if (window.Cesium) {
          resolve(window.Cesium);
        } else {
          reject(new Error("Cesium did not expose a global runtime."));
        }
      };
      script.onerror = () => reject(new Error("Cesium script failed to load."));
      document.head.appendChild(script);
    });
  }

  return window.__openclawCesiumPromise;
}

function collectCredits(root: HTMLElement) {
  const nodes = Array.from(root.querySelectorAll(".cesium-credit-textContainer *, .cesium-credit-textContainer"));
  const values = nodes
    .map((node) => node.textContent?.trim() ?? "")
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return values || "Google Photorealistic 3D Tiles";
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
