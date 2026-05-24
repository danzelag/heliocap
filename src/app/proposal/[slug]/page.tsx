import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowUpRight, Building2, Mail, Play, SunMedium } from 'lucide-react'
import { PageViewTracker } from '@/components/site/PageViewTracker'
import { LeadService, type Lead } from '@/services/lead.service'
import { SolarRoof3D } from '@/components/proposal/SolarRoof3D'

export const revalidate = 3600

type ProposalMedia =
  | { kind: 'video'; src: string; poster: string | null }
  | { kind: 'render'; src: string }
  | { kind: 'satellite'; src: string }
  | { kind: 'pending' }

type ProposalPageModel = {
  leadId: string
  slug: string
  businessName: string
  contactName: string | null
  displayName: string
  address: string | null
  shortAddress: string | null
  preparedAt: string
  annualSavings: number | null
  paybackYears: number | null
  systemSizeKw: number | null
  annualProductionKWh: number | null
  roofSqft: number | null
  roofAreaUsedSqft: number | null
  utilityRate: number | null
  lat: number | null
  lng: number | null
  media: ProposalMedia
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const lead = await LeadService.getLeadBySlug(slug)

  if (!lead) {
    return { title: 'Proposal Not Found | Helio Cap' }
  }

  const proposal = buildProposalPageModel(lead)
  const savingsText = proposal.annualSavings
    ? `${formatCurrency(proposal.annualSavings)} / year`
    : 'preliminary estimate'

  return {
    title: `Solar Proposal | ${proposal.displayName} | Helio Cap`,
    description: `Solar proposal for ${proposal.displayName} at ${proposal.shortAddress || 'the property on file'} with ${savingsText}.`,
    openGraph: {
      images: [proposal.media.kind === 'pending' ? '' : proposal.media.kind === 'video' ? proposal.media.poster || '' : proposal.media.src],
    },
  }
}

export default async function ProposalPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const lead = await LeadService.getLeadBySlug(slug)

  if (!lead) notFound()

  const proposal = buildProposalPageModel(lead)
  const replySubject = encodeURIComponent(
    `Solar proposal - ${proposal.displayName}${proposal.shortAddress ? ` - ${proposal.shortAddress}` : ''}`,
  )

  return (
    <main className="min-h-screen bg-[#0b0e10] text-[#f2efea]">
      <PageViewTracker leadId={proposal.leadId} slug={slug} />

      <header className="sticky top-0 z-20 border-b border-white/6 bg-[#0b0e10]/92 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg border border-[#3a2b15] bg-[#18120a] text-[#d99028]">
              <SunMedium className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8f887f]">
                Helio Cap
              </div>
              <div className="text-sm font-semibold text-[#f2efea]">
                Solar proposal for {proposal.displayName}
              </div>
            </div>
          </div>

          <div className="text-xs text-[#a8a39b]">
            <span>{proposal.shortAddress || 'Address pending verification'}</span>
            <span className="mx-2 text-white/20">/</span>
            <span>Prepared {proposal.preparedAt}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-8 sm:py-10">
        {proposal.media.kind === 'pending' && (
          <section className="mb-6 rounded-2xl border border-[#3a2b15] bg-[#18120a] px-4 py-3 text-sm text-[#d9c3a0]">
            This proposal is still being built. Roof imagery and the final savings model are still in progress.
          </section>
        )}

        <section className="mb-8">
          <div className="mb-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8f887f]">
              Property media
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#f2efea] sm:text-4xl">
              {proposal.address || proposal.displayName}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#a8a39b]">
              {proposal.contactName ? `${proposal.contactName}'s property` : proposal.displayName}
              {proposal.address ? ` at ${proposal.address}` : ''}. This proposal page uses the stored roof imagery and published proposal data for this lead only.
            </p>
          </div>

          <ProposalMediaCard proposal={proposal} />

          <div className="mt-4 flex flex-wrap gap-3 text-xs text-[#8f887f]">
            <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">
              {mediaLabel(proposal.media)}
            </span>
            <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">
              Roof area {formatNumber(proposal.roofSqft, 'sq ft')}
            </span>
            <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">
              System size {formatNumber(proposal.systemSizeKw, 'kW DC')}
            </span>
          </div>
        </section>

        <section id="savings" className="mb-8 rounded-2xl border border-white/6 bg-[#13171a] p-5 sm:p-6">
          <div className="mb-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8f887f]">
            Savings snapshot
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard
              label="Annual savings"
              value={proposal.annualSavings ? formatCurrency(proposal.annualSavings) : '—'}
              tone="accent"
              detail={proposal.annualSavings ? 'Estimated annual reduction' : 'Pending site review'}
            />
            <MetricCard
              label="Payback"
              value={proposal.paybackYears ? `${proposal.paybackYears.toFixed(1)} years` : '—'}
              detail={proposal.paybackYears ? 'Simple modeled payback' : 'Pending economics'}
            />
            <MetricCard
              label="System size"
              value={proposal.systemSizeKw ? `${proposal.systemSizeKw} kW` : '—'}
              detail={proposal.systemSizeKw ? 'Derived from savings and rate' : 'Pending production model'}
            />
          </div>

          <div className="mt-5 text-sm text-[#a8a39b]">
            {proposal.utilityRate
              ? `Modeled at ${proposal.utilityRate.toFixed(2)} CAD/kWh blended utility rate.`
              : 'Utility rate is still being confirmed for this property.'}
          </div>

          <div className="mt-5 grid gap-2 text-sm leading-6 text-[#a8a39b]">
            <p>Preliminary estimate based on roof geometry, stored proposal imagery, and local utility assumptions.</p>
            <p>Final figures depend on a site visit, equipment selection, and roof condition review.</p>
            <p>Incentives and financing options are confirmed during the review, not assumed on this page.</p>
          </div>
        </section>

        <section className="mb-8 grid gap-4 lg:grid-cols-2">
          <ScopePanel
            title="What's modeled in this estimate"
            rows={[
              ['Roof area', formatNumber(proposal.roofSqft, 'sq ft')],
              ['Estimated roof area used', formatNumber(proposal.roofAreaUsedSqft, 'sq ft')],
              ['Annual production', formatNumber(proposal.annualProductionKWh, 'kWh')],
              ['Utility rate', proposal.utilityRate ? `${proposal.utilityRate.toFixed(2)} CAD/kWh` : '—'],
            ]}
          />
          <ScopePanel
            title="What we confirm next"
            rows={[
              ['Roof condition', 'On-site review and structural check'],
              ['Equipment', 'Final panel, inverter, and layout selection'],
              ['Interconnection', 'Utility and permitting requirements'],
              ['Commercials', 'Financing and incentive eligibility'],
            ]}
          />
        </section>

        <section id="book" className="rounded-2xl border border-white/6 bg-[#13171a] p-5 sm:p-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8f887f]">
            Next step
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#f2efea] sm:text-3xl">
            Review the proposal with Helio Cap
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#a8a39b]">
            We walk through the roof target, the production model, and the install path for {proposal.displayName}.
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <a
              href="mailto:proposals@heliocap.energy"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#d99028] px-5 py-3 text-sm font-semibold text-[#1b1204] transition hover:brightness-105"
            >
              Book a 20-minute review
              <ArrowUpRight className="h-4 w-4" />
            </a>
            <a
              href={`mailto:proposals@heliocap.energy?subject=${replySubject}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-medium text-[#f2efea] transition hover:bg-white/[0.06]"
            >
              <Mail className="h-4 w-4" />
              Reply to this proposal
            </a>
          </div>

          <div className="mt-5 text-sm text-[#8f887f]">
            Prepared by Helio Cap for {proposal.displayName}.
          </div>
        </section>
      </div>

      <footer className="border-t border-white/6 px-5 py-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 text-sm text-[#8f887f] sm:flex-row sm:items-center sm:justify-between">
          <div className="font-medium text-[#f2efea]">Helio Cap</div>
          <a href="mailto:proposals@heliocap.energy" className="transition hover:text-[#f2efea]">
            proposals@heliocap.energy
          </a>
        </div>
        <div className="mx-auto mt-4 max-w-5xl text-xs leading-6 text-[#6b665e]">
          Disclaimer: All projections are modeled estimates based on stored property data, utility assumptions, and standard engineering inputs. Actual production and savings vary with equipment selection, site conditions, weather, and utility rate changes.
        </div>
      </footer>

      <StickyReviewBar proposal={proposal} />
    </main>
  )
}

function ProposalMediaCard({ proposal }: { proposal: ProposalPageModel }) {
  const media = proposal.media
  const has3D = typeof proposal.lat === 'number' && typeof proposal.lng === 'number'

  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#0b0e10]">
      {/* 3D roof scene — primary when we have coordinates */}
      {has3D && (
        <div className="aspect-[16/10] w-full">
          <SolarRoof3D
            lat={proposal.lat!}
            lng={proposal.lng!}
            panelCount={proposal.systemSizeKw ? Math.round((proposal.systemSizeKw * 1000) / 400) : null}
          />
        </div>
      )}

      {/* Stored media — shown below the 3D scene (video / render / satellite) */}
      {!has3D && (
        <div className="flex aspect-[16/10] items-center justify-center p-3 sm:p-4">
          {media.kind === 'video' && (
            <video
              src={media.src}
              poster={media.poster || undefined}
              className="max-h-full w-full rounded-xl object-contain"
              autoPlay
              muted
              loop
              playsInline
            />
          )}
          {media.kind === 'render' && (
            <img
              src={media.src}
              alt={`Solar proposal render for ${proposal.displayName}`}
              className="max-h-full w-full rounded-xl object-contain"
            />
          )}
          {media.kind === 'satellite' && (
            <img
              src={media.src}
              alt={`Satellite roof imagery for ${proposal.displayName}`}
              className="max-h-full w-full rounded-xl object-contain"
            />
          )}
          {media.kind === 'pending' && (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-6 text-center">
              <Building2 className="h-8 w-8 text-[#6b665e]" />
              <div className="text-sm font-medium text-[#f2efea]">Roof imagery in progress</div>
              <div className="max-w-md text-sm leading-6 text-[#8f887f]">
                This proposal is waiting on its final preview image.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Caption strip under the 3D scene */}
      {has3D && (
        <div className="border-t border-white/5 px-4 py-2.5 text-[10px] font-medium tracking-[0.14em] text-[#6b665e] uppercase">
          Stylized roof model · Google Solar API · Option 4
        </div>
      )}
    </div>
  )
}

function MetricCard({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string
  value: string
  detail: string
  tone?: 'default' | 'accent'
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#0f1316] p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8f887f]">
        {label}
      </div>
      <div className={`mt-3 text-3xl font-semibold tracking-tight sm:text-4xl ${tone === 'accent' ? 'text-[#d99028]' : 'text-[#f2efea]'}`}>
        {value}
      </div>
      <div className="mt-2 text-sm text-[#8f887f]">{detail}</div>
    </div>
  )
}

function ScopePanel({
  title,
  rows,
}: {
  title: string
  rows: Array<[string, string]>
}) {
  return (
    <div className="rounded-2xl border border-white/6 bg-[#13171a] p-5 sm:p-6">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8f887f]">
        {title}
      </div>
      <div className="mt-4 divide-y divide-white/6">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-3 text-sm">
            <div className="text-[#8f887f]">{label}</div>
            <div className="text-right font-medium text-[#f2efea]">{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StickyReviewBar({ proposal }: { proposal: ProposalPageModel }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 lg:hidden">
      <div className="pointer-events-auto mx-auto flex max-w-5xl items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#13171a]/95 px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8f887f]">
            Annual savings
          </div>
          <div className="truncate text-lg font-semibold text-[#d99028]">
            {proposal.annualSavings ? formatCurrency(proposal.annualSavings) : 'Pending review'}
          </div>
        </div>
        <a
          href="mailto:proposals@heliocap.energy"
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#d99028] px-4 py-3 text-sm font-semibold text-[#1b1204]"
        >
          Review
          <ArrowUpRight className="h-4 w-4" />
        </a>
      </div>
    </div>
  )
}

function buildProposalPageModel(lead: Lead): ProposalPageModel {
  const annualSavings = lead.estimated_savings
  const paybackYears = lead.estimated_payback
  const utilityRate = lead.utility_rate
  const annualProductionKWh =
    annualSavings && utilityRate && utilityRate > 0
      ? Math.round(annualSavings / utilityRate)
      : null
  const systemSizeKw =
    annualProductionKWh && annualProductionKWh > 0
      ? Math.max(1, Math.round(annualProductionKWh / 1650))
      : null
  const roofSqft = lead.roof_sqft
  const roofAreaUsedSqft =
    roofSqft && roofSqft > 0
      ? Math.round(roofSqft * 0.7)
      : null

  return {
    leadId: lead.id,
    slug: lead.slug,
    businessName: lead.business_name,
    contactName: lead.contact_name,
    displayName: lead.contact_name || lead.business_name || 'your property',
    address: lead.address,
    shortAddress: getShortAddress(lead.address),
    preparedAt: formatPreparedAt(lead.created_at),
    annualSavings,
    paybackYears,
    systemSizeKw,
    annualProductionKWh,
    roofSqft,
    roofAreaUsedSqft,
    utilityRate,
    lat: lead.lat,
    lng: lead.lng,
    media: selectMedia(lead),
  }
}

function selectMedia(lead: Lead): ProposalMedia {
  if (lead.video_url) {
    return {
      kind: 'video',
      src: lead.video_url,
      poster: lead.render_preview_url || lead.roof_image_url,
    }
  }

  if (lead.render_preview_url) {
    return {
      kind: 'render',
      src: lead.render_preview_url,
    }
  }

  if (lead.roof_image_url) {
    return {
      kind: 'satellite',
      src: lead.roof_image_url,
    }
  }

  return { kind: 'pending' }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatPreparedAt(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function getShortAddress(address: string | null) {
  if (!address) return null
  return address.split(',').slice(0, 2).join(',').trim()
}

function formatNumber(value: number | null, suffix: string) {
  if (!value && value !== 0) return '—'
  return `${new Intl.NumberFormat('en-CA', { maximumFractionDigits: 0 }).format(value)} ${suffix}`
}

function mediaLabel(media: ProposalMedia) {
  if (media.kind === 'video') return 'Proposal video'
  if (media.kind === 'render') return 'Solar render'
  if (media.kind === 'satellite') return 'Satellite imagery'
  return 'Media pending'
}
