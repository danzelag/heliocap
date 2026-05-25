'use client'

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'

type Mode = 'residential' | 'commercial'
type Heating = 'gas' | 'electric' | 'oil' | 'propane' | 'none'
type ProvinceCode = keyof typeof PROVINCES

const PROVINCES = {
  AB: { name: 'Alberta', rate: 16.5, solarYield: 1250, co2: 0.56, hp: 1500, hpName: 'SHARP Program', ev: 0 },
  BC: { name: 'British Columbia', rate: 11.7, solarYield: 1100, co2: 0.013, hp: 6000, hpName: 'CleanBC HP Rebate', ev: 350 },
  MB: { name: 'Manitoba', rate: 10.2, solarYield: 1300, co2: 0.001, hp: 8500, hpName: 'Manitoba HP Program', ev: 4000 },
  NB: { name: 'New Brunswick', rate: 13.4, solarYield: 1180, co2: 0.29, hp: 4500, hpName: 'NB Power HP Rebate', ev: 750 },
  NL: { name: 'Newfoundland & Labrador', rate: 14.2, solarYield: 1100, co2: 0.02, hp: 5000, hpName: 'NL HP Incentive', ev: 600 },
  NS: { name: 'Nova Scotia', rate: 19.0, solarYield: 1150, co2: 0.62, hp: 7500, hpName: 'Efficiency NS HP', ev: 1000 },
  ON: { name: 'Ontario', rate: 13.0, solarYield: 1200, co2: 0.025, hp: 7100, hpName: 'Enbridge HP Rebate', ev: 600 },
  PE: { name: 'Prince Edward Island', rate: 17.5, solarYield: 1150, co2: 0.013, hp: 9000, hpName: 'PEI HP Program', ev: 750 },
  QC: { name: 'Quebec', rate: 7.8, solarYield: 1170, co2: 0.001, hp: 7600, hpName: 'Hydro-Quebec Programs', ev: 4000 },
  SK: { name: 'Saskatchewan', rate: 18.2, solarYield: 1330, co2: 0.61, hp: 4500, hpName: 'SaskEnergy HP Rebate', ev: 600 },
} as const

const HP_BASE_SAVINGS: Record<Heating, number> = {
  gas: 1400,
  electric: 900,
  oil: 2200,
  propane: 1900,
  none: 0,
}

const HP_CO2: Record<Heating, number> = {
  gas: 4.5,
  electric: 0.8,
  oil: 6.0,
  propane: 5.2,
  none: 0,
}

const FED = {
  solarLoan: 40000,
  hpGeneral: 5000,
  hpOilHomes: 10000,
  evResidential: 600,
  evCommercialPort: 5000,
}

const provinceRows = Object.entries(PROVINCES) as Array<[ProvinceCode, (typeof PROVINCES)[ProvinceCode]]>

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-CA', { maximumFractionDigits: 0 }).format(value)
}

function calculateEnergy({
  mode,
  province,
  monthlyBill,
  heating,
  ev,
  parking,
}: {
  mode: Mode
  province: ProvinceCode
  monthlyBill: number
  heating: Heating
  ev: boolean
  parking: boolean
}) {
  const p = PROVINCES[province]
  const scale = Math.max(0.4, Math.min(3, monthlyBill / 200))
  const annualKwh = (monthlyBill * 12 * 100) / p.rate
  const solarKwh = annualKwh * 0.8
  const solarSavings = Math.round((solarKwh * p.rate) / 100)
  const systemKw = Number((solarKwh / p.solarYield).toFixed(1))
  const systemCost = Math.round(systemKw * 3500)
  const fedSolar = Math.min(systemCost, FED.solarLoan)
  const hpSavings = Math.round((HP_BASE_SAVINGS[heating] || 0) * scale)
  const fedHp = heating === 'oil' ? FED.hpOilHomes : heating !== 'none' ? FED.hpGeneral : 0
  const provHp = heating !== 'none' ? p.hp : 0
  const hpCost = heating !== 'none' ? 9000 : 0
  const solarCO2 = Number(((solarKwh * p.co2) / 1000).toFixed(2))

  let evSavings = 0
  let evCost = 0
  let fedEv = 0
  let provEv = 0
  if (mode === 'residential' && ev) {
    evSavings = Math.round(180 * 12 * Math.min(scale, 1.5))
    evCost = 1800
    fedEv = Math.min(Math.round(evCost * 0.5), FED.evResidential)
    provEv = p.ev
  }
  if (mode === 'commercial' && parking) {
    evSavings = 15300
    evCost = 22000
    fedEv = Math.min(Math.round(evCost * 0.5), FED.evCommercialPort * 2)
  }

  const totalAnnualSavings = solarSavings + hpSavings + evSavings
  const totalRebates = fedSolar + fedHp + fedEv + provHp + provEv
  const totalCost = systemCost + hpCost + evCost
  const netCost = Math.max(0, totalCost - totalRebates)
  const payback = totalAnnualSavings > 0 ? Math.round((netCost / totalAnnualSavings) * 10) / 10 : 0
  const totalCO2 = Number((solarCO2 + HP_CO2[heating]).toFixed(1))

  return {
    solarSavings,
    hpSavings,
    evSavings,
    totalAnnualSavings,
    monthlySavings: Math.round(totalAnnualSavings / 12),
    payback,
    totalCO2,
    totalRebates,
    fedSolar,
    fedHp,
    fedEv,
    provHp,
    provEv,
    hpName: p.hpName,
  }
}

function PhotoSlot({ label, detail, tone = 'light' }: { label: string; detail: string; tone?: 'light' | 'dark' }) {
  return (
    <div className={`photo-slot ${tone}`}>
      <div className="photo-orb" />
      <div>
        <span>{label}</span>
        <p>{detail}</p>
      </div>
    </div>
  )
}

export default function Home() {
  const [scrolled, setScrolled] = useState(false)
  const [mode, setMode] = useState<Mode>('residential')
  const [province, setProvince] = useState<ProvinceCode>('ON')
  const [monthlyBill, setMonthlyBill] = useState(220)
  const [heating, setHeating] = useState<Heating>('gas')
  const [ev, setEv] = useState(false)
  const [parking, setParking] = useState(false)
  const [insurance, setInsurance] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const result = useMemo(() => calculateEnergy({ mode, province, monthlyBill, heating, ev, parking }), [mode, province, monthlyBill, heating, ev, parking])
  const rate = PROVINCES[province]
  const sliderFill = `${((monthlyBill - 50) / (1000 - 50)) * 100}%`
  const rebates = [
    result.fedSolar > 0 ? { name: 'Greener Homes Loan', amount: result.fedSolar, tag: 'federal' } : null,
    result.fedHp > 0 ? { name: heating === 'oil' ? 'Oil-to-Heat-Pump Grant' : 'Greener Homes HP Rebate', amount: result.fedHp, tag: 'federal' } : null,
    result.fedEv > 0 ? { name: mode === 'commercial' ? 'ZEVIP Commercial Charging' : 'iMHZEV Charger Rebate', amount: result.fedEv, tag: 'federal' } : null,
    result.provHp > 0 ? { name: result.hpName, amount: result.provHp, tag: 'provincial' } : null,
    result.provEv > 0 ? { name: 'Provincial EV incentive', amount: result.provEv, tag: 'provincial' } : null,
  ].filter((row): row is { name: string; amount: number; tag: string } => Boolean(row))

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
  }

  return (
    <main>
      <nav className={`nav on-dark ${scrolled ? 'scrolled' : ''}`} id="main-nav">
        <a className="brand" href="#hero">[BRAND]<sup>TM</sup></a>
        <div className="nav-links">
          <a href="#solar">Solar</a>
          <a href="#heatpump">Heat Pumps</a>
          <a href="#ev">EV Charging</a>
          <a href="#rebates">Incentives</a>
          <a href="#contact">Contact</a>
        </div>
        <a href="#contact" className="btn btn-white nav-cta">Book assessment</a>
      </nav>

      <section className="hero" id="hero">
        <div className="hero-bg">
          <PhotoSlot label="Hero image placeholder" detail="Add a premium Canadian home or clean-energy photo." tone="dark" />
        </div>
        <div className="hero-overlay" />
        <div className="hero-content container">
          <div className="hero-overline">Firefly Solar · Smarco Building Solutions · Maxperr Energy</div>
          <h1>The energy upgrade<br /><em>Canada&apos;s homes</em><br />deserve.</h1>
          <p className="hero-sub">Solar panels, heat pumps, and EV charging from trusted Canadian specialists. One assessment. Every incentive reviewed.</p>
          <div className="hero-actions">
            <a href="#calculator" className="btn btn-white">Calculate my savings <span className="arrow">-&gt;</span></a>
            <a href="#contact" className="btn btn-outline-white">Book free assessment</a>
          </div>
        </div>
        <div className="hero-scroll"><div className="scroll-line" /><span>Scroll</span></div>
      </section>

      <div className="partner-strip">
        <div className="partner-strip-inner">
          <span className="label-mono eyebrow">Our partners</span>
          <div className="partner-names">
            <span className="partner-name">Firefly Solar</span>
            <span className="partner-name">Smarco Building Solutions</span>
            <span className="partner-name">Maxperr Energy</span>
          </div>
        </div>
      </div>

      <section className="metrics">
        <div className="metrics-inner container">
          {[
            ['Max federal rebates', '$55,600', 'CAD', 'Federal + select provincial programs stacked'],
            ['Typical payback period', '8-12', 'yrs', 'After applicable incentives'],
            ['CO2 avoided per year', '4.5', 'tonnes', 'Avg Canadian home, gas heating replaced'],
            ['Provinces served', '10', 'provinces', 'Coast-to-coast partner network'],
          ].map(([label, value, unit, note]) => (
            <div className="metric" key={label}>
              <div className="m-label">{label}</div>
              <div className="m-value">{value}<span className="m-unit">{unit}</span></div>
              <div className="m-note">{note}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="section-pad" id="calculator">
        <div className="container">
          <div className="section-intro">
            <div>
              <div className="eyebrow">Savings estimator</div>
              <h2 className="h-section">How much could<br /><em>you save?</em></h2>
            </div>
            <div>
              <p className="h-sub">Enter your monthly electricity bill and we estimate annual savings, payback period, and incentives using Canadian provincial data.</p>
              <p className="data-note">Rates directional as of 2025 · CAD</p>
            </div>
          </div>

          <div className="calc-wrap">
            <div className="calc-inputs">
              <div className="calc-inputs-head">
                <h3>Your property</h3>
                <div className="mode-toggle">
                  <button className={mode === 'residential' ? 'active' : ''} onClick={() => setMode('residential')} type="button">Residential</button>
                  <button className={mode === 'commercial' ? 'active' : ''} onClick={() => setMode('commercial')} type="button">Commercial</button>
                </div>
              </div>

              <div className="input-group">
                <div className="field-label"><span className="fl">Province</span><span className="fv">{rate.name}</span></div>
                <div className="sel-wrap">
                  <select value={province} onChange={(event) => setProvince(event.target.value as ProvinceCode)}>
                    {provinceRows.map(([code, data]) => <option key={code} value={code}>{data.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="input-group">
                <div className="field-label"><span className="fl">Monthly electricity bill</span><span className="fv">${monthlyBill} / mo</span></div>
                <input
                  type="range"
                  min="50"
                  max="1000"
                  step="10"
                  value={monthlyBill}
                  style={{ '--fill': sliderFill } as CSSProperties}
                  onChange={(event) => setMonthlyBill(Number(event.target.value))}
                />
                <div className="range-labels"><span>$50</span><span>$1,000</span></div>
              </div>

              <div className="input-group">
                <div className="field-label"><span className="fl">Current heating type</span></div>
                <div className="chip-row">
                  {[
                    ['gas', 'Natural Gas'],
                    ['electric', 'Electric'],
                    ['oil', 'Heating Oil'],
                    ['propane', 'Propane'],
                    ['none', 'None'],
                  ].map(([value, label]) => (
                    <button key={value} className={`chip ${heating === value ? 'active' : ''}`} type="button" onClick={() => setHeating(value as Heating)}>{label}</button>
                  ))}
                </div>
              </div>

              {mode === 'residential' ? (
                <div className="input-group">
                  <div className="field-label"><span className="fl">Do you drive an EV?</span></div>
                  <div className="chip-row">
                    <button className={`chip ${ev ? 'active' : ''}`} type="button" onClick={() => setEv(true)}>Yes - I have an EV</button>
                    <button className={`chip ${!ev ? 'active' : ''}`} type="button" onClick={() => setEv(false)}>Not yet</button>
                  </div>
                </div>
              ) : (
                <div className="input-group">
                  <div className="field-label"><span className="fl">Public parking lot on property?</span></div>
                  <div className="chip-row">
                    <button className={`chip ${parking ? 'active' : ''}`} type="button" onClick={() => setParking(true)}>Yes</button>
                    <button className={`chip ${!parking ? 'active' : ''}`} type="button" onClick={() => setParking(false)}>No</button>
                  </div>
                </div>
              )}

              <p className="calc-disclaimer">Estimates are directional and based on provincial averages. Actual savings vary by property, equipment, financing, and eligibility.</p>
            </div>

            <div className="calc-results">
              <div className="results-label"><span>Estimated annual savings</span><span>{rate.name} · {rate.rate.toFixed(1)}c/kWh</span></div>
              <div className="result-big">
                <div className="r-label">Annual savings (all systems)</div>
                <div className="r-num"><span className="cur">CAD</span>{formatNumber(result.totalAnnualSavings)}</div>
                <div className="r-sub">Solar ${formatNumber(result.solarSavings)}/yr · Heat pump ${formatNumber(result.hpSavings)}/yr{result.evSavings ? ` · EV $${formatNumber(result.evSavings)}/yr` : ''}</div>
              </div>
              <div className="result-stats">
                <div className="rs-cell"><div className="rs-l">Monthly</div><div className="rs-v">${formatNumber(result.monthlySavings)}</div></div>
                <div className="rs-cell"><div className="rs-l">Payback</div><div className="rs-v">{result.payback || '-'}<span className="rs-u">yrs</span></div></div>
                <div className="rs-cell"><div className="rs-l">CO2 / yr</div><div className="rs-v">{result.totalCO2 || '-'}<span className="rs-u">t</span></div></div>
              </div>
              <div className="rebate-list">
                {rebates.map((row) => (
                  <div className="rebate-row" key={row.name}>
                    <span className="rr-name">{row.name}<span className="rr-tag">{row.tag}</span></span>
                    <span className="rr-amt">${formatNumber(row.amount)}</span>
                  </div>
                ))}
                <div className="rebate-row total-row">
                  <span className="rr-name">Total available incentives</span>
                  <span className="rr-amt">${formatNumber(result.totalRebates)}</span>
                </div>
              </div>
              <div className="results-cta">
                <a href="#contact" className="btn btn-white">Get free assessment <span className="arrow">-&gt;</span></a>
                <a href="#rebates" className="btn btn-outline-white">All incentives</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-pad bg-warm" id="how">
        <div className="container">
          <div className="eyebrow">Our process</div>
          <h2 className="h-section">From assessment<br /><em>to savings</em></h2>
          <div className="steps-wrap">
            {[
              ['01', 'Free assessment', 'We review your property, energy usage, and provincial eligibility at no cost.'],
              ['02', 'Custom energy plan', 'Solar, heat pumps, and EV charging tailored to your province, property, and goals.'],
              ['03', 'Incentive stacking', 'We help identify every federal and provincial incentive you can reasonably pursue.'],
              ['04', 'Certified installation', 'Trusted partner installers handle the project from design through commissioning.'],
            ].map(([number, title, copy]) => (
              <div className="step-item" key={number}>
                <div className="step-num">{number}</div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <ProductSection
        id="solar"
        partner="Firefly Solar"
        title={<>Panels that pay<br /><em>for themselves.</em></>}
        copy="High-efficiency solar panels suited for Canadian sun angles, winter conditions, and long-term energy savings."
        visualTag="Firefly · Solar"
        visualDetail="Solar rooftop or panel product image"
        specs={[
          ['Panel efficiency', '23.4', '%'],
          ['Product warranty', '25', 'yrs'],
          ['Peak yield (SK)', '1,330', 'kWh/kW'],
          ['Typical install', '1-2', 'days'],
        ]}
      />
      <ProductSection
        id="heatpump"
        partner="Smarco Building Solutions"
        title={<>Engineered for<br /><em>Canadian winters.</em></>}
        copy="Cold-climate heat pumps designed to reduce heating costs and emissions through harsh Canadian shoulder seasons and winter weather."
        visualTag="Smarco · Cold Climate"
        visualDetail="Heat pump unit or install image"
        flip
        specs={[
          ['COP rating', '3.8', ''],
          ['Min. operating temp', '-30', 'C'],
          ['Max rebates', '$14,600', 'CAD'],
          ['Installation', '1', 'day'],
        ]}
      />
      <ProductSection
        id="ev"
        partner="Maxperr Energy"
        title={<>EV charging for<br /><em>homes and fleets.</em></>}
        copy="Level 2 residential chargers and commercial charging plans for properties preparing for electric vehicles."
        visualTag="Maxperr · EV Charging"
        visualDetail="EV charger or parking station image"
        specs={[
          ['Output range', '7.2-50', 'kW'],
          ['ZEVIP rebate', '$5,000', '/port'],
          ['Solar sync', 'Smart', 'schedule'],
          ['Warranty', '5', 'yrs'],
        ]}
      />

      <section className="section-pad bg-warm" id="rebates">
        <div className="container">
          <div className="section-intro">
            <div>
              <div className="eyebrow">Incentives & rebates</div>
              <h2 className="h-section">Stack every<br /><em>dollar available.</em></h2>
            </div>
            <p className="h-sub">Federal and provincial programs can materially reduce project costs. Eligibility changes, so we verify the final stack during assessment.</p>
          </div>
          <div className="incentive-cards">
            {[
              ['Federal', 'Canada Greener Homes Loan', 'Interest-free financing for eligible clean-energy upgrades.', 'Up to', '$40,000', 'CAD'],
              ['Federal', 'Oil-to-Heat-Pump Affordability', 'Income-tested support for eligible oil-heated homes switching to heat pumps.', 'Up to', '$10,000', 'CAD'],
              ['Federal · Commercial', 'ZEVIP EV Charging', 'Support for eligible public and commercial charging infrastructure.', 'Up to', '$5,000', '/port'],
            ].map(([scope, title, copy, pre, amount, unit]) => (
              <div className="incentive-card featured" key={title}>
                <div className="ic-scope">{scope}</div>
                <h4>{title}</h4>
                <p>{copy}</p>
                <div className="ic-amount"><span className="pre">{pre}</span>{amount}<span className="u">{unit}</span></div>
              </div>
            ))}
          </div>
          <div className="prov-table">
            <div className="prov-table-head"><span>Province</span><span>Rate</span><span>HP rebate</span><span>Program</span></div>
            {provinceRows.map(([code, row]) => (
              <div className="prov-row" key={code}>
                <div className="pn">{row.name}</div>
                <div className="pr">{row.rate.toFixed(1)}c</div>
                <div className="ph">${formatNumber(row.hp)}</div>
                <div className="pp">{row.hpName}</div>
              </div>
            ))}
          </div>
          <p className="rebate-note">Rebate amounts are directional and may change by province, utility, income, equipment, and installer eligibility.</p>
        </div>
      </section>

      <section className="section-pad" id="contact">
        <div className="container">
          <div className="contact-split">
            <div className="contact-left">
              <div className="eyebrow">Free assessment</div>
              <h2 className="h-section">Let&apos;s build your<br /><em>energy plan.</em></h2>
              <p className="h-sub">Tell us about your property and we&apos;ll review your savings potential and incentive eligibility. No pressure.</p>
              <div className="contact-details">
                <div className="contact-detail-row"><span className="cdl">Partners</span><span>Firefly Solar · Smarco · Maxperr</span></div>
                <div className="contact-detail-row"><span className="cdl">Coverage</span><span>All 10 Canadian provinces</span></div>
                <div className="contact-detail-row"><span className="cdl">Response</span><span>Within 1 business day</span></div>
                <div className="contact-detail-row"><span className="cdl">Assessment</span><span>Free, no commitment required</span></div>
              </div>
            </div>
            <form className="form-card" onSubmit={submitForm}>
              <div className="form-row">
                <Field id="first" label="First name" placeholder="Jane" />
                <Field id="last" label="Last name" placeholder="Tremblay" />
              </div>
              <div className="form-row">
                <Field id="email" label="Email address" placeholder="jane@example.ca" type="email" />
                <Field id="phone" label="Phone number" placeholder="+1 (416) 555-0100" type="tel" />
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label htmlFor="form-province">Province</label>
                  <div className="sel-wrap">
                    <select id="form-province" defaultValue="ON">
                      {provinceRows.map(([code, row]) => <option key={code} value={code}>{row.name}</option>)}
                    </select>
                  </div>
                </div>
                <Field id="property" label="Property type" placeholder="Home or commercial" />
              </div>
              <div className="form-row single">
                <div className="form-field">
                  <label htmlFor="message">What are you interested in?</label>
                  <textarea id="message" placeholder="Solar, heat pump, EV charger, or all of the above..." />
                </div>
              </div>
              <label className="consent-label">
                <input type="checkbox" checked={insurance} onChange={(event) => setInsurance(event.target.checked)} />
                <span className="cb-box" />
                <span className="consent-body"><strong>Yes,</strong> it&apos;s okay to see if I qualify for a free home insurance quote while reviewing my energy upgrade.</span>
              </label>
              <div className="form-footer">
                <p className="fine-print">By submitting, you agree to be contacted about your assessment. No spam.</p>
                <button className="btn btn-black" type="submit">{submitted ? 'Sent' : 'Submit request'} <span className="arrow">-&gt;</span></button>
              </div>
              {submitted && <div id="form-success">Received. This preview form is ready to wire into your preferred CRM or lead endpoint.</div>}
            </form>
          </div>
        </div>
      </section>

      <footer>
        <div className="footer-inner">
          <div className="footer-top">
            <div>
              <div className="brand">[BRAND]<sup>TM</sup></div>
              <p className="footer-tagline">Premium clean-energy upgrades for Canadian homes and businesses.</p>
            </div>
            <FooterColumn title="Products" links={['Solar', 'Heat Pumps', 'EV Charging']} />
            <FooterColumn title="Partners" links={['Firefly Solar', 'Smarco', 'Maxperr Energy']} />
            <FooterColumn title="Contact" links={['Book assessment', 'Incentives', 'Calculator']} />
          </div>
          <div className="footer-bot"><span>© 2026 [BRAND]. All rights reserved.</span><span>Canada · CAD estimates</span></div>
        </div>
      </footer>
    </main>
  )
}

function ProductSection({
  id,
  partner,
  title,
  copy,
  specs,
  visualTag,
  visualDetail,
  flip = false,
}: {
  id: string
  partner: string
  title: ReactNode
  copy: string
  specs: Array<[string, string, string]>
  visualTag: string
  visualDetail: string
  flip?: boolean
}) {
  const body = (
    <div className="product-body">
      <div className="product-partner">{partner}</div>
      <h2>{title}</h2>
      <p>{copy}</p>
      <div className="spec-grid">
        {specs.map(([label, value, unit]) => (
          <div className="spec-cell" key={label}>
            <div className="sc-l">{label}</div>
            <div className="sc-v">{value}{unit && <span className="sc-u">{unit}</span>}</div>
          </div>
        ))}
      </div>
      <div className="product-actions">
        <a href="#calculator" className="btn btn-black">Calculate savings <span className="arrow">-&gt;</span></a>
        <a href="#contact" className="btn btn-outline">Learn more</a>
      </div>
    </div>
  )
  const visual = (
    <div className="product-visual">
      <div className="product-visual-tag">{visualTag}</div>
      <PhotoSlot label={partner} detail={visualDetail} />
    </div>
  )

  return (
    <section className="product-section" id={id}>
      <div className="container">
        <div className={`product-grid ${flip ? 'flip' : ''}`}>
          {flip ? <>{visual}{body}</> : <>{body}{visual}</>}
        </div>
      </div>
    </section>
  )
}

function Field({ id, label, placeholder, type = 'text' }: { id: string; label: string; placeholder: string; type?: string }) {
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type={type} placeholder={placeholder} required />
    </div>
  )
}

function FooterColumn({ title, links }: { title: string; links: string[] }) {
  return (
    <div className="footer-col">
      <h5>{title}</h5>
      <ul>
        {links.map((link) => <li key={link}><a href="#contact">{link}</a></li>)}
      </ul>
    </div>
  )
}
