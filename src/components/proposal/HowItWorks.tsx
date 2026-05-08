import { Building2, Cpu, TrendingDown } from 'lucide-react'

const steps = [
  {
    n: '01',
    icon: Building2,
    title: 'We analyze your building',
    body: 'Roof geometry, shading, structural load, and utility tariff are pulled from verified sources - not estimates.',
  },
  {
    n: '02',
    icon: Cpu,
    title: 'We design a custom system',
    body: 'Engineering modeling sizes the array to your consumption profile and local irradiance. No templates.',
  },
  {
    n: '03',
    icon: TrendingDown,
    title: 'You reduce operating costs',
    body: 'Generation displaces grid purchases. Surplus credits offset demand charges across your portfolio.',
  },
]

export function HowItWorks() {
  return (
    <section className="relative w-full py-24 lg:py-32">
      <div className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-[color:var(--border-strong)] to-transparent" />
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <div className="mb-14 max-w-3xl">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
            07 - Process
          </span>
          <h2 className="mt-3 text-balance text-4xl font-semibold tracking-tight text-[color:var(--text-primary)] md:text-5xl">
            How a proposal becomes infrastructure.
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <article
              key={step.n}
              className="glass card-lift animate-fade-up group relative flex flex-col gap-6 rounded-3xl p-7 lg:p-9"
              style={{ animationDelay: `${(index + 1) * 80}ms` }}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                  Step {step.n}
                </span>
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-2xl"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(143,211,232,0.14) 0%, rgba(79,166,198,0.06) 100%)',
                    border: '1px solid rgba(143,211,232,0.22)',
                  }}
                >
                  <step.icon className="h-5 w-5 text-[color:var(--cyan-soft)]" strokeWidth={1.6} />
                </div>
              </div>
              <h3 className="text-2xl font-semibold tracking-tight text-[color:var(--text-primary)]">
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
                {step.body}
              </p>
              <div className="mt-auto pt-4">
                <div
                  className="h-px w-12 transition-all duration-500 group-hover:w-28"
                  style={{ background: 'linear-gradient(90deg, #8FD3E8 0%, #4FA6C6 100%)' }}
                />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
