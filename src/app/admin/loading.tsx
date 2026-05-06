function SkeletonBox({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-stone-800 ${className}`} />
}

export default function Loading() {
  return (
    <div className="admin-shell">
      <nav className="admin-nav px-5 py-3 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <SkeletonBox className="h-10 w-10" />
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
      <main className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-6 lg:px-8">
        <section className="grid gap-5 lg:grid-cols-[1fr_19rem]">
          <div className="admin-panel p-4 lg:p-5">
            <SkeletonBox className="h-4 w-44" />
            <SkeletonBox className="mt-3 h-8 w-72" />
            <div className="mt-6 space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <SkeletonBox key={index} className="h-20" />
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <SkeletonBox className="h-56 border border-stone-700/70 bg-stone-950/70" />
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <SkeletonBox key={index} className="h-24 border border-stone-700/70 bg-stone-950/70" />
              ))}
            </div>
          </div>
        </section>
        <SkeletonBox className="h-[460px] border border-stone-700/70 bg-stone-950/70" />
      </main>
    </div>
  )
}
