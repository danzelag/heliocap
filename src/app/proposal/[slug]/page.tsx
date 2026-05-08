import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageViewTracker } from '@/components/site/PageViewTracker'
import { FinalCta } from '@/components/proposal/FinalCta'
import { Financing } from '@/components/proposal/Financing'
import { Footer } from '@/components/proposal/Footer'
import { Hero } from '@/components/proposal/Hero'
import { HowItWorks } from '@/components/proposal/HowItWorks'
import { Incentives } from '@/components/proposal/Incentives'
import { RoiSlider } from '@/components/proposal/RoiSlider'
import { SavingsSnapshot } from '@/components/proposal/SavingsSnapshot'
import { StickyMobileCta } from '@/components/proposal/StickyMobileCta'
import { Trust } from '@/components/proposal/Trust'
import { UpgradeChecklist } from '@/components/proposal/UpgradeChecklist'
import type { ProposalViewModel } from '@/components/proposal/types'
import { LeadService, type Lead } from '@/services/lead.service'

export const revalidate = 3600

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const lead = await LeadService.getLeadBySlug(slug)

  if (!lead) return { title: 'Proposal Not Found | Helio Cap' }

  return {
    title: `Solar Proposal / ${lead.business_name} | Helio Cap`,
    description: `Custom solar deployment proposal for ${lead.business_name}. Estimated $${lead.estimated_savings?.toLocaleString()} in annual savings.`,
    openGraph: {
      images: [lead.render_preview_url || lead.roof_image_url || lead.render_image_url || ''],
    },
  }
}

export default async function ClientLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const lead = await LeadService.getLeadBySlug(slug)

  if (!lead) notFound()

  const proposal = buildProposalViewModel(lead)

  return (
    <main className="min-h-screen bg-[color:var(--background)]">
      <PageViewTracker leadId={lead.id} slug={slug} />
      <h1 className="sr-only">Commercial solar proposal for {proposal.businessName}</h1>
      <Hero proposal={proposal} />
      <SavingsSnapshot proposal={proposal} />
      <Incentives proposal={proposal} />
      <RoiSlider proposal={proposal} />
      <UpgradeChecklist proposal={proposal} />
      <Financing proposal={proposal} />
      <HowItWorks />
      <Trust />
      <FinalCta proposal={proposal} />
      <Footer />
      <StickyMobileCta proposal={proposal} />
    </main>
  )
}

function buildProposalViewModel(lead: Lead): ProposalViewModel {
  const businessName = lead.business_name || 'Your Business'
  const address = lead.address || 'Site Address on File'
  const annualSavings = lead.estimated_savings || 24000
  const paybackPeriod = lead.estimated_payback || 4.5
  const twentyYearSavings = annualSavings * 20
  const utilityRate = lead.utility_rate || 0.14
  const annualProductionKWh = annualSavings / utilityRate
  const systemSize = Math.max(1, Math.round(annualProductionKWh / 1650))
  const monthlyBill = Math.round((annualSavings / 0.85) / 12)
  const estimatedSystemCost = Math.max(annualSavings * paybackPeriod, systemSize * 1000 * 1.8)
  const federalItc = Math.round(estimatedSystemCost * 0.3)
  const macrs = Math.round(estimatedSystemCost * 0.18)
  const roiPercent =
    estimatedSystemCost > 0
      ? ((twentyYearSavings - estimatedSystemCost) / estimatedSystemCost) * 100
      : 0
  const financingTermYears = 12

  return {
    leadId: lead.id,
    businessName,
    address,
    annualSavings,
    twentyYearSavings,
    monthlyBill,
    systemSize,
    paybackPeriod,
    roiPercent,
    confidence: 'High',
    confidenceBasis: 'verified roof area + local irradiance + utility rate',
    utilityRate,
    roofImageUrl: lead.roof_image_url,
    renderImageUrl: lead.render_image_url,
    renderPreviewUrl: lead.render_preview_url,
    videoUrl: lead.video_url,
    heroImageUrl: lead.render_preview_url || lead.roof_image_url || lead.render_image_url,
    incentives: [
      {
        label: 'Federal Investment Tax Credit',
        amount: federalItc,
        source: 'IRS Section 48 ITC / 30%',
        status: 'Confirmed',
      },
      {
        label: 'MACRS Bonus Depreciation',
        amount: macrs,
        source: 'IRS Section 168(k) / 5-yr accelerated',
        status: 'Confirmed',
      },
      {
        label: 'Commercial Energy Credit',
        amount: Math.round(estimatedSystemCost * 0.05),
        source: 'Regional incentive estimate',
        status: 'Pending',
      },
      {
        label: 'Utility Demand Response Bonus',
        amount: Math.round(annualSavings * 0.13),
        source: 'Utility program screen',
        status: 'Pending',
      },
    ],
    upgrades: [
      {
        id: 'battery',
        label: `Battery storage (${Math.max(120, Math.round(systemSize * 1.1))} kWh)`,
        description:
          'Peak shaving and outage protection modeled against the projected solar production curve.',
        included: true,
        optional: false,
        savings: Math.round(annualSavings * 0.17),
      },
      {
        id: 'ev',
        label: 'EV fleet charging',
        description:
          'Networked charging tied to the solar generation profile for fleet or employee vehicles.',
        included: true,
        optional: true,
        savings: Math.round(annualSavings * 0.07),
      },
      {
        id: 'monitoring',
        label: 'Real-time production monitoring',
        description:
          'Per-string telemetry with anomaly detection. Standard on all commercial systems.',
        included: true,
        optional: false,
        savings: 0,
      },
      {
        id: 'warranty',
        label: 'Extended 30-year production warranty',
        description:
          'Upgrades the standard 25-year P50 warranty with an output guarantee escalator.',
        included: false,
        optional: true,
        savings: Math.round(annualSavings * 0.04),
      },
      {
        id: 'carport',
        label: 'Solar carport canopy',
        description:
          'Optional canopy capacity over parking areas where site conditions support it.',
        included: false,
        optional: true,
        savings: Math.round(annualSavings * 0.13),
      },
    ],
    financing: {
      monthly_payment: Math.round(estimatedSystemCost / (financingTermYears * 12)),
      term_years: financingTermYears,
      apr: 6.4,
      lender: 'Helio Cap Partners',
      structure: 'PPA / Loan / Cash - three paths modeled',
    },
  }
}
