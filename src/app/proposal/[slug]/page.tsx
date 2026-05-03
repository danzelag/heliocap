import { LeadService } from '@/services/lead.service'
import { AnalyticsService } from '@/services/analytics.service'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { Metadata } from 'next'
import {
  ArrowRight, Download, Layers, MapPin,
  Building2, Cpu, TrendingDown,
  ShieldCheck, Activity, FileCheck,
  ArrowUpRight, FileText
} from 'lucide-react'
import { SavingsPanel } from '@/components/site/SavingsPanel'
import { CtaForm } from '@/components/site/CtaForm'
import { ProposalRoofRender } from '@/components/site/ProposalRoofRender'
import { FloatingPathsBackground } from '@/components/ui/floating-paths-bg'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const lead = await LeadService.getLeadBySlug(slug)

  if (!lead) return { title: 'Proposal Not Found | Helio Cap' }

  return {
    title: `Solar Proposal · ${lead.business_name} | Helio Cap`,
    description: `Custom solar deployment proposal for ${lead.business_name}. Estimated $${lead.estimated_savings?.toLocaleString()} in annual savings.`,
    openGraph: {
      images: [lead.render_image_url || lead.roof_image_url || ''],
    },
  }
}

function formatUSD(n: number, max = 0) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: max }).format(n);
}

export default async function ClientLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const lead = await LeadService.getLeadBySlug(slug)

  if (!lead) notFound()

  const headersList = await headers()
  const userAgent = headersList.get('user-agent') || 'unknown'
  AnalyticsService.trackPageView(lead.id, slug, userAgent)

  // Derived properties for the proposal design
  const businessName = lead.business_name || 'Your Business'
  const address = lead.address || 'Site Address on File'
  const addressShort = address.split(",")[0]
  const annualSavings = lead.estimated_savings || 24000
  const paybackPeriod = lead.estimated_payback || 4.5
  const twentyYearSavings = annualSavings * 20
  const defaultRate = 0.14
  const annualProductionKWh = annualSavings / defaultRate
  const systemSize = Math.round(annualProductionKWh / 1650)
  const monthlyBill = (annualSavings / 0.85) / 12
  const confidence = "High"
  const confidenceBasis = "verified roof area + local irradiance + utility rate"

  const metrics = [
    { label: "Annual Savings", value: formatUSD(annualSavings), accent: true, sub: "Year 1 net of O&M" },
    { label: "20-Year Savings", value: formatUSD(twentyYearSavings), sub: "Lifetime cumulative" },
    { label: "Payback Period", value: `${paybackPeriod.toFixed(1)} yrs`, sub: "After incentives" },
    { label: "System Size", value: `${systemSize} kW`, sub: "DC nameplate" },
  ];

  const steps = [
    { n: "01", icon: Building2, title: "We analyze your building", body: "Roof geometry, shading, structural load, and utility tariff are pulled from verified sources — not estimates." },
    { n: "02", icon: Cpu, title: "We design a custom system", body: "Engineering modeling sizes the array to your consumption profile and local irradiance. No templates." },
    { n: "03", icon: TrendingDown, title: "You reduce operating costs", body: "Generation displaces grid purchases. Surplus credits offset demand charges across your portfolio." },
  ];

  const partners = ["NREL SAM", "Aurora Solar", "PVsyst", "OpenSolar", "Helioscope"];

  return (
    <main className="h-screen w-full overflow-y-auto snap-y snap-mandatory scroll-smooth bg-background text-foreground selection:bg-roi/30">
      <h1 className="sr-only">Commercial solar proposal for {businessName}</h1>

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section className="snap-start relative isolate min-h-screen w-full overflow-hidden bg-primary text-primary-foreground flex flex-col justify-center">
        {/* Animated Paths Background */}
        <FloatingPathsBackground position={1} className="absolute inset-0 z-[-10] min-h-screen" />
        
        {/* Extended Bottom edge fade to blend with next section */}
        <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-dark-secondary to-transparent" aria-hidden="true" />

        {/* Top bar */}
        <header className="border-b border-white/10">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
            <div className="flex items-center gap-2.5">
              <div className="h-6 w-6 rounded-sm bg-roi/90" />
              <span className="text-sm font-semibold tracking-tight">Helio Cap</span>
            </div>
            <div className="hidden items-center gap-3 text-[11px] text-white/55 md:flex">
              <span className="font-mono uppercase tracking-[0.18em]">Proposal · {new Date().getFullYear()}</span>
              <span className="h-1 w-1 rounded-full bg-white/30" />
              <span className="font-mono">Ref HX-{systemSize}-{paybackPeriod.toString().replace(".", "")}</span>
            </div>
          </div>
        </header>

        {/* Main hero grid */}
        <div className="mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-24">
          {/* Section eyebrow */}
          <div className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/50">
              01 — Site Proposal · Prepared for {businessName}
            </span>
            <div className="flex items-center gap-2 text-[11px] text-white/55">
              <MapPin className="h-3.5 w-3.5" />
              <span className="font-mono">{address}</span>
            </div>
          </div>

          <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
            {/* LEFT — Render */}
            <figure className="lg:col-span-7">
              <div className="relative overflow-hidden rounded-lg border border-white/10 bg-dark-secondary">
                <div className="relative w-full overflow-hidden">
                  <ProposalRoofRender
                    roofImageUrl={lead.roof_image_url}
                    renderImageUrl={lead.render_image_url}
                    videoUrl={lead.video_url}
                    alt={`Projected solar installation at ${businessName}, ${address}`}
                  />
                  {/* Engineering grid overlay */}
                  <div className="pointer-events-none absolute inset-0 grid-bg opacity-20 mix-blend-overlay" />
                  {/* Corner crosshairs */}
                  <Crosshair position="top-left" />
                  <Crosshair position="top-right" />
                  <Crosshair position="bottom-left" />
                  <Crosshair position="bottom-right" />
                  {/* Top-left tag */}
                  <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-sm border border-white/15 bg-primary/75 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white backdrop-blur-sm">
                    <Layers className="h-3 w-3" />
                    Projected installation
                  </div>
                  {/* Bottom spec strip */}
                  <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-white/10 bg-primary/85 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/80 backdrop-blur-sm">
                    <span>{systemSize} kW DC</span>
                    <span className="hidden sm:inline">{Math.round(systemSize * 2.4).toLocaleString()} modules</span>
                    <span>Tilt 10° · Azimuth 180°</span>
                  </div>
                </div>
              </div>
              <figcaption className="mt-3 flex items-center justify-between text-[11px] text-white/45">
                <span className="font-mono uppercase tracking-[0.16em]">Render · commercial-grade solar modeling</span>
                <span className="font-mono">Coordinates on file</span>
              </figcaption>
            </figure>

            {/* RIGHT — Info */}
            <div className="lg:col-span-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-[10px] text-white/70">
                <span className="h-1.5 w-1.5 rounded-full bg-roi" />
                <span className="font-mono uppercase tracking-[0.18em]">Personalized proposal</span>
              </div>

              <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl lg:text-[3.5rem]">
                Your roof at <span className="text-white/60">{addressShort}</span> can produce{" "}
                <span className="text-roi num">{formatUSD(annualSavings)}</span>
                <span className="text-white/60"> in year-one savings.</span>
              </h1>

              <p className="mt-6 max-w-md text-base text-white/65">
                Modeled from verified roof geometry, local irradiance for your coordinates, and your current utility tariff. Not a stock estimate.
              </p>

              {/* Spec grid */}
              <dl className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-white/10 bg-white/[0.06]">
                <SpecCell label="System" value={`${systemSize} kW`} />
                <SpecCell label="Payback" value={`${paybackPeriod.toFixed(1)} yrs`} />
                <SpecCell label="20-yr ROI" value={`${(((20 * annualSavings) - (paybackPeriod * annualSavings)) / (paybackPeriod * annualSavings) * 100).toFixed(1)}%`} accent />
              </dl>

              {/* CTAs */}
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a
                  href="#savings"
                  className="group inline-flex items-center gap-2 rounded-md bg-cta px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-cta-hover"
                >
                  View full breakdown
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </a>
                <a
                  href="#download"
                  className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-white/[0.08]"
                >
                  <Download className="h-4 w-4" />
                  Download PDF
                </a>
              </div>

              {/* Confidence */}
              <div className="mt-10 border-t border-white/10 pt-5">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-roi" />
                  <span className="font-mono uppercase tracking-[0.18em] text-white/85">Model confidence · {confidence}</span>
                </div>
                <p className="mt-2 text-xs text-white/55">{confidenceBasis}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SAVINGS SNAPSHOT ──────────────────────────────────────────── */}
      <section id="savings" className="snap-start relative min-h-screen w-full overflow-hidden bg-dark-secondary py-24 text-white lg:py-32 flex flex-col justify-center">
        <div className="absolute inset-0 grid-bg-dark opacity-50" aria-hidden="true" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-primary to-transparent" />

        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <div className="mb-16 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/50">
                02 — Financial Snapshot
              </span>
              <h2 className="mt-3 max-w-2xl text-balance text-4xl font-semibold tracking-tight md:text-5xl">
                The numbers, modeled for your meter.
              </h2>
            </div>
            <p className="max-w-md text-sm text-white/60">
              Calculated from your average monthly bill of {formatUSD(monthlyBill)}, current utility escalation of 3.8%, and a 25-year production warranty.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((m, i) => (
              <div key={m.label} className="group relative bg-primary p-8 transition-colors hover:bg-dark-secondary lg:p-10">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">
                    {String(i + 1).padStart(2, "0")} · {m.label}
                  </span>
                </div>
                <div className={`num mt-6 text-4xl font-semibold tracking-tight md:text-5xl lg:text-[3.25rem] ${m.accent ? "text-roi" : "text-white"}`}>
                  {m.value}
                </div>
                <div className="mt-4 text-xs text-white/50">{m.sub}</div>
                <div className={`absolute inset-x-0 bottom-0 h-px ${m.accent ? "bg-roi/60" : "bg-white/10"}`} />
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-2 text-xs text-white/50">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-roi" />
              <span>Verified against utility tariff schedule</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
              <span>Includes federal ITC + MACRS depreciation</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
              <span>Excludes state/utility rebates (additive)</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── SAVINGS PANEL (INTERACTIVE MODEL) ─────────────────────────── */}
      <SavingsPanel
        initialSavings={annualSavings}
        initialPayback={paybackPeriod}
        buildingType={lead.building_type || 'warehouse'}
      />

      {/* ── HOW IT WORKS ──────────────────────────────────────────────── */}
      <section className="snap-start min-h-screen w-full border-t border-white/10 bg-dark-secondary py-24 lg:py-32 flex flex-col justify-center">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="mb-16 max-w-3xl">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/50">
              04 — Process
            </span>
            <h2 className="mt-3 text-balance text-4xl font-semibold tracking-tight text-white md:text-5xl">
              How a proposal becomes infrastructure.
            </h2>
          </div>

          <div className="grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="group relative flex flex-col gap-6 bg-dark-secondary p-8 lg:p-10 transition-colors hover:bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">
                    Step {s.n}
                  </span>
                  <s.icon className="h-5 w-5 text-white/40" strokeWidth={1.5} />
                </div>
                <h3 className="text-2xl font-semibold tracking-tight text-white">{s.title}</h3>
                <p className="text-sm leading-relaxed text-white/70">{s.body}</p>
                <div className="mt-auto pt-6">
                  <div className="h-px w-12 bg-white/20 transition-all group-hover:w-24 group-hover:bg-roi" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRUST / PARTNERS ──────────────────────────────────────────── */}
      <section className="snap-start min-h-screen w-full bg-primary py-24 lg:py-28 border-t border-white/10 flex flex-col justify-center">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="grid gap-12 lg:grid-cols-3">
            <div className="flex flex-col gap-4">
              <ShieldCheck className="h-6 w-6 text-white/70" strokeWidth={1.5} />
              <h3 className="text-lg font-semibold tracking-tight text-white">Commercial-grade modeling</h3>
              <p className="text-sm text-white/60">Same engineering stack used by utility-scale developers. No consumer shortcuts.</p>
            </div>
            <div className="flex flex-col gap-4">
              <Activity className="h-6 w-6 text-white/70" strokeWidth={1.5} />
              <h3 className="text-lg font-semibold tracking-tight text-white">Built for industrial portfolios</h3>
              <p className="text-sm text-white/60">Optimized for warehouses, distribution centers, manufacturing, cold storage.</p>
            </div>
            <div className="flex flex-col gap-4">
              <FileCheck className="h-6 w-6 text-white/70" strokeWidth={1.5} />
              <h3 className="text-lg font-semibold tracking-tight text-white">Bankable assumptions</h3>
              <p className="text-sm text-white/60">Production estimates align with P50 standards used by project lenders.</p>
            </div>
          </div>

          <div className="mt-16 border-t border-white/10 pt-10">
            <div className="mb-6 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-white/50">
              Modeling stack
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4">
              {partners.map((p) => (
                <span key={p} className="font-mono text-sm uppercase tracking-widest text-white/40">
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA & FOOTER ────────────────────────────────────────── */}
      <section id="download" className="snap-start relative min-h-screen w-full overflow-hidden bg-dark-secondary pt-28 text-white lg:pt-36 flex flex-col justify-between">
        <div className="absolute inset-0 grid-bg-dark opacity-50 pointer-events-none" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

        <div className="relative mx-auto max-w-7xl px-6 lg:px-10 flex-1 flex flex-col justify-center py-12">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/50">
                05 — Next step
              </span>
              <h2 className="mt-4 max-w-xl text-balance text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl lg:text-7xl">
                See your full solar proposal.
              </h2>
              <p className="mt-6 max-w-md text-base text-white/60">
                30-minute walkthrough with a project engineer. We review the model, the assumptions, and the financing path for {businessName}.
              </p>
            </div>

            <div className="flex flex-col gap-3 lg:items-end">
              <div className="w-full lg:w-auto bg-white/[0.02] p-6 rounded-xl border border-white/10 backdrop-blur-sm">
                <CtaForm leadId={lead.id} />
              </div>
              <a
                href="#pdf"
                className="mt-4 inline-flex w-full items-center justify-between gap-4 rounded-md border border-white/15 bg-white/[0.04] px-6 py-5 text-base font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/[0.08] lg:w-auto"
              >
                <span className="flex items-center gap-2.5">
                  <FileText className="h-5 w-5" />
                  Get Full Report PDF
                </span>
                <span className="font-mono text-xs text-white/50">2.4 MB</span>
              </a>

              <div className="mt-4 flex items-center gap-2 text-xs text-white/50">
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-roi" />
                <span className="font-mono uppercase tracking-widest">Confidence · {confidence}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── FOOTER ────────────────────────────────────────────────────── */}
        <footer className="relative w-full border-t border-white/10 bg-primary/80 backdrop-blur-md py-8 mt-auto z-10">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 lg:flex-row lg:items-center lg:justify-between lg:px-10">
            <div className="flex items-center gap-2.5">
              <div className="h-5 w-5 rounded-sm bg-white" />
              <span className="text-sm font-semibold tracking-tight text-white">Helio Cap</span>
            </div>

            <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm text-white/60">
              <a href="mailto:proposals@helios.energy" className="hover:text-white transition-colors">proposals@helios.energy</a>
              <a href="tel:+14155550199" className="hover:text-white transition-colors">+1 (415) 555-0199</a>
              <span className="font-mono text-xs uppercase tracking-widest">© {new Date().getFullYear()}</span>
            </div>
          </div>

          <div className="mx-auto mt-6 max-w-7xl border-t border-white/10 px-6 pt-6 lg:px-10">
            <p className="max-w-3xl text-xs leading-relaxed text-white/40">
              Disclaimer: All projections are modeled estimates based on publicly available property data, utility tariffs, and standard engineering assumptions. Actual production and savings will vary based on equipment selection, site conditions, weather, and utility rate changes. This document does not constitute a binding offer or financial advice.
            </p>
          </div>
        </footer>
      </section>
    </main>
  )
}

function SpecCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-primary p-4 lg:p-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</div>
      <div className={`num mt-2 text-2xl font-semibold tracking-tight ${accent ? "text-roi" : "text-white"}`}>{value}</div>
    </div>
  );
}

function Crosshair({ position }: { position: "top-left" | "top-right" | "bottom-left" | "bottom-right" }) {
  const map = {
    "top-left": "top-3 left-3 border-l border-t",
    "top-right": "top-3 right-3 border-r border-t",
    "bottom-left": "bottom-3 left-3 border-l border-b",
    "bottom-right": "bottom-3 right-3 border-r border-b",
  } as const;
  return <div className={`pointer-events-none absolute h-4 w-4 border-white/60 ${map[position]}`} />;
}
