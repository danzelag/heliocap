'use client'

import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'

type VisualTargetMapProps = {
  lat: number
  lng: number
  zoom: number
  onChange: (target: { lat: number; lng: number; zoom: number }) => void
}

declare global {
  interface Window {
    google?: typeof google
  }
}

export function VisualTargetMap({ lat, lng, zoom, onChange }: VisualTargetMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const onChangeRef = useRef(onChange)
  const [mapsReady, setMapsReady] = useState(() => (
    typeof window !== 'undefined' && Boolean(window.google?.maps)
  ))

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!mapsReady || !containerRef.current || mapRef.current) return

    const map = new window.google!.maps.Map(containerRef.current, {
      center: { lat, lng },
      zoom,
      mapTypeId: 'satellite',
      tilt: 0,
      heading: 0,
      clickableIcons: false,
      fullscreenControl: false,
      streetViewControl: false,
      mapTypeControl: true,
      zoomControl: true,
      rotateControl: false,
      scaleControl: true,
      gestureHandling: 'greedy',
    })

    map.addListener('idle', () => {
      const center = map.getCenter()
      if (!center) return
      onChangeRef.current({
        lat: center.lat(),
        lng: center.lng(),
        zoom: map.getZoom() || zoom,
      })
    })

    mapRef.current = map
  }, [lat, lng, mapsReady, zoom])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const center = map.getCenter()
    const centerChanged =
      !center ||
      Math.abs(center.lat() - lat) > 0.0000005 ||
      Math.abs(center.lng() - lng) > 0.0000005
    if (centerChanged) map.setCenter({ lat, lng })
    if (map.getZoom() !== zoom) map.setZoom(zoom)
  }, [lat, lng, zoom])

  return (
    <>
      <Script
        id="google-maps-visual-target"
        src={`https://maps.googleapis.com/maps/api/js?key=${(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '').trim()}&v=weekly`}
        strategy="afterInteractive"
        onLoad={() => setMapsReady(true)}
      />
      <div className="relative aspect-video overflow-hidden rounded-xl bg-stone-950">
        <div ref={containerRef} className="h-full w-full" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-300/90 bg-amber-300/10 shadow-[0_0_30px_rgba(252,211,77,0.35)]">
          <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-amber-200/90" />
          <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-amber-200/90" />
          <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-200" />
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-black/30 bg-black/60 px-3 py-1 text-xs text-white shadow">
          Drag map to center the target roof. Zoom to set framing.
        </div>
      </div>
    </>
  )
}
