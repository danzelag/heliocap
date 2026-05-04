type ProposalRoofRenderProps = {
  roofImageUrl: string | null
  renderImageUrl: string | null
  renderPreviewUrl?: string | null
  videoUrl?: string | null
  alt: string
}

export function ProposalRoofRender({
  roofImageUrl,
  renderImageUrl,
  renderPreviewUrl,
  videoUrl,
  alt,
}: ProposalRoofRenderProps) {
  const displayUrl = roofImageUrl || renderPreviewUrl || renderImageUrl

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-slate-950">
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        {videoUrl && displayUrl ? (
          <video
            src={videoUrl}
            poster={displayUrl}
            autoPlay
            muted
            loop
            playsInline
            className="h-full w-full object-contain"
            aria-label={alt}
          />
        ) : displayUrl ? (
          <img
            src={displayUrl}
            alt={alt}
            className="h-full w-full object-contain"
          />
        ) : (
          <>
            <div className="flex h-full w-full items-center justify-center px-6 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
              Roof render pending
            </div>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(20,184,166,0.14),transparent_45%)]" />
          </>
        )}
      </div>
    </div>
  )
}
