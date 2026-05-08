export type ProposalIncentive = {
  label: string
  amount: number
  source: string
  status: 'Confirmed' | 'Pending'
}

export type ProposalUpgrade = {
  id: string
  label: string
  description: string
  included: boolean
  optional: boolean
  savings: number
}

export type ProposalFinancing = {
  monthly_payment: number
  term_years: number
  apr: number
  lender: string
  structure: string
}

export type ProposalViewModel = {
  leadId: string
  businessName: string
  address: string
  annualSavings: number
  twentyYearSavings: number
  monthlyBill: number
  systemSize: number
  paybackPeriod: number
  roiPercent: number
  confidence: string
  confidenceBasis: string
  utilityRate: number
  roofImageUrl: string | null
  renderImageUrl: string | null
  renderPreviewUrl: string | null
  videoUrl: string | null
  heroImageUrl: string | null
  incentives: ProposalIncentive[]
  upgrades: ProposalUpgrade[]
  financing: ProposalFinancing
}
