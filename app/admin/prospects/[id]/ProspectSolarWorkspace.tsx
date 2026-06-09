"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SOLAR_DESIGN_HEIGHT,
  SOLAR_DESIGN_WIDTH,
  normalizeSolarDesign,
  summarizeSolarDesign,
  type SolarDesign,
  type SolarDesignPanel,
  type SolarDesignSummary,
} from "@/lib/solarDesign";
import type { Prospect } from "@/lib/types";
import { GoogleEarthTarget, type EarthTargetStatus } from "../new/GoogleEarthTarget";

type SolarDisplayModel = {
  panelsLabel: string;
  systemLabel: string;
  annualKwhLabel: string;
  usableRoofPctLabel: string;
  azimuth: string;
  shading: string;
  annualSavings: number;
  lifetimeSavings: number;
  incentive: number;
};

type ProspectSolarWorkspaceProps = {
  prospect: Prospect;
  model: SolarDisplayModel;
};

type BrowserMapsConfig = {
  apiKey: string;
  earthEnabled: boolean;
};

type PanelOverlayPoint = {
  id: number;
  x: number;
  y: number;
  azimuthDegrees: number;
  yearlyEnergyDcKwh: number;
  segmentIndex: number;
};

type RoofSegmentPreview = {
  index: number;
  areaMeters2: number;
  pitchDegrees: number;
  azimuthDegrees: number;
  sunshineHours: number;
  planeHeightMeters?: number;
};

type SolarPreview = {
  target: {
    imageUrl: string;
    source: string;
    warning: string | null;
  };
  solar: {
    ok: boolean;
    error?: string;
    panelCount?: number;
    systemKw?: number;
    yearlyKwh?: number;
    yearlySavings?: number;
    monthlyFluxUrl?: string | null;
    hourlyShadeUrls?: string[];
    dsmUrl?: string | null;
    annualFluxUrl?: string | null;
    rgbUrl?: string | null;
    maskUrl?: string | null;
    imageryQuality?: "HIGH" | "MEDIUM" | "BASE" | null;
    imageryDate?: { year: number; month: number; day: number } | null;
    imageryProcessedDate?: { year: number; month: number; day: number } | null;
    dataLayerWarning?: string | null;
    analysisImageUrl?: string;
    analysisSource?: "proposal_cluster_overlay" | "panel_cluster_fallback";
    maxArrayPanelsCount?: number;
    maxArrayAreaMeters2?: number;
    panelCapacityWatts?: number;
    panelWidthMeters?: number;
    panelHeightMeters?: number;
    panelLifetimeYears?: number;
    carbonOffsetFactorKgPerMwh?: number;
    wholeRoofAreaMeters2?: number | null;
    buildingAreaMeters2?: number | null;
    maxSunshineHoursPerYear?: number;
    averagePanelKwh?: number;
    topPanelKwh?: number;
    roofSegmentCount?: number;
    roofSegments?: RoofSegmentPreview[];
    solarPanelConfigs?: Array<{
      panelsCount: number;
      yearlyEnergyDcKwh: number;
      segmentCount: number;
    }>;
    panelOverlay?: PanelOverlayPoint[];
    analysisPanelOverlay?: PanelOverlayPoint[];
  };
};

type ViewMode = "satellite" | "design" | "rgb" | "annual" | "monthly" | "shade" | "mask" | "dsm" | "earth";
type OverlayMode = "panels" | "off";
type EditTool = "select" | "add" | "erase" | "pan";
type DesignSource = "saved" | "api" | "manual";

type SavedSolarDesignResponse = {
  design: SolarDesign | null;
  designUrl?: string;
  warning?: string;
  error?: string;
  summary?: SolarDesignSummary;
};

const CAD = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});
const NUMBER = new Intl.NumberFormat("en-CA");
const PANEL_WIDTH = 4.2;
const PANEL_HEIGHT = 7.6;
const ANALYSIS_PANEL_WIDTH = PANEL_WIDTH * 2;
const ANALYSIS_PANEL_HEIGHT = PANEL_HEIGHT * 2;

export function ProspectSolarWorkspace({ prospect, model }: ProspectSolarWorkspaceProps) {
  const [preview, setPreview] = useState<SolarPreview | null>(null);
  const [mapsConfig, setMapsConfig] = useState<BrowserMapsConfig | null>(null);
  const [earthStatus, setEarthStatus] = useState<EarthTargetStatus>({
    source: "loading",
    warning: null,
  });
  const [loading, setLoading] = useState(() => Number.isFinite(prospect.lat) && Number.isFinite(prospect.lng));
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("satellite");
  const [overlayMode, setOverlayMode] = useState<OverlayMode>("panels");
  const [imageScale, setImageScale] = useState(1);
  const [overlayScale, setOverlayScale] = useState(1);
  const [overlayRotate, setOverlayRotate] = useState(0);
  const [overlayOpacity, setOverlayOpacity] = useState(0.88);
  const [overlayX, setOverlayX] = useState(0);
  const [overlayY, setOverlayY] = useState(0);
  const [designPanels, setDesignPanels] = useState<SolarDesignPanel[]>([]);
  const [selectedPanelIds, setSelectedPanelIds] = useState<string[]>([]);
  const [editTool, setEditTool] = useState<EditTool>("select");
  const [panelWidth, setPanelWidth] = useState(ANALYSIS_PANEL_WIDTH);
  const [panelHeight, setPanelHeight] = useState(ANALYSIS_PANEL_HEIGHT);
  const [panelAzimuth, setPanelAzimuth] = useState(180);
  const [panelEnergy, setPanelEnergy] = useState(560);
  const [fluxMonth, setFluxMonth] = useState(6);
  const [shadeMonth, setShadeMonth] = useState(6);
  const [shadeDay, setShadeDay] = useState(21);
  const [shadeHour, setShadeHour] = useState(13);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [designSource, setDesignSource] = useState<DesignSource>(prospect.panel_svg_url ? "saved" : "api");
  const [designLoaded, setDesignLoaded] = useState(!prospect.panel_svg_url);
  const [designDirty, setDesignDirty] = useState(false);
  const [savingDesign, setSavingDesign] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [copyingContext, setCopyingContext] = useState(false);
  const [contextMessage, setContextMessage] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);
  const initializedFromPreviewRef = useRef(false);
  const panDragRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    overlayX: number;
    overlayY: number;
  } | null>(null);
  const panelDragRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    panelStarts: { id: string; x: number; y: number }[];
  } | null>(null);

  const lat = prospect.lat;
  const lng = prospect.lng;
  const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/maps/browser-config", {
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Maps config failed");
        setMapsConfig(json);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setMapsConfig({ apiKey: "", earthEnabled: false });
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!prospect.panel_svg_url) {
      return undefined;
    }

    const controller = new AbortController();

    fetch(`/api/prospects/${prospect.id}/solar-design`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = (await res.json()) as SavedSolarDesignResponse;
        if (!res.ok) throw new Error(json.error ?? "Saved solar design failed");
        const normalized = normalizeSolarDesign(json.design);
        if (!normalized) return;

        initializedFromPreviewRef.current = true;
        setDesignPanels(normalized.panels);
        setPanelWidth(normalized.panelWidth);
        setPanelHeight(normalized.panelHeight);
        setOverlayX(normalized.overlay.x);
        setOverlayY(normalized.overlay.y);
        setOverlayScale(normalized.overlay.scale);
        setOverlayRotate(normalized.overlay.rotate);
        setOverlayOpacity(normalized.overlay.opacity);
        setDesignSource("saved");
        setDesignDirty(false);
        setSaveMessage("Saved design loaded.");
      })
      .catch((nextError) => {
        if (!controller.signal.aborted) {
          setSaveMessage(nextError instanceof Error ? nextError.message : "Saved design unavailable.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setDesignLoaded(true);
      });

    return () => controller.abort();
  }, [prospect.id, prospect.panel_svg_url]);

  useEffect(() => {
    if (!hasLocation || lat === null || lng === null) {
      return undefined;
    }

    const controller = new AbortController();

    fetch(`/api/solar/preview?lat=${lat}&lng=${lng}&zoom=18&year_built=${prospect.year_built ?? 2000}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Solar preview failed");
        setPreview(json);
      })
      .catch((nextError) => {
        if (!controller.signal.aborted) {
          setError(nextError instanceof Error ? nextError.message : "Solar preview failed");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [hasLocation, lat, lng, prospect.year_built]);

  useEffect(() => {
    if (!designLoaded || initializedFromPreviewRef.current) return;

    const sourcePanels = preview?.solar.analysisPanelOverlay?.length
      ? preview.solar.analysisPanelOverlay
      : preview?.solar.panelOverlay?.length
        ? preview.solar.panelOverlay
        : [];

    if (!sourcePanels.length) return;

    const usingAnalysisPanels = Boolean(preview?.solar.analysisPanelOverlay?.length);
    const timer = window.setTimeout(() => {
      initializedFromPreviewRef.current = true;
      setDesignPanels(sourcePanels.map((panel) => panelOverlayToDesignPanel(panel)));
      setPanelWidth(usingAnalysisPanels ? ANALYSIS_PANEL_WIDTH : PANEL_WIDTH);
      setPanelHeight(usingAnalysisPanels ? ANALYSIS_PANEL_HEIGHT : PANEL_HEIGHT);
      setPanelEnergy(Math.round(preview?.solar.averagePanelKwh ?? sourcePanels[0]?.yearlyEnergyDcKwh ?? 560));
      setPanelAzimuth(Math.round(sourcePanels[0]?.azimuthDegrees ?? 180));
      setDesignSource("api");
      setDesignDirty(false);
      setSaveMessage("");
    }, 0);

    return () => window.clearTimeout(timer);
  }, [designLoaded, preview]);

  const staticMapUrl =
    lat !== null && lng !== null
      ? `/api/maps/static?lat=${lat}&lng=${lng}&zoom=18&size=640x400&maptype=satellite`
      : null;
  const targetImageUrl = preview?.target.imageUrl ?? prospect.satellite_image_url ?? staticMapUrl;
  const hasRoofOverlay = Boolean(preview?.solar.analysisImageUrl);
  const hasPanelOverlay = designPanels.length > 0;
  const showRoofOverlay = viewMode === "design" && hasRoofOverlay;
  const showPanelOverlay = overlayMode !== "off" && hasPanelOverlay && viewMode !== "earth";
  const layerImageUrl = layerUrlForMode(viewMode, lat, lng, fluxMonth, shadeMonth, shadeDay, shadeHour);
  const baseImageUrl = showRoofOverlay ? preview?.solar.analysisImageUrl ?? targetImageUrl : layerImageUrl ?? targetImageUrl;
  const canUseEarth = hasLocation && Boolean(mapsConfig?.earthEnabled && mapsConfig.apiKey && targetImageUrl);
  const selectedCount = selectedPanelIds.length;
  const designSummary = useMemo(() => summarizeSolarDesign({ panels: designPanels }), [designPanels]);
  const designStatusLabel = designDirty ? "Unsaved design" : designSource === "saved" ? "Saved design" : "Editable design";
  const availableLayers = {
    rgb: Boolean(preview?.solar.rgbUrl),
    mask: Boolean(preview?.solar.maskUrl),
    annual: Boolean(preview?.solar.annualFluxUrl),
    monthly: Boolean(preview?.solar.monthlyFluxUrl),
    shade: Boolean(preview?.solar.hourlyShadeUrls?.length),
    dsm: Boolean(preview?.solar.dsmUrl),
  };

  const sourceLabel = useMemo(() => {
    if (designPanels.length) return designStatusLabel;
    if (loading) return "Solar API loading";
    if (preview?.solar.ok) return "Solar API live";
    if (prospect.panel_count) return "Saved model";
    return "Awaiting model";
  }, [designPanels.length, designStatusLabel, loading, preview?.solar.ok, prospect.panel_count]);

  const markDesignDirty = useCallback(() => {
    setDesignDirty(true);
    setDesignSource((current) => (current === "saved" ? "saved" : "manual"));
    setSaveMessage("");
  }, []);

  const replaceDesignPanels = useCallback((updater: (current: SolarDesignPanel[]) => SolarDesignPanel[]) => {
    setDesignPanels((current) => updater(current));
    setDesignDirty(true);
    setDesignSource((current) => (current === "saved" ? "saved" : "manual"));
    setSaveMessage("");
  }, []);

  const addPanelAt = useCallback(
    (point: { x: number; y: number }) => {
      const panel: SolarDesignPanel = {
        id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        x: snapToGrid ? Math.round(point.x / 4) * 4 : point.x,
        y: snapToGrid ? Math.round(point.y / 4) * 4 : point.y,
        azimuthDegrees: panelAzimuth,
        yearlyEnergyDcKwh: panelEnergy,
        segmentIndex: -1,
        source: "manual",
      };

      replaceDesignPanels((current) => [...current, panel]);
      setSelectedPanelIds([panel.id]);
      setOverlayMode("panels");
    },
    [panelAzimuth, panelEnergy, replaceDesignPanels, snapToGrid]
  );

  const handleCanvasPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (viewMode === "earth") return;

      if (editTool === "add") {
        addPanelAt(eventToCanvasPoint(event.currentTarget, event));
        return;
      }

      if (editTool === "pan" && showPanelOverlay) {
        event.currentTarget.setPointerCapture(event.pointerId);
        panDragRef.current = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          overlayX,
          overlayY,
        };
        return;
      }

      if (editTool === "select") {
        setSelectedPanelIds([]);
      }
    },
    [addPanelAt, editTool, overlayX, overlayY, showPanelOverlay, viewMode]
  );

  const handlePanelPointerDown = useCallback(
    (event: React.PointerEvent<SVGRectElement>, panelId: string) => {
      event.stopPropagation();

      if (editTool === "erase") {
        replaceDesignPanels((current) => current.filter((panel) => panel.id !== panelId));
        setSelectedPanelIds((current) => current.filter((id) => id !== panelId));
        return;
      }

      if (editTool === "add" || editTool === "pan") return;

      const nextSelection = event.shiftKey
        ? selectedPanelIds.includes(panelId)
          ? selectedPanelIds
          : [...selectedPanelIds, panelId]
        : selectedPanelIds.includes(panelId)
          ? selectedPanelIds
          : [panelId];

      setSelectedPanelIds(nextSelection);
      const clicked = designPanels.find((panel) => panel.id === panelId);
      if (clicked) {
        setPanelAzimuth(Math.round(clicked.azimuthDegrees));
        setPanelEnergy(Math.round(clicked.yearlyEnergyDcKwh));
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      panelDragRef.current = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        panelStarts: designPanels
          .filter((panel) => nextSelection.includes(panel.id))
          .map((panel) => ({ id: panel.id, x: panel.x, y: panel.y })),
      };
    },
    [designPanels, editTool, replaceDesignPanels, selectedPanelIds]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const panelDrag = panelDragRef.current;
      if (panelDrag?.pointerId === event.pointerId) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const dx = ((event.clientX - panelDrag.clientX) / rect.width) * SOLAR_DESIGN_WIDTH / Math.max(overlayScale, 0.1);
        const dy = ((event.clientY - panelDrag.clientY) / rect.height) * SOLAR_DESIGN_HEIGHT / Math.max(overlayScale, 0.1);
        const starts = new Map(panelDrag.panelStarts.map((panel) => [panel.id, panel]));

        setDesignPanels((current) =>
          current.map((panel) => {
            const start = starts.get(panel.id);
            if (!start) return panel;

            const nextX = start.x + dx;
            const nextY = start.y + dy;
            return {
              ...panel,
              x: snapToGrid ? Math.round(nextX / 2) * 2 : nextX,
              y: snapToGrid ? Math.round(nextY / 2) * 2 : nextY,
            };
          })
        );
        setDesignDirty(true);
        setDesignSource((current) => (current === "saved" ? "saved" : "manual"));
        setSaveMessage("");
        return;
      }

      const panDrag = panDragRef.current;
      if (!panDrag || panDrag.pointerId !== event.pointerId) return;

      setOverlayX(panDrag.overlayX + event.clientX - panDrag.clientX);
      setOverlayY(panDrag.overlayY + event.clientY - panDrag.clientY);
      markDesignDirty();
    },
    [markDesignDirty, overlayScale, snapToGrid]
  );

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (panelDragRef.current?.pointerId === event.pointerId) {
      panelDragRef.current = null;
    }

    if (panDragRef.current?.pointerId === event.pointerId) {
      panDragRef.current = null;
    }
  }, []);

  function resetView() {
    setImageScale(1);
    setOverlayScale(1);
    setOverlayRotate(0);
    setOverlayOpacity(0.88);
    setOverlayX(0);
    setOverlayY(0);
    markDesignDirty();
  }

  function selectAllPanels() {
    setSelectedPanelIds(designPanels.map((panel) => panel.id));
    setOverlayMode("panels");
  }

  function deleteSelectedPanels() {
    if (!selectedPanelIds.length) return;
    const selected = new Set(selectedPanelIds);
    replaceDesignPanels((current) => current.filter((panel) => !selected.has(panel.id)));
    setSelectedPanelIds([]);
  }

  function duplicateSelectedPanels() {
    if (!selectedPanelIds.length) return;
    const selected = new Set(selectedPanelIds);
    const copies = designPanels
      .filter((panel) => selected.has(panel.id))
      .map((panel, index) => ({
        ...panel,
        id: `copy-${Date.now()}-${index}`,
        x: panel.x + 18,
        y: panel.y + 18,
        source: "manual" as const,
      }));

    replaceDesignPanels((current) => [...current, ...copies]);
    setSelectedPanelIds(copies.map((panel) => panel.id));
  }

  function applyPanelSettingsToSelection() {
    if (!selectedPanelIds.length) return;
    const selected = new Set(selectedPanelIds);
    replaceDesignPanels((current) =>
      current.map((panel) =>
        selected.has(panel.id)
          ? {
              ...panel,
              azimuthDegrees: panelAzimuth,
              yearlyEnergyDcKwh: panelEnergy,
              source: panel.source === "api" ? "manual" : panel.source,
            }
          : panel
      )
    );
  }

  function nudgeSelected(dx: number, dy: number) {
    if (!selectedPanelIds.length) return;
    const selected = new Set(selectedPanelIds);
    replaceDesignPanels((current) =>
      current.map((panel) => (selected.has(panel.id) ? { ...panel, x: panel.x + dx, y: panel.y + dy } : panel))
    );
  }

  function resetToApiDesign() {
    const sourcePanels = preview?.solar.analysisPanelOverlay?.length
      ? preview.solar.analysisPanelOverlay
      : preview?.solar.panelOverlay?.length
        ? preview.solar.panelOverlay
        : [];

    if (!sourcePanels.length) return;

    const usingAnalysisPanels = Boolean(preview?.solar.analysisPanelOverlay?.length);
    setDesignPanels(sourcePanels.map((panel) => panelOverlayToDesignPanel(panel)));
    setSelectedPanelIds([]);
    setPanelWidth(usingAnalysisPanels ? ANALYSIS_PANEL_WIDTH : PANEL_WIDTH);
    setPanelHeight(usingAnalysisPanels ? ANALYSIS_PANEL_HEIGHT : PANEL_HEIGHT);
    setOverlayX(0);
    setOverlayY(0);
    setOverlayScale(1);
    setOverlayRotate(0);
    setOverlayOpacity(0.88);
    setDesignSource("api");
    setDesignDirty(Boolean(prospect.panel_svg_url));
    setSaveMessage("");
    setOverlayMode("panels");
  }

  async function saveSolarDesign() {
    if (!designPanels.length || savingDesign) return;

    setSavingDesign(true);
    setSaveMessage("");

    const design: SolarDesign = {
      version: 1,
      width: SOLAR_DESIGN_WIDTH,
      height: SOLAR_DESIGN_HEIGHT,
      zoom: showRoofOverlay ? 19 : 18,
      panelWidth,
      panelHeight,
      panels: designPanels,
      overlay: {
        x: overlayX,
        y: overlayY,
        scale: overlayScale,
        rotate: overlayRotate,
        opacity: overlayOpacity,
      },
      source: designSource === "api" ? "google_solar_api" : "manual_workspace",
    };

    const res = await fetch(`/api/prospects/${prospect.id}/solar-design`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ design }),
    });

    const json = (await res.json()) as SavedSolarDesignResponse;
    if (!res.ok) {
      setSaveMessage(json.error ?? "Save failed.");
      setSavingDesign(false);
      return;
    }

    const normalized = normalizeSolarDesign(json.design);
    if (normalized) {
      setDesignPanels(normalized.panels);
      setPanelWidth(normalized.panelWidth);
      setPanelHeight(normalized.panelHeight);
    }

    setDesignSource("saved");
    setDesignDirty(false);
    setSavingDesign(false);
    setSaveMessage("Saved custom solar design.");
  }

  async function copyGeminiContext() {
    if (copyingContext) return;

    setCopyingContext(true);
    setContextMessage("");

    try {
      const res = await fetch(`/api/prospects/${prospect.id}/video-context`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Context export failed.");

      const text = JSON.stringify(json, null, 2);
      await navigator.clipboard.writeText(text);
      setContextMessage("Gemini context copied.");
    } catch (nextError) {
      setContextMessage(nextError instanceof Error ? nextError.message : "Context export failed.");
    } finally {
      setCopyingContext(false);
    }
  }

  return (
    <section className="border border-white/[0.07] bg-[#101014]">
      <div className="border-b border-white/[0.07] px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.22em] text-[#d8a866]">Solar design studio</div>
            <div className="mt-2 font-serif text-[26px] font-semibold leading-none text-[#ece9e3] sm:text-[32px]">
              3D + Solar API workspace
            </div>
            <div className="mt-2 truncate text-sm text-stone-400">{prospect.address || prospect.company_name}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ImageBadge label={sourceLabel} tone="blue" />
            <ImageBadge label={coordinateLabel(lat, lng)} tone="neutral" />
            {preview?.solar.imageryQuality ? <ImageBadge label={`${preview.solar.imageryQuality} imagery`} tone="gold" /> : null}
          </div>
        </div>
      </div>

      <div className="border-b border-white/[0.07] bg-[#141418] px-4 py-4 sm:px-5">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <ToolbarGroup title="View">
            <ModeButton active={viewMode === "satellite"} label="Satellite" onClick={() => setViewMode("satellite")} />
            <ModeButton active={viewMode === "design"} label="Design PNG" disabled={!hasRoofOverlay} onClick={() => setViewMode("design")} />
            <ModeButton active={viewMode === "earth"} label="3D" disabled={!canUseEarth} onClick={() => setViewMode("earth")} />
            <ModeButton active={viewMode === "rgb"} label="RGB" disabled={!availableLayers.rgb} onClick={() => setViewMode("rgb")} />
            <ModeButton active={viewMode === "annual"} label="Annual Flux" disabled={!availableLayers.annual} onClick={() => setViewMode("annual")} />
            <ModeButton active={viewMode === "monthly"} label="Monthly Flux" disabled={!availableLayers.monthly} onClick={() => setViewMode("monthly")} />
            <ModeButton active={viewMode === "shade"} label="Hourly Shade" disabled={!availableLayers.shade} onClick={() => setViewMode("shade")} />
            <ModeButton active={viewMode === "mask"} label="Mask" disabled={!availableLayers.mask} onClick={() => setViewMode("mask")} />
            <ModeButton active={viewMode === "dsm"} label="DSM" disabled={!availableLayers.dsm} onClick={() => setViewMode("dsm")} />
          </ToolbarGroup>

          <ToolbarGroup title="Actions">
            <ModeButton active={overlayMode === "panels"} label="Panels" disabled={!hasPanelOverlay || viewMode === "earth"} onClick={() => setOverlayMode("panels")} />
            <ModeButton active={overlayMode === "off"} label="Hide panels" disabled={viewMode === "earth"} onClick={() => setOverlayMode("off")} />
            <ModeButton active={editTool === "select"} label="Select" disabled={viewMode === "earth"} onClick={() => setEditTool("select")} />
            <ModeButton active={editTool === "add"} label="Add" disabled={viewMode === "earth"} onClick={() => setEditTool("add")} />
            <ModeButton active={editTool === "erase"} label="Erase" disabled={viewMode === "earth"} onClick={() => setEditTool("erase")} />
            <ModeButton active={editTool === "pan"} label="Pan" disabled={viewMode === "earth"} onClick={() => setEditTool("pan")} />
            <button
              type="button"
              onClick={saveSolarDesign}
              disabled={savingDesign || !designPanels.length}
              className="border border-[#6f8fa0]/45 bg-[#6f8fa0]/10 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-[#9fc4d8] transition hover:bg-[#6f8fa0]/18 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {savingDesign ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={copyGeminiContext}
              disabled={copyingContext}
              className="border border-[#d8a866]/45 bg-[#d8a866]/10 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-[#d8a866] transition hover:bg-[#d8a866]/18 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copyingContext ? "Copying..." : "Copy Gemini context"}
            </button>
          </ToolbarGroup>
        </div>

        {viewMode === "monthly" || viewMode === "shade" ? (
          <div className="mt-3 grid gap-3 border-t border-white/[0.07] pt-3 md:grid-cols-3">
            <RangeControl label="Month" min={1} max={12} step={1} value={viewMode === "monthly" ? fluxMonth : shadeMonth} onChange={viewMode === "monthly" ? setFluxMonth : setShadeMonth} displayValue={monthLabel(viewMode === "monthly" ? fluxMonth : shadeMonth)} />
            {viewMode === "shade" ? <RangeControl label="Day" min={1} max={31} step={1} value={shadeDay} onChange={setShadeDay} displayValue={String(shadeDay)} /> : null}
            {viewMode === "shade" ? <RangeControl label="Hour" min={0} max={23} step={1} value={shadeHour} onChange={setShadeHour} displayValue={`${shadeHour}:00`} /> : null}
          </div>
        ) : null}
      </div>

      <div className="p-4 sm:p-5">
        <div
          ref={canvasRef}
          className={`relative aspect-[4/3] min-h-[360px] overflow-hidden border border-white/[0.08] bg-black md:aspect-[16/10] xl:aspect-[16/9] xl:min-h-[560px] ${
            viewMode !== "earth" && editTool === "add"
              ? "cursor-crosshair"
              : showPanelOverlay && editTool === "pan"
                ? "cursor-move"
                : ""
          }`}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {viewMode === "earth" && canUseEarth ? (
            <GoogleEarthTarget
              address={prospect.address || prospect.company_name}
              apiKey={mapsConfig?.apiKey ?? null}
              fallbackImageUrl={targetImageUrl ?? ""}
              lat={lat ?? 0}
              lng={lng ?? 0}
              onStatusChange={setEarthStatus}
            />
          ) : baseImageUrl ? (
            <>
              <div
                className="absolute inset-0"
                style={{
                  transform: `scale(${imageScale})`,
                  transformOrigin: "center",
                }}
              >
                <Image
                  src={baseImageUrl}
                  alt={`Solar roof view for ${prospect.address}`}
                  fill
                  unoptimized
                  sizes="(min-width: 1280px) 1200px, 100vw"
                  className="object-cover"
                />
              </div>
              {showPanelOverlay ? (
                <div
                  className="absolute inset-0"
                  style={{
                    opacity: overlayOpacity,
                    transform: `translate(${overlayX}px, ${overlayY}px) scale(${overlayScale}) rotate(${overlayRotate}deg)`,
                    transformOrigin: "center",
                  }}
                >
                  <PanelPlacementOverlay
                    editTool={editTool}
                    panelHeight={panelHeight}
                    panels={designPanels}
                    panelWidth={panelWidth}
                    selectedIds={selectedPanelIds}
                    onPanelPointerDown={handlePanelPointerDown}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_25%,rgba(192,138,75,0.14),transparent_28%),linear-gradient(135deg,#101318,#070809)]" />
          )}

          {viewMode !== "earth" ? (
            <>
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:52px_52px]" />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.08)_0%,rgba(0,0,0,0)_24%,rgba(0,0,0,0)_70%,rgba(0,0,0,.34)_100%)]" />
              <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
                <ImageBadge label={viewLabel(viewMode)} tone="gold" />
                {designPanels.length ? <ImageBadge label={`${designPanels.length} panels`} tone="blue" /> : null}
                {selectedCount ? <ImageBadge label={`${selectedCount} selected`} tone="neutral" /> : null}
                {loading ? <ImageBadge label="Loading" tone="neutral" /> : null}
                {error ? <ImageBadge label="Preview fallback" tone="neutral" /> : null}
              </div>
            </>
          ) : (
            <div className="absolute bottom-3 left-3">
              <ImageBadge label={earthStatus.source.replaceAll("_", " ")} tone="gold" />
            </div>
          )}
        </div>

        <SolarDataReadout
          designSource={designSource}
          designSummary={designSummary}
          prospect={prospect}
          model={model}
          preview={preview}
          loading={loading}
          error={error}
        />

        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <ControlGroup title="Panel Editor">
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={selectAllPanels} disabled={!designPanels.length} className="border border-white/12 px-2 py-2 text-[10px] uppercase tracking-[0.12em] text-stone-300 transition hover:border-[#d8a866]/45 hover:text-[#d8a866] disabled:cursor-not-allowed disabled:opacity-40">
                Select all
              </button>
              <button type="button" onClick={duplicateSelectedPanels} disabled={!selectedCount} className="border border-white/12 px-2 py-2 text-[10px] uppercase tracking-[0.12em] text-stone-300 transition hover:border-[#d8a866]/45 hover:text-[#d8a866] disabled:cursor-not-allowed disabled:opacity-40">
                Duplicate
              </button>
              <button type="button" onClick={deleteSelectedPanels} disabled={!selectedCount} className="border border-[#c8704a]/45 bg-[#c8704a]/10 px-2 py-2 text-[10px] uppercase tracking-[0.12em] text-[#d99a82] transition hover:bg-[#c8704a]/18 disabled:cursor-not-allowed disabled:opacity-40">
                Delete
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <button type="button" onClick={() => nudgeSelected(0, -2)} disabled={!selectedCount} className="border border-white/12 px-2 py-2 text-[10px] uppercase tracking-[0.12em] text-stone-300 transition hover:border-[#d8a866]/45 hover:text-[#d8a866] disabled:cursor-not-allowed disabled:opacity-40">
                Up
              </button>
              <button type="button" onClick={() => nudgeSelected(-2, 0)} disabled={!selectedCount} className="border border-white/12 px-2 py-2 text-[10px] uppercase tracking-[0.12em] text-stone-300 transition hover:border-[#d8a866]/45 hover:text-[#d8a866] disabled:cursor-not-allowed disabled:opacity-40">
                Left
              </button>
              <button type="button" onClick={() => nudgeSelected(2, 0)} disabled={!selectedCount} className="border border-white/12 px-2 py-2 text-[10px] uppercase tracking-[0.12em] text-stone-300 transition hover:border-[#d8a866]/45 hover:text-[#d8a866] disabled:cursor-not-allowed disabled:opacity-40">
                Right
              </button>
              <button type="button" onClick={() => nudgeSelected(0, 2)} disabled={!selectedCount} className="border border-white/12 px-2 py-2 text-[10px] uppercase tracking-[0.12em] text-stone-300 transition hover:border-[#d8a866]/45 hover:text-[#d8a866] disabled:cursor-not-allowed disabled:opacity-40">
                Down
              </button>
            </div>
            <RangeControl label="Panel W" min={2} max={28} step={0.2} value={panelWidth} onChange={(value) => { setPanelWidth(value); markDesignDirty(); }} displayValue={`${panelWidth.toFixed(1)} px`} />
            <RangeControl label="Panel H" min={4} max={44} step={0.2} value={panelHeight} onChange={(value) => { setPanelHeight(value); markDesignDirty(); }} displayValue={`${panelHeight.toFixed(1)} px`} />
            <RangeControl label="Azimuth" min={0} max={359} step={1} value={panelAzimuth} onChange={setPanelAzimuth} displayValue={`${Math.round(panelAzimuth)} deg`} />
            <RangeControl label="Panel kWh" min={250} max={950} step={10} value={panelEnergy} onChange={setPanelEnergy} displayValue={`${Math.round(panelEnergy)} kWh`} />
            <button type="button" onClick={applyPanelSettingsToSelection} disabled={!selectedCount} className="w-full border border-white/12 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-stone-300 transition hover:border-[#d8a866]/45 hover:text-[#d8a866] disabled:cursor-not-allowed disabled:opacity-40">
              Apply to selected
            </button>
          </ControlGroup>

          <ControlGroup title="Canvas Controls">
            <RangeControl label="Image zoom" min={1} max={1.55} step={0.01} value={imageScale} onChange={setImageScale} displayValue={`${Math.round(imageScale * 100)}%`} />
            <RangeControl label="Panel opacity" min={0.1} max={1} step={0.01} value={overlayOpacity} onChange={(value) => { setOverlayOpacity(value); markDesignDirty(); }} displayValue={`${Math.round(overlayOpacity * 100)}%`} />
            <RangeControl label="Panel scale" min={0.82} max={1.24} step={0.01} value={overlayScale} onChange={(value) => { setOverlayScale(value); markDesignDirty(); }} displayValue={`${Math.round(overlayScale * 100)}%`} />
            <RangeControl label="Panel X" min={-160} max={160} step={1} value={overlayX} onChange={(value) => { setOverlayX(value); markDesignDirty(); }} displayValue={`${Math.round(overlayX)} px`} />
            <RangeControl label="Panel Y" min={-160} max={160} step={1} value={overlayY} onChange={(value) => { setOverlayY(value); markDesignDirty(); }} displayValue={`${Math.round(overlayY)} px`} />
            <RangeControl label="Panel rotate" min={-20} max={20} step={0.5} value={overlayRotate} onChange={(value) => { setOverlayRotate(value); markDesignDirty(); }} displayValue={`${overlayRotate.toFixed(1)} deg`} />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={resetView} className="border border-white/12 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-stone-300 transition hover:border-[#d8a866]/45 hover:text-[#d8a866]">
                Reset view
              </button>
              <button type="button" onClick={resetToApiDesign} disabled={!preview?.solar.panelOverlay?.length && !preview?.solar.analysisPanelOverlay?.length} className="border border-white/12 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-stone-300 transition hover:border-[#d8a866]/45 hover:text-[#d8a866] disabled:cursor-not-allowed disabled:opacity-40">
                Reset API
              </button>
            </div>
            <label className="flex items-center justify-between gap-3 border border-white/10 bg-[#101014] px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-stone-400">
              <span>Snap grid</span>
              <input type="checkbox" checked={snapToGrid} onChange={(event) => setSnapToGrid(event.currentTarget.checked)} className="accent-[#d8a866]" />
            </label>
          </ControlGroup>

          <ControlGroup title="Solar API Context">
            <div className="grid grid-cols-2 gap-px border border-white/[0.07] bg-white/[0.07]">
              <ContextCell label="Panel watts" value={preview?.solar.panelCapacityWatts ? `${preview.solar.panelCapacityWatts} W` : "Pending"} />
              <ContextCell label="Panel size" value={preview?.solar.panelWidthMeters && preview.solar.panelHeightMeters ? `${preview.solar.panelWidthMeters} x ${preview.solar.panelHeightMeters} m` : "Pending"} />
              <ContextCell label="Max array" value={preview?.solar.maxArrayPanelsCount ? NUMBER.format(preview.solar.maxArrayPanelsCount) : "Pending"} />
              <ContextCell label="Array area" value={preview?.solar.maxArrayAreaMeters2 ? `${NUMBER.format(preview.solar.maxArrayAreaMeters2)} m2` : "Pending"} />
              <ContextCell label="Whole roof" value={preview?.solar.wholeRoofAreaMeters2 ? `${NUMBER.format(preview.solar.wholeRoofAreaMeters2)} m2` : "Pending"} />
              <ContextCell label="CO2 factor" value={preview?.solar.carbonOffsetFactorKgPerMwh ? `${NUMBER.format(preview.solar.carbonOffsetFactorKgPerMwh)} kg/MWh` : "Pending"} />
            </div>
            <div className="grid grid-cols-3 gap-px overflow-hidden border border-white/[0.07] bg-white/[0.07]">
              <LayerState label="DSM" active={availableLayers.dsm} />
              <LayerState label="RGB" active={availableLayers.rgb} />
              <LayerState label="Mask" active={availableLayers.mask} />
              <LayerState label="Annual" active={availableLayers.annual} />
              <LayerState label="Monthly" active={availableLayers.monthly} />
              <LayerState label="Shade" active={availableLayers.shade} />
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500">
              {contextMessage || saveMessage || designStatusLabel}
            </div>
          </ControlGroup>
        </div>
      </div>
    </section>
  );
}

function PanelPlacementOverlay({
  editTool,
  panelHeight,
  panels,
  panelWidth,
  selectedIds,
  onPanelPointerDown,
}: {
  editTool: EditTool;
  panelHeight: number;
  panels: SolarDesignPanel[];
  panelWidth: number;
  selectedIds: string[];
  onPanelPointerDown: (event: React.PointerEvent<SVGRectElement>, panelId: string) => void;
}) {
  const selected = new Set(selectedIds);
  const cornerRadius = Math.max(0.45, panelWidth * 0.08);
  const strokeWidth = Math.max(0.35, panelWidth * 0.045);
  const cursor = editTool === "erase" ? "cursor-not-allowed" : editTool === "select" ? "cursor-grab" : "";

  return (
    <svg viewBox={`0 0 ${SOLAR_DESIGN_WIDTH} ${SOLAR_DESIGN_HEIGHT}`} preserveAspectRatio="xMidYMid slice" className={`h-full w-full ${cursor}`} aria-hidden="true">
      <defs>
        <filter id="panelGlow" x="-90%" y="-90%" width="280%" height="280%">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
      </defs>
      <g filter="url(#panelGlow)" opacity="0.5">
        {panels.map((panel) => (
          <rect
            key={`glow-${panel.id}`}
            x={panel.x - panelWidth / 2}
            y={panel.y - panelHeight / 2}
            width={panelWidth}
            height={panelHeight}
            fill="#5aa5c8"
            transform={`rotate(${panel.azimuthDegrees} ${panel.x} ${panel.y})`}
          />
        ))}
      </g>
      <g>
        {panels.map((panel) => {
          const energyScore = Math.max(0.34, Math.min(1, panel.yearlyEnergyDcKwh / 720));
          const isSelected = selected.has(panel.id);

          return (
            <rect
              key={panel.id}
              data-panel-id={panel.id}
              x={panel.x - panelWidth / 2}
              y={panel.y - panelHeight / 2}
              width={panelWidth}
              height={panelHeight}
              rx={cornerRadius}
              fill={isSelected ? `rgba(216, 168, 102, ${0.6 + energyScore * 0.22})` : `rgba(72, 143, 177, ${0.48 + energyScore * 0.34})`}
              stroke={isSelected ? "rgba(255, 240, 198, .95)" : "rgba(214, 240, 247, .78)"}
              strokeWidth={isSelected ? strokeWidth * 1.8 : strokeWidth}
              transform={`rotate(${panel.azimuthDegrees} ${panel.x} ${panel.y})`}
              onPointerDown={(event) => onPanelPointerDown(event, panel.id)}
            />
          );
        })}
      </g>
    </svg>
  );
}

function SolarDataReadout({
  designSource,
  designSummary,
  prospect,
  model,
  preview,
  loading,
  error,
}: {
  designSource: DesignSource;
  designSummary: SolarDesignSummary;
  prospect: Prospect;
  model: SolarDisplayModel;
  preview: SolarPreview | null;
  loading: boolean;
  error: string | null;
}) {
  const solar = preview?.solar;
  const hasEditableDesign = designSummary.panelCount > 0;
  const panels = hasEditableDesign ? designSummary.panelCount : solar?.panelCount ?? prospect.panel_count ?? 0;
  const systemKw = hasEditableDesign ? designSummary.systemKw : solar?.systemKw ?? prospect.system_kw ?? 0;
  const yearlyKwh = hasEditableDesign ? designSummary.yearlyKwh : solar?.yearlyKwh ?? prospect.yearly_kwh ?? 0;
  const yearlySavings = hasEditableDesign ? designSummary.yearlySavings : solar?.yearlySavings ?? prospect.yearly_savings ?? model.annualSavings;
  const roofSegments = solar?.roofSegments ?? [];
  const source = hasEditableDesign
    ? designSource === "saved"
      ? "Saved custom design"
      : "Editable solar design"
    : solar?.ok
      ? "Google Solar API"
      : prospect.panel_count
        ? "Saved prospect model"
        : "Pending";

  const metrics = [
    ["Panels", panels ? NUMBER.format(panels) : model.panelsLabel],
    ["System DC", systemKw ? `${NUMBER.format(Math.round(systemKw * 10) / 10)} kW` : model.systemLabel],
    ["Annual Output", yearlyKwh ? `${NUMBER.format(yearlyKwh)} kWh` : model.annualKwhLabel],
    ["Year 1 Savings", yearlySavings ? CAD.format(yearlySavings) : "Pending"],
    ["Max Sunshine", solar?.maxSunshineHoursPerYear ? `${NUMBER.format(solar.maxSunshineHoursPerYear)} h/yr` : "Pending"],
    ["Roof Segments", solar?.roofSegmentCount ? NUMBER.format(solar.roofSegmentCount) : "Pending"],
    ["Top Panel", solar?.topPanelKwh ? `${NUMBER.format(solar.topPanelKwh)} kWh` : "Pending"],
    ["Usable Roof", model.usableRoofPctLabel],
  ];

  return (
    <div className="mt-4 border border-white/[0.07] bg-white/[0.07]">
      <div className="grid gap-px sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value]) => (
          <div className="bg-[#141418] p-4" key={label}>
            <div className="text-[9px] uppercase tracking-[0.16em] text-stone-500">{label}</div>
            <div className="mt-1 font-mono text-xs text-[#ece9e3]">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-px border-t border-white/[0.07] bg-white/[0.07] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="bg-[#111116] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <ImageBadge label={source} tone="blue" />
            {loading ? <ImageBadge label="Loading" tone="neutral" /> : null}
            {error ? <ImageBadge label="Fallback" tone="neutral" /> : null}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <MiniFact label="Azimuth" value={model.azimuth} />
            <MiniFact label="Shading" value={model.shading} />
            <MiniFact label="Incentive" value={model.incentive ? CAD.format(model.incentive) : "Pending"} />
          </div>
          {solar?.dataLayerWarning || error ? (
            <p className="mt-3 text-xs leading-5 text-stone-400">{solar?.dataLayerWarning ?? error}</p>
          ) : null}
        </div>

        <div className="bg-[#111116] p-4">
          <div className="grid grid-cols-3 gap-px overflow-hidden border border-white/[0.07] bg-white/[0.07]">
            <LayerState label="Flux" active={Boolean(solar?.annualFluxUrl)} />
            <LayerState label="RGB" active={Boolean(solar?.rgbUrl)} />
            <LayerState label="Mask" active={Boolean(solar?.maskUrl)} />
          </div>
          <div className="mt-3 grid gap-px border border-white/[0.07] bg-white/[0.07]">
            {roofSegments.length ? (
              roofSegments.slice(0, 4).map((segment) => (
                <div className="grid grid-cols-4 gap-px bg-white/[0.07] text-xs" key={segment.index}>
                  <SegmentCell label={`S${segment.index + 1}`} value={`${segment.areaMeters2} m2`} />
                  <SegmentCell label="Pitch" value={`${segment.pitchDegrees} deg`} />
                  <SegmentCell label="Azimuth" value={`${segment.azimuthDegrees} deg`} />
                  <SegmentCell label="Sun" value={`${segment.sunshineHours} h`} />
                </div>
              ))
            ) : (
              <div className="bg-[#141418] p-3 text-xs text-stone-500">Roof segment data pending.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ControlGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-white/[0.07] bg-[#15151a] p-4">
      <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-stone-500">{title}</div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ToolbarGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 text-[9px] uppercase tracking-[0.18em] text-stone-500">{title}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function ModeButton({
  active,
  disabled,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`border px-3 py-2 text-[10px] uppercase tracking-[0.13em] transition ${
        active
          ? "border-[#c08a4b] bg-[#c08a4b] text-[#131316]"
          : "border-white/12 bg-[#101014] text-stone-400 hover:border-[#d8a866]/45 hover:text-[#d8a866]"
      } disabled:cursor-not-allowed disabled:border-white/[0.06] disabled:bg-[#101014] disabled:text-stone-700`}
    >
      {label}
    </button>
  );
}

function ContextCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#141418] p-3">
      <div className="text-[8px] uppercase tracking-[0.12em] text-stone-500">{label}</div>
      <div className="mt-1 font-mono text-[10px] text-stone-300">{value}</div>
    </div>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[9px] uppercase tracking-[0.14em] text-stone-500">{label}</span>
        <span className="font-mono text-[10px] text-stone-300">{displayValue}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="h-1.5 w-full accent-[#d8a866]"
      />
    </label>
  );
}

function ImageBadge({ label, tone }: { label: string; tone: "gold" | "blue" | "neutral" }) {
  const className =
    tone === "gold"
      ? "border-[#d8a866]/40 bg-black/72 text-[#d8a866]"
      : tone === "blue"
        ? "border-[#6f8fa0]/40 bg-[#6f8fa0]/10 text-[#9fc4d8]"
        : "border-white/12 bg-black/62 text-stone-300";

  return <span className={`border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${className}`}>{label}</span>;
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.14em] text-stone-500">{label}</div>
      <div className="mt-1 font-mono text-xs text-stone-200">{value}</div>
    </div>
  );
}

function LayerState({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="bg-[#141418] p-3">
      <div className="text-[9px] uppercase tracking-[0.14em] text-stone-500">{label}</div>
      <div className={`mt-1 font-mono text-xs ${active ? "text-[#9fb27b]" : "text-stone-600"}`}>{active ? "Returned" : "Pending"}</div>
    </div>
  );
}

function SegmentCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#141418] p-3">
      <div className="text-[8px] uppercase tracking-[0.12em] text-stone-500">{label}</div>
      <div className="mt-1 font-mono text-[10px] text-stone-300">{value}</div>
    </div>
  );
}

function panelOverlayToDesignPanel(panel: PanelOverlayPoint): SolarDesignPanel {
  return {
    id: `api-${panel.id}`,
    x: panel.x,
    y: panel.y,
    azimuthDegrees: panel.azimuthDegrees,
    yearlyEnergyDcKwh: panel.yearlyEnergyDcKwh,
    segmentIndex: panel.segmentIndex,
    source: "api",
  };
}

function eventToCanvasPoint(element: HTMLElement, event: React.PointerEvent) {
  const rect = element.getBoundingClientRect();
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * SOLAR_DESIGN_WIDTH, 0, SOLAR_DESIGN_WIDTH),
    y: clamp(((event.clientY - rect.top) / rect.height) * SOLAR_DESIGN_HEIGHT, 0, SOLAR_DESIGN_HEIGHT),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function layerUrlForMode(
  mode: ViewMode,
  lat: number | null,
  lng: number | null,
  fluxMonth: number,
  shadeMonth: number,
  shadeDay: number,
  shadeHour: number
) {
  if (lat === null || lng === null) return null;
  if (mode === "rgb") return `/api/solar/layer-image?lat=${lat}&lng=${lng}&layer=rgb`;
  if (mode === "mask") return `/api/solar/layer-image?lat=${lat}&lng=${lng}&layer=mask`;
  if (mode === "annual") return `/api/solar/layer-image?lat=${lat}&lng=${lng}&layer=annual_flux`;
  if (mode === "monthly") return `/api/solar/layer-image?lat=${lat}&lng=${lng}&layer=monthly_flux&month=${fluxMonth}`;
  if (mode === "shade") return `/api/solar/layer-image?lat=${lat}&lng=${lng}&layer=hourly_shade&month=${shadeMonth}&day=${shadeDay}&hour=${shadeHour}`;
  if (mode === "dsm") return `/api/solar/layer-image?lat=${lat}&lng=${lng}&layer=dsm`;
  return null;
}

function viewLabel(mode: ViewMode) {
  if (mode === "satellite") return "Satellite";
  if (mode === "design") return "Design PNG";
  if (mode === "rgb") return "Solar RGB";
  if (mode === "annual") return "Annual flux";
  if (mode === "monthly") return "Monthly flux";
  if (mode === "shade") return "Hourly shade";
  if (mode === "mask") return "Mask";
  if (mode === "dsm") return "DSM";
  return "3D";
}

function monthLabel(month: number) {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Math.max(0, Math.min(11, Math.round(month) - 1))];
}

function coordinateLabel(lat: number | null, lng: number | null) {
  if (lat !== null && lng !== null) {
    return `${Math.abs(lat).toFixed(4)} N · ${Math.abs(lng).toFixed(4)} W`;
  }
  return "No coordinates";
}
