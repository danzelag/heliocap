'use client'

import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'
import { Camera, Loader2, RotateCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

type StreetViewCaptureProps = {
  lat: number
  lng: number
  disabled?: boolean
  onCapture: (capture: {
    pano: string
    lat: number | null
    lng: number | null
    heading: number
    pitch: number
    fov: number
  }) => void
}

declare global {
  interface Window {
    google?: typeof google
  }
}

export function StreetViewCapture({ lat, lng, disabled, onCapture }: StreetViewCaptureProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null)
  const onCaptureRef = useRef(onCapture)
  const [mapsReady, setMapsReady] = useState(() => (
    typeof window !== 'undefined' && Boolean(window.google?.maps)
  ))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [captureState, setCaptureState] = useState({
    pano: '',
    lat: null as number | null,
    lng: null as number | null,
    heading: 0,
    pitch: 0,
    fov: 70,
  })

  useEffect(() => {
    onCaptureRef.current = onCapture
  }, [onCapture])

  useEffect(() => {
    if (!mapsReady || !containerRef.current) return

    let cancelled = false
    setLoading(true)
    setError(null)

    const service = new window.google!.maps.StreetViewService()
    service.getPanorama(
      {
        location: { lat, lng },
        radius: 90,
        source: window.google!.maps.StreetViewSource.OUTDOOR,
      },
      (data, status) => {
        if (cancelled) return
        if (status !== window.google!.maps.StreetViewStatus.OK || !data?.location?.pano) {
          setError('Street View is unavailable near this selected roof. Try a nearby road-facing coordinate or use satellite only.')
          setLoading(false)
          return
        }

        const panoPosition = data.location.latLng
        const heading = panoPosition
          ? calculateHeadingDegrees(panoPosition.lat(), panoPosition.lng(), lat, lng)
          : 0

        const panorama = new window.google!.maps.StreetViewPanorama(containerRef.current!, {
          pano: data.location.pano,
          pov: { heading, pitch: 4 },
          zoom: 1,
          addressControl: false,
          fullscreenControl: false,
          motionTracking: false,
          motionTrackingControl: false,
          linksControl: true,
          panControl: true,
          zoomControl: true,
          visible: true,
        })

        const syncState = () => {
          const pov = panorama.getPov()
          const position = panorama.getPosition()
          setCaptureState({
            pano: panorama.getPano(),
            lat: position?.lat() ?? null,
            lng: position?.lng() ?? null,
            heading: pov.heading,
            pitch: pov.pitch,
            fov: zoomToApproxFov(panorama.getZoom() ?? 1),
          })
        }

        panorama.addListener('pov_changed', syncState)
        panorama.addListener('pano_changed', syncState)
        panorama.addListener('position_changed', syncState)
        panoramaRef.current = panorama
        syncState()
        setLoading(false)
      },
    )

    return () => {
      cancelled = true
      panoramaRef.current = null
    }
  }, [lat, lng, mapsReady])

  function recenterTowardHome() {
    const panorama = panoramaRef.current
    const position = panorama?.getPosition()
    if (!panorama || !position) return

    panorama.setPov({
      heading: calculateHeadingDegrees(position.lat(), position.lng(), lat, lng),
      pitch: 4,
    })
  }

  return (
    <>
      <Script
        id="google-maps-street-view-capture"
        src={`https://maps.googleapis.com/maps/api/js?key=${(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '').trim()}&v=weekly`}
        strategy="afterInteractive"
        onLoad={() => setMapsReady(true)}
      />
      <div className="overflow-hidden rounded-xl border border-stone-700/70 bg-stone-950">
        <div className="flex items-center justify-between border-b border-stone-800 px-3 py-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Manual Street View capture</div>
            <div className="mt-1 text-xs text-slate-500">Drag the panorama until it faces the house, then capture it.</div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-lg border-stone-700/70 bg-stone-950/70 text-stone-300 hover:bg-stone-900/60"
              disabled={disabled || loading || Boolean(error)}
              onClick={recenterTowardHome}
            >
              <RotateCw className="mr-2 h-3.5 w-3.5" />
              Face roof
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-lg bg-amber-300 font-semibold text-stone-950 hover:bg-amber-200"
              disabled={disabled || loading || Boolean(error) || !captureState.pano}
              onClick={() => onCaptureRef.current(captureState)}
            >
              <Camera className="mr-2 h-3.5 w-3.5" />
              Capture
            </Button>
          </div>
        </div>

        <div className="relative aspect-video bg-stone-950">
          <div ref={containerRef} className="h-full w-full" />
          {loading && (
            <div className="absolute inset-0 grid place-items-center bg-stone-950/80 text-xs text-slate-400">
              <span className="inline-flex items-center">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-amber-300" />
                Finding nearest Street View panorama...
              </span>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 grid place-items-center bg-stone-950 px-6 text-center text-xs leading-5 text-amber-200">
              <span>
                <TriangleAlert className="mx-auto mb-2 h-5 w-5" />
                {error}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function calculateHeadingDegrees(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const toDeg = (radians: number) => (radians * 180) / Math.PI
  const lat1 = toRad(fromLat)
  const lat2 = toRad(toLat)
  const deltaLng = toRad(toLng - fromLng)
  const y = Math.sin(deltaLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng)

  return ((toDeg(Math.atan2(y, x)) % 360) + 360) % 360
}

function zoomToApproxFov(zoom: number) {
  if (zoom >= 3) return 30
  if (zoom >= 2) return 45
  if (zoom >= 1) return 70
  return 90
}
