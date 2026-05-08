export function Footer() {
  return (
    <footer className="w-full border-t border-[color:var(--border-soft)] py-12">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <div className="flex items-center gap-2.5">
          <div
            className="h-5 w-5 rounded-md"
            style={{ background: 'linear-gradient(135deg, #F5B942 0%, #D99028 100%)' }}
            aria-hidden="true"
          />
          <span className="text-sm font-semibold tracking-tight text-[color:var(--text-primary)]">
            Helio Cap
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm text-[color:var(--text-secondary)]">
          <a
            href="mailto:proposals@heliocap.energy"
            className="transition-colors hover:text-[color:var(--text-primary)]"
          >
            proposals@heliocap.energy
          </a>
          <a
            href="tel:+14155550199"
            className="transition-colors hover:text-[color:var(--text-primary)]"
          >
            +1 (415) 555-0199
          </a>
          <span className="font-mono text-xs uppercase tracking-widest text-[color:var(--text-muted)]">
            (c) {new Date().getFullYear()}
          </span>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-7xl border-t border-[color:var(--border-soft)] px-6 pt-6 lg:px-10">
        <p className="max-w-3xl text-xs leading-relaxed text-[color:var(--text-muted)]">
          Disclaimer: All projections are modeled estimates based on publicly available property
          data, utility tariffs, and standard engineering assumptions. Actual production and savings
          will vary based on equipment selection, site conditions, weather, and utility rate changes.
          This document does not constitute a binding offer or financial advice.
        </p>
      </div>
    </footer>
  )
}
