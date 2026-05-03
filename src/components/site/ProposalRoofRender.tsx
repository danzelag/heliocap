type ProposalRoofRenderProps = {
  roofImageUrl: string | null
  renderImageUrl: string | null
  videoUrl?: string | null
  alt: string
}

function isOverlayLikeRender(renderImageUrl: string) {
  const url = renderImageUrl.toLowerCase()
  return (
    url.includes('overlay') ||
    url.includes('panel') ||
    url.includes('render') ||
    url.endsWith('.svg') ||
    url.endsWith('.png')
  )
}

export function ProposalRoofRender({
  roofImageUrl,
  renderImageUrl,
  videoUrl,
  alt,
}: ProposalRoofRenderProps) {
  const canLayerOverlay = Boolean(
    roofImageUrl && renderImageUrl && isOverlayLikeRender(renderImageUrl),
  )
  const fallbackImageUrl = renderImageUrl || roofImageUrl

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-slate-950">
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        {videoUrl && (roofImageUrl || renderImageUrl) ? (
          <video
            src={videoUrl}
            poster={roofImageUrl || renderImageUrl || undefined}
            autoPlay
            muted
            loop
            playsInline
            className="h-full w-full object-contain"
            aria-label={alt}
          />
        ) : roofImageUrl && renderImageUrl && canLayerOverlay ? (
          <div className="relative h-full w-full">
            <img
              src={roofImageUrl}
              alt={alt}
              className="h-full w-full object-contain"
            />
            <img
              src={renderImageUrl}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            />
          </div>
        ) : roofImageUrl ? (
          <img
            src={roofImageUrl}
            alt={alt}
            className="h-full w-full object-contain"
          />
        ) : fallbackImageUrl ? (
          <img
            src={fallbackImageUrl}
            alt={alt}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-6 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
            Roof render pending
          </div>
        )}

        {!roofImageUrl && !renderImageUrl && (
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(20,184,166,0.14),transparent_45%)]" />
        )}
      </div>
    </div>
  )
}
