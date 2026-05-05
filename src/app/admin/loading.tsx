function SkeletonBox({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-white/[0.06] ${className}`} />
}

export default function Loading() {
  return (
    <div className="min-h-screen bg-[#07090c] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(30,41,59,0.75),transparent_32%),linear-gradient(135deg,#07090c_0%,#0d1117_52%,#050608_100%)]" />
      <nav className="relative z-10 border-b border-white/10 bg-[#090d12]/95 px-6 py-4 lg:px-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <SkeletonBox className="h-10 w-10 border border-white/10" />
            <div>
              <SkeletonBox className="h-3 w-24" />
              <SkeletonBox className="mt-2 h-6 w-44" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SkeletonBox className="h-10 w-48" />
            <SkeletonBox className="h-10 w-28" />
            <SkeletonBox className="h-10 w-28" />
          </div>
        </div>
      </nav>
      <main className="relative z-10 mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 lg:px-10">
        <section className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="border border-white/10 bg-[#0b1016]/90 p-5 lg:p-6">
            <SkeletonBox className="h-4 w-44" />
            <SkeletonBox className="mt-3 h-8 w-72" />
            <div className="mt-6 space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <SkeletonBox key={index} className="h-24 border border-white/10" />
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <SkeletonBox className="h-56 border border-white/10" />
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <SkeletonBox key={index} className="h-24 border border-white/10" />
              ))}
            </div>
          </div>
        </section>
        <SkeletonBox className="h-[460px] border border-white/10" />
      </main>
    </div>
  )
}
