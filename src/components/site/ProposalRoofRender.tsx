type ProposalRoofRenderProps = {
  roofImageUrl: string | null
  renderImageUrl: string | null
  videoUrl?: string | null
  alt: string
}

function isOverlayOnlyRender(url: string | null) {
  if (!url) return false
  const normalized = url.toLowerCase()
  return normalized.includes('overlay') || normalized.includes('panels-only')
}

export function ProposalRoofRender({
  roofImageUrl,
  renderImageUrl,
  videoUrl,
  alt,
}: ProposalRoofRenderProps) {
  const renderIsOverlay = isOverlayOnlyRender(renderImageUrl)
  const compositeRenderUrl = renderImageUrl && !renderIsOverlay ? renderImageUrl : null
  const baseImageUrl = compositeRenderUrl || roofImageUrl
  const hasImage = Boolean(baseImageUrl || renderImageUrl)

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-slate-950">
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        {videoUrl && baseImageUrl ? (
          <video
            src={videoUrl}
            poster={baseImageUrl}
            autoPlay
            muted
            loop
            playsInline
            className="h-full w-full object-contain"
            aria-label={alt}
          />
        ) : baseImageUrl ? (
          <img
            src={baseImageUrl}
            alt={alt}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-6 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
            Roof render pending
          </div>
        )}

        {renderIsOverlay && roofImageUrl && renderImageUrl && (
          <img
            src={renderImageUrl}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          />
        )}

        {!hasImage && (
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(20,184,166,0.14),transparent_45%)]" />
        )}
      </div>
    </div>
  )
}
