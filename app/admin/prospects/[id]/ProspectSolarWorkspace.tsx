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
  const [dataOpen, setDataOpen] = useState(false);
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

  const statusMessage = contextMessage || saveMessage || designStatusLabel;

  return (
    <section className="flex flex-col border border-white/[0.07] bg-[#101014] xl:h-[calc(100vh-3rem)] xl:min-h-[620px]">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white/[0.07] px-4 py-2">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="shrink-0 text-[10px] uppercase tracking-[0.22em] text-[#d8a866]">Solar design studio</span>
          <span className="hidden truncate text-xs text-stone-500 md:inline">{prospect.address || prospect.company_name}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ImageBadge label={sourceLabel} tone="blue" />
          <ImageBadge label={coordinateLabel(lat, lng)} tone="neutral" />
          {preview?.solar.imageryQuality ? <ImageBadge label={`${preview.solar.imageryQuality} imagery`} tone="gold" /> : null}
        </div>
      </div>

      <div className="border-b border-white/[0.07] bg-[#141418] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
          <ToolGroup label="View">
            <ModeButton active={viewMode === "satellite"} label="Satellite" onClick={() => setViewMode("satellite")} />
            <ModeButton active={viewMode === "design"} label="Design" title="Design PNG" disabled={!hasRoofOverlay} onClick={() => setViewMode("design")} />
            <ModeButton active={viewMode === "earth"} label="3D" disabled={!canUseEarth} onClick={() => setViewMode("earth")} />
            <ModeButton active={viewMode === "rgb"} label="RGB" disabled={!availableLayers.rgb} onClick={() => setViewMode("rgb")} />
            <ModeButton active={viewMode === "annual"} label="Annual" title="Annual flux" disabled={!availableLayers.annual} onClick={() => setViewMode("annual")} />
            <ModeButton active={viewMode === "monthly"} label="Monthly" title="Monthly flux" disabled={!availableLayers.monthly} onClick={() => setViewMode("monthly")} />
            <ModeButton active={viewMode === "shade"} label="Shade" title="Hourly shade" disabled={!availableLayers.shade} onClick={() => setViewMode("shade")} />
            <ModeButton active={viewMode === "mask"} label="Mask" disabled={!availableLayers.mask} onClick={() => setViewMode("mask")} />
            <ModeButton active={viewMode === "dsm"} label="DSM" disabled={!availableLayers.dsm} onClick={() => setViewMode("dsm")} />
          </ToolGroup>

          <ToolGroup label="Tool">
            <ModeButton active={editTool === "select"} label="Select" disabled={viewMode === "earth"} onClick={() => setEditTool("select")} />
            <ModeButton active={editTool === "add"} label="Add" disabled={viewMode === "earth"} onClick={() => setEditTool("add")} />
            <ModeButton active={editTool === "erase"} label="Erase" disabled={viewMode === "earth"} onClick={() => setEditTool("erase")} />
            <ModeButton active={editTool === "pan"} label="Pan" disabled={viewMode === "earth"} onClick={() => setEditTool("pan")} />
          </ToolGroup>

          <ToolGroup label="Overlay">
            <ModeButton
              active={overlayMode === "panels"}
              label="Panels"
              title="Show or hide panel overlay"
              disabled={viewMode === "earth"}
              onClick={() => setOverlayMode(overlayMode === "panels" ? "off" : "panels")}
            />
            <ModeButton
              active={snapToGrid}
              label="Snap"
              title="Snap to grid"
              disabled={viewMode === "earth"}
              onClick={() => setSnapToGrid((current) => !current)}
            />
          </ToolGroup>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={copyGeminiContext}
              disabled={copyingContext}
              className="border border-[#d8a866]/45 bg-[#d8a866]/10 px-3 py-[7px] text-[10px] uppercase tracking-[0.14em] text-[#d8a866] transition hover:bg-[#d8a866]/18 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copyingContext ? "Copying..." : "Gemini context"}
            </button>
            <button
              type="button"
              onClick={saveSolarDesign}
              disabled={savingDesign || !designPanels.length}
              className="flex items-center gap-2 border border-[#c08a4b] bg-[#c08a4b] px-3.5 py-[7px] text-[10px] uppercase tracking-[0.14em] text-[#131316] transition hover:bg-[#d8a866] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {savingDesign ? "Saving..." : "Save design"}
              {designDirty && !savingDesign ? <span className="h-1.5 w-1.5 rounded-full bg-[#131316]/70" /> : null}
            </button>
          </div>
        </div>

        {viewMode === "monthly" || viewMode === "shade" ? (
          <div className="mt-2.5 flex flex-wrap items-end gap-x-6 gap-y-2 border-t border-white/[0.07] pt-2.5">
            <div className="w-full max-w-[220px]">
              <RangeControl label="Month" min={1} max={12} step={1} value={viewMode === "monthly" ? fluxMonth : shadeMonth} onChange={viewMode === "monthly" ? setFluxMonth : setShadeMonth} displayValue={monthLabel(viewMode === "monthly" ? fluxMonth : shadeMonth)} />
            </div>
            {viewMode === "shade" ? (
              <div className="w-full max-w-[220px]">
                <RangeControl label="Day" min={1} max={31} step={1} value={shadeDay} onChange={setShadeDay} displayValue={String(shadeDay)} />
              </div>
            ) : null}
            {viewMode === "shade" ? (
              <div className="w-full max-w-[220px]">
                <RangeControl label="Hour" min={0} max={23} step={1} value={shadeHour} onChange={setShadeHour} displayValue={`${shadeHour}:00`} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_288px]">
        <div className="flex min-h-0 min-w-0 items-center justify-center bg-[#0a0a0d] xl:border-r xl:border-white/[0.07]">
          <div
            ref={canvasRef}
            className={`relative aspect-[16/10] min-h-[300px] w-full overflow-hidden bg-black xl:max-h-full xl:min-h-0 ${
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
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:52px_52px]" />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.06)_0%,rgba(0,0,0,0)_18%,rgba(0,0,0,0)_76%,rgba(0,0,0,.28)_100%)]" />
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
        </div>

        <aside className="flex min-w-0 flex-col divide-y divide-white/[0.07] border-t border-white/[0.07] bg-[#121217] xl:overflow-y-auto xl:border-t-0">
          <InspectorSection title="Selection" meta={selectedCount ? `${selectedCount} selected` : "None"}>
            <div className="grid grid-cols-3 gap-1.5">
              <InspectorButton onClick={selectAllPanels} disabled={!designPanels.length}>
                All
              </InspectorButton>
              <InspectorButton onClick={duplicateSelectedPanels} disabled={!selectedCount}>
                Duplicate
              </InspectorButton>
              <InspectorButton tone="danger" onClick={deleteSelectedPanels} disabled={!selectedCount}>
                Delete
              </InspectorButton>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              <InspectorButton title="Nudge left" onClick={() => nudgeSelected(-2, 0)} disabled={!selectedCount}>
                {"<"}
              </InspectorButton>
              <InspectorButton title="Nudge up" onClick={() => nudgeSelected(0, -2)} disabled={!selectedCount}>
                ^
              </InspectorButton>
              <InspectorButton title="Nudge down" onClick={() => nudgeSelected(0, 2)} disabled={!selectedCount}>
                v
              </InspectorButton>
              <InspectorButton title="Nudge right" onClick={() => nudgeSelected(2, 0)} disabled={!selectedCount}>
                {">"}
              </InspectorButton>
            </div>
            <RangeControl label="Azimuth" min={0} max={359} step={1} value={panelAzimuth} onChange={setPanelAzimuth} displayValue={`${Math.round(panelAzimuth)} deg`} />
            <RangeControl label="Panel kWh" min={250} max={950} step={10} value={panelEnergy} onChange={setPanelEnergy} displayValue={`${Math.round(panelEnergy)} kWh`} />
            <InspectorButton full onClick={applyPanelSettingsToSelection} disabled={!selectedCount}>
              Apply to selected
            </InspectorButton>
          </InspectorSection>

          <InspectorSection title="Panel size">
            <div className="grid grid-cols-2 gap-3">
              <RangeControl label="Width" min={2} max={28} step={0.2} value={panelWidth} onChange={(value) => { setPanelWidth(value); markDesignDirty(); }} displayValue={`${panelWidth.toFixed(1)} px`} />
              <RangeControl label="Height" min={4} max={44} step={0.2} value={panelHeight} onChange={(value) => { setPanelHeight(value); markDesignDirty(); }} displayValue={`${panelHeight.toFixed(1)} px`} />
            </div>
          </InspectorSection>

          <InspectorSection title="Placement">
            <div className="grid grid-cols-2 gap-3">
              <RangeControl label="Opacity" min={0.1} max={1} step={0.01} value={overlayOpacity} onChange={(value) => { setOverlayOpacity(value); markDesignDirty(); }} displayValue={`${Math.round(overlayOpacity * 100)}%`} />
              <RangeControl label="Scale" min={0.82} max={1.24} step={0.01} value={overlayScale} onChange={(value) => { setOverlayScale(value); markDesignDirty(); }} displayValue={`${Math.round(overlayScale * 100)}%`} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <RangeControl label="Offset X" min={-160} max={160} step={1} value={overlayX} onChange={(value) => { setOverlayX(value); markDesignDirty(); }} displayValue={`${Math.round(overlayX)} px`} />
              <RangeControl label="Offset Y" min={-160} max={160} step={1} value={overlayY} onChange={(value) => { setOverlayY(value); markDesignDirty(); }} displayValue={`${Math.round(overlayY)} px`} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <RangeControl label="Rotate" min={-20} max={20} step={0.5} value={overlayRotate} onChange={(value) => { setOverlayRotate(value); markDesignDirty(); }} displayValue={`${overlayRotate.toFixed(1)} deg`} />
              <RangeControl label="Img zoom" min={1} max={1.55} step={0.01} value={imageScale} onChange={setImageScale} displayValue={`${Math.round(imageScale * 100)}%`} />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <InspectorButton onClick={resetView}>Reset view</InspectorButton>
              <InspectorButton
                onClick={resetToApiDesign}
                disabled={!preview?.solar.panelOverlay?.length && !preview?.solar.analysisPanelOverlay?.length}
                title="Reset to Solar API layout"
              >
                Reset API
              </InspectorButton>
            </div>
          </InspectorSection>
        </aside>
      </div>

      {dataOpen ? (
        <div className="shrink-0 xl:max-h-[44%] xl:overflow-y-auto">
          <SolarDataReadout
            designSource={designSource}
            designSummary={designSummary}
            prospect={prospect}
            model={model}
            preview={preview}
            loading={loading}
            error={error}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/[0.07] bg-[#141418] px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-300">
          {designSummary.panelCount
            ? `${NUMBER.format(designSummary.panelCount)} panels · ${NUMBER.format(Math.round(designSummary.systemKw * 10) / 10)} kW · ${NUMBER.format(Math.round(designSummary.yearlyKwh))} kWh/yr · ${CAD.format(Math.round(designSummary.yearlySavings))} yr 1`
            : sourceLabel}
        </span>
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-stone-600 lg:inline">{statusMessage}</span>
        <button
          type="button"
          onClick={() => setDataOpen((current) => !current)}
          className="ml-auto border border-white/12 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-stone-400 transition hover:border-[#d8a866]/45 hover:text-[#d8a866]"
        >
          Solar data {dataOpen ? "Close" : "Open"}
        </button>
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

  const layers: Array<[string, boolean]> = [
    ["RGB", Boolean(solar?.rgbUrl)],
    ["Mask", Boolean(solar?.maskUrl)],
    ["Annual", Boolean(solar?.annualFluxUrl)],
    ["Monthly", Boolean(solar?.monthlyFluxUrl)],
    ["Shade", Boolean(solar?.hourlyShadeUrls?.length)],
    ["DSM", Boolean(solar?.dsmUrl)],
  ];

  return (
    <div className="border-t border-white/[0.07]">
      <div className="grid grid-cols-2 gap-px bg-white/[0.07] sm:grid-cols-4 2xl:grid-cols-8">
        {metrics.map(([label, value]) => (
          <div className="bg-[#141418] px-3.5 py-3" key={label}>
            <div className="text-[9px] uppercase tracking-[0.16em] text-stone-500">{label}</div>
            <div className="mt-1 font-mono text-xs text-[#ece9e3]">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-px border-t border-white/[0.07] bg-white/[0.07] lg:grid-cols-3">
        <div className="bg-[#111116] p-4">
          <div className="mb-3 text-[9px] uppercase tracking-[0.2em] text-stone-500">Array model</div>
          <div className="flex flex-wrap items-center gap-2">
            <ImageBadge label={source} tone="blue" />
            {loading ? <ImageBadge label="Loading" tone="neutral" /> : null}
            {error ? <ImageBadge label="Fallback" tone="neutral" /> : null}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <MiniFact label="Azimuth" value={model.azimuth} />
            <MiniFact label="Shading" value={model.shading} />
            <MiniFact label="Incentive" value={model.incentive ? CAD.format(model.incentive) : "Pending"} />
          </div>
          {solar?.dataLayerWarning || error ? (
            <p className="mt-3 text-xs leading-5 text-stone-400">{solar?.dataLayerWarning ?? error}</p>
          ) : null}
        </div>

        <div className="bg-[#111116] p-4">
          <div className="mb-3 text-[9px] uppercase tracking-[0.2em] text-stone-500">Solar API layers</div>
          <div className="flex flex-wrap gap-1.5">
            {layers.map(([label, active]) => (
              <LayerState key={label} label={label} active={active} />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-px border border-white/[0.07] bg-white/[0.07]">
            <ContextCell label="Panel watts" value={solar?.panelCapacityWatts ? `${solar.panelCapacityWatts} W` : "Pending"} />
            <ContextCell label="Panel size" value={solar?.panelWidthMeters && solar.panelHeightMeters ? `${solar.panelWidthMeters} x ${solar.panelHeightMeters} m` : "Pending"} />
            <ContextCell label="Max array" value={solar?.maxArrayPanelsCount ? NUMBER.format(solar.maxArrayPanelsCount) : "Pending"} />
            <ContextCell label="Array area" value={solar?.maxArrayAreaMeters2 ? `${NUMBER.format(solar.maxArrayAreaMeters2)} m2` : "Pending"} />
            <ContextCell label="Whole roof" value={solar?.wholeRoofAreaMeters2 ? `${NUMBER.format(solar.wholeRoofAreaMeters2)} m2` : "Pending"} />
            <ContextCell label="CO2 factor" value={solar?.carbonOffsetFactorKgPerMwh ? `${NUMBER.format(solar.carbonOffsetFactorKgPerMwh)} kg/MWh` : "Pending"} />
          </div>
        </div>

        <div className="bg-[#111116] p-4">
          <div className="mb-3 text-[9px] uppercase tracking-[0.2em] text-stone-500">Roof segments</div>
          {roofSegments.length ? (
            <div className="border border-white/[0.07]">
              <div className="grid grid-cols-[44px_1fr_1fr_1fr_1fr] gap-2 border-b border-white/[0.07] bg-[#141418] px-3 py-2 text-[8px] uppercase tracking-[0.12em] text-stone-500">
                <span>Seg</span>
                <span>Area</span>
                <span>Pitch</span>
                <span>Azimuth</span>
                <span>Sun</span>
              </div>
              {roofSegments.slice(0, 4).map((segment) => (
                <div className="grid grid-cols-[44px_1fr_1fr_1fr_1fr] gap-2 border-b border-white/[0.07] px-3 py-2 font-mono text-[10px] text-stone-300 last:border-b-0" key={segment.index}>
                  <span className="text-[#d8a866]">S{segment.index + 1}</span>
                  <span>{segment.areaMeters2} m2</span>
                  <span>{segment.pitchDegrees} deg</span>
                  <span>{segment.azimuthDegrees} deg</span>
                  <span>{segment.sunshineHours} h</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-white/[0.07] bg-[#141418] p-3 text-xs text-stone-500">Roof segment data pending.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function InspectorSection({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="px-4 py-3.5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="text-[9px] uppercase tracking-[0.2em] text-stone-500">{title}</span>
        {meta ? <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#d8a866]">{meta}</span> : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function InspectorButton({
  children,
  onClick,
  disabled,
  tone = "neutral",
  title,
  full,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "danger";
  title?: string;
  full?: boolean;
}) {
  const toneClass =
    tone === "danger"
      ? "border-[#c8704a]/45 bg-[#c8704a]/10 text-[#d99a82] hover:bg-[#c8704a]/18"
      : "border-white/12 text-stone-300 hover:border-[#d8a866]/45 hover:text-[#d8a866]";

  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`border px-2 py-[7px] text-[10px] uppercase tracking-[0.1em] transition disabled:cursor-not-allowed disabled:opacity-40 ${toneClass} ${full ? "w-full" : ""}`}
    >
      {children}
    </button>
  );
}

function ToolGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-[9px] uppercase tracking-[0.18em] text-stone-600 lg:inline">{label}</span>
      <div className="flex flex-wrap gap-px border border-white/12 bg-white/[0.08] p-px">{children}</div>
    </div>
  );
}

function ModeButton({
  active,
  disabled,
  label,
  title,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title ?? label}
      onClick={onClick}
      className={`px-2.5 py-[6px] text-[10px] uppercase tracking-[0.12em] transition ${
        active
          ? "bg-[#c08a4b] text-[#131316]"
          : "bg-[#101014] text-stone-400 hover:bg-[#16161b] hover:text-[#d8a866]"
      } disabled:cursor-not-allowed disabled:bg-[#101014] disabled:text-stone-700`}
    >
      {label}
    </button>
  );
}

function ContextCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#141418] px-3 py-2.5">
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
      <span className="mb-1.5 flex items-center justify-between gap-3">
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
    <span
      className={`border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] ${
        active ? "border-[#9fb27b]/40 bg-[#9fb27b]/10 text-[#9fb27b]" : "border-white/[0.08] bg-[#141418] text-stone-600"
      }`}
      title={active ? `${label} layer returned` : `${label} layer pending`}
    >
      {label}
    </span>
  );
}

function normalizeAzimuthToOrientation(azimuth: number): 0 | 90 {
  const a = ((azimuth % 360) + 360) % 360;
  return (a >= 45 && a < 135) || (a >= 225 && a < 315) ? 90 : 0;
}

function panelOverlayToDesignPanel(panel: PanelOverlayPoint): SolarDesignPanel {
  return {
    id: `api-${panel.id}`,
    x: panel.x,
    y: panel.y,
    azimuthDegrees: normalizeAzimuthToOrientation(panel.azimuthDegrees),
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
