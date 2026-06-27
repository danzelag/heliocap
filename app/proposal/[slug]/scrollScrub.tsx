"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_HERO_SECONDS = 8;
const MAX_DURATION_INFLUENCE_SECONDS = 24;
const BASE_HERO_SVH = 220;
const DURATION_CURVE_SVH = 34;
const MIN_HERO_SVH = 280;
const MAX_HERO_SVH = 420;

export function getHeroScrollSvh(durationSeconds: number | null) {
  const measuredDuration =
    typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0
      ? durationSeconds
      : DEFAULT_HERO_SECONDS;
  const curvedDuration = Math.sqrt(Math.min(measuredDuration, MAX_DURATION_INFLUENCE_SECONDS));
  return Math.round(clampValue(BASE_HERO_SVH + curvedDuration * DURATION_CURVE_SVH, MIN_HERO_SVH, MAX_HERO_SVH));
}

export function ScrollScrubVideo({
  src,
  poster,
  progress,
  className,
  onDurationChange,
}: {
  src: string;
  poster?: string;
  progress: number;
  className: string;
  onDurationChange?: (duration: number) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const video = ref.current;
    if (!video || video.readyState < 1) return;
    const nextDuration = video.duration || 0;
    if (!Number.isFinite(nextDuration) || nextDuration <= 0) return;
    setDuration(nextDuration);
    onDurationChange?.(nextDuration);
  }, [onDurationChange, src]);

  useEffect(() => {
    const video = ref.current;
    if (!video || !duration || video.readyState < 1) return;

    const endFrame = Math.max(duration - 0.05, 0);
    const target = Math.min(endFrame, duration * clampValue(progress, 0, 1));
    if (Number.isFinite(target) && Math.abs(video.currentTime - target) > 0.08) {
      try {
        video.currentTime = target;
      } catch {
        // Remote videos can reject seeks until the browser has loaded seekable ranges.
      }
    }
    video.pause();
  }, [duration, progress]);

  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      muted
      playsInline
      preload="auto"
      onLoadedMetadata={(event) => {
        const nextDuration = event.currentTarget.duration || 0;
        setDuration(nextDuration);
        if (Number.isFinite(nextDuration) && nextDuration > 0) {
          onDurationChange?.(nextDuration);
        }
      }}
      className={`${className} pointer-events-none`}
    />
  );
}

export function useProposalScroll(heroId: string, layoutKey = 0) {
  const [pageProgress, setPageProgress] = useState(0);
  const [heroProgress, setHeroProgress] = useState(0);

  useEffect(() => {
    let ticking = false;
    function update() {
      ticking = false;
      const docTotal = Math.max(document.body.scrollHeight - window.innerHeight, 1);
      setPageProgress(clampValue(window.scrollY / docTotal, 0, 1));
      const hero = document.getElementById(heroId);
      if (!hero) return;
      const rect = hero.getBoundingClientRect();
      const total = Math.max(hero.offsetHeight - window.innerHeight, 1);
      setHeroProgress(clampValue(-rect.top / total, 0, 1));
    }
    function onScroll() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
    };
  }, [heroId, layoutKey]);

  return { pageProgress, heroProgress };
}

function clampValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
