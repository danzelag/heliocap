import { Activity, FileCheck, ShieldCheck } from 'lucide-react'

const partners = ['NREL SAM', 'Aurora Solar', 'PVsyst', 'OpenSolar', 'Helioscope']

export function Trust() {
  return (
    <section className="w-full py-24 lg:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <div className="mb-14 max-w-3xl">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
            08 - Standards
          </span>
          <h2 className="mt-3 text-balance text-4xl font-semibold tracking-tight text-[color:var(--text-primary)] md:text-5xl">
            Built to lender-grade standards.
          </h2>
        </div>
        <div className="grid gap-10 md:grid-cols-3">
          <Item
            icon={ShieldCheck}
            title="Commercial-grade modeling"
            body="Same engineering stack used by utility-scale developers. No consumer shortcuts."
          />
          <Item
            icon={Activity}
            title="Built for industrial portfolios"
            body="Optimized for warehouses, distribution centers, manufacturing, cold storage."
          />
          <Item
            icon={FileCheck}
            title="Bankable assumptions"
            body="Production estimates align with P50 standards used by project lenders."
          />
        </div>

        <div className="mt-16 border-t border-[color:var(--border-soft)] pt-10">
          <div className="mb-6 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
            Modeling stack
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4">
            {partners.map((partner) => (
              <span
                key={partner}
                className="font-mono text-sm uppercase tracking-widest text-[color:var(--text-muted)]"
              >
                {partner}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function Item({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof ShieldCheck
  title: string
  body: string
}) {
  return (
    <div className="glass-soft card-lift flex flex-col gap-4 rounded-3xl p-7">
      <div
        className="flex h-11 w-11 items-center justify-center rounded-2xl"
        style={{
          background:
            'linear-gradient(135deg, rgba(143,211,232,0.14) 0%, rgba(79,166,198,0.06) 100%)',
          border: '1px solid rgba(143,211,232,0.22)',
        }}
      >
        <Icon className="h-5 w-5 text-[color:var(--cyan-soft)]" strokeWidth={1.6} />
      </div>
      <h3 className="text-lg font-semibold tracking-tight text-[color:var(--text-primary)]">
        {title}
      </h3>
      <p className="text-sm text-[color:var(--text-secondary)]">{body}</p>
    </div>
  )
}
