'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import Image from 'next/image'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from 'react'

type Heating = 'gas' | 'electric' | 'oil' | 'propane' | 'none'
type ProvinceCode = keyof typeof PROVINCES
type AddressLookupStatus = 'idle' | 'ready' | 'unavailable'

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
}

const provinceRows = Object.entries(PROVINCES) as Array<[ProvinceCode, (typeof PROVINCES)[ProvinceCode]]>
const NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

const ENERGY_STORY_SECTIONS = [
  {
    key: 'solar',
    label: 'SOLAR SYSTEMS',
    headline: (
      <>
        Panels that pay<br />
        <em>for themselves.</em>
      </>
    ),
    body: 'High-efficiency solar panels suited for Canadian sun angles, winter conditions, and long-term energy savings.',
    stats: [
      ['Panel efficiency', '23.4', '%'],
      ['Product warranty', '25', 'yrs'],
      ['Peak yield (SK)', '1,330', 'kWh/kW'],
      ['Typical install', '1-2', 'days'],
    ],
    videoSrc: '/hero/energy-solar.mp4',
    posterSrc: '/hero/energy-solar-poster.webp',
  },
  {
    key: 'heatpump',
    label: 'HEAT PUMPS',
    headline: (
      <>
        Engineered for<br />
        <em>Canadian winters.</em>
      </>
    ),
    body: 'Cold-climate heat pumps designed to reduce heating costs and emissions through harsh Canadian shoulder seasons and winter weather.',
    stats: [
      ['COP rating', '3.8', ''],
      ['Min. operating temp', '-30', 'C'],
      ['Max rebates', '$14,600', 'CAD'],
      ['Installation', '1', 'day'],
    ],
    videoSrc: '/hero/energy-heat-pump.mp4',
    posterSrc: '/hero/energy-heat-pump-poster.webp',
  },
  {
    key: 'ev',
    label: 'EV CHARGING',
    headline: (
      <>
        EV charging for<br />
        <em>home routines.</em>
      </>
    ),
    body: 'Level 2 residential chargers for homes preparing for electric vehicles and smarter overnight energy use.',
    stats: [
      ['Output range', '7.2-50', 'kW'],
      ['Home charger rebate', '$600', 'CAD'],
      ['Solar sync', 'Smart', 'schedule'],
      ['Warranty', '5', 'yrs'],
    ],
    videoSrc: '/hero/energy-ev-charger.mp4',
    posterSrc: '/hero/energy-ev-charger-poster.webp',
  },
] as const

const ENERGY_VIDEO_SOURCES = ENERGY_STORY_SECTIONS.map((section) => section.videoSrc)
const ENERGY_VIDEO_COMPLETE_AT = 0.72
const ENERGY_PANEL_APPEAR_AT = 0.66
const ENERGY_DEFAULT_VIDEO_DURATION = 8
const ENERGY_VIDEO_ADVANCE_SECONDS_PER_SECOND = 1.18
const ENERGY_TEXT_PROGRESS_PER_SECOND = 0.22
const ENERGY_SCROLL_PIXELS_PER_SECOND = 360
const ENERGY_SCROLL_PIXELS_PER_SECOND_MOBILE = 300
const ENERGY_SCROLL_STEP = 220
const ENERGY_SCROLL_MAX_QUEUE = 520

let googlePlacesLoader: Promise<typeof google | null> | null = null

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-CA', { maximumFractionDigits: 0 }).format(value)
}

function normalizeProvinceName(value: string) {
  return value.trim().toLowerCase().replace(/\./g, '')
}

function provinceCodeFromPlace(place: google.maps.places.PlaceResult): ProvinceCode | null {
  const components = place.address_components ?? []

  for (const component of components) {
    if (!component.types.includes('administrative_area_level_1')) continue

    const shortName = component.short_name?.trim().toUpperCase() as ProvinceCode | undefined
    if (shortName && shortName in PROVINCES) return shortName

    const longName = normalizeProvinceName(component.long_name ?? '')
    const match = provinceRows.find(([, row]) => normalizeProvinceName(row.name) === longName)
    if (match) return match[0]
  }

  return null
}

async function loadGooglePlacesScript(): Promise<typeof google | null> {
  if (typeof window === 'undefined') return null
  if (window.google?.maps?.places) return window.google
  if (!NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) return null
  if (googlePlacesLoader) return googlePlacesLoader

  googlePlacesLoader = new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-places-loader="true"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google ?? null), { once: true })
      existing.addEventListener('error', () => resolve(null), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places&loading=async`
    script.async = true
    script.defer = true
    script.dataset.googlePlacesLoader = 'true'
    script.onload = () => resolve(window.google ?? null)
    script.onerror = () => resolve(null)
    document.head.appendChild(script)
  })

  return googlePlacesLoader
}

function calculateEnergy({
  province,
  monthlyBill,
  heating,
  ev,
}: {
  province: ProvinceCode
  monthlyBill: number
  heating: Heating
  ev: boolean
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
  if (ev) {
    evSavings = Math.round(180 * 12 * Math.min(scale, 1.5))
    evCost = 1800
    fedEv = Math.min(Math.round(evCost * 0.5), FED.evResidential)
    provEv = p.ev
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

export default function Home() {
  const [scrolled, setScrolled] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [heroVideoReady, setHeroVideoReady] = useState(false)
  const [province, setProvince] = useState<ProvinceCode>('ON')
  const [monthlyBill, setMonthlyBill] = useState(220)
  const [heating, setHeating] = useState<Heating>('gas')
  const [ev, setEv] = useState(false)
  const [insurance, setInsurance] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [contactAddress, setContactAddress] = useState('')
  const [contactProvince, setContactProvince] = useState<ProvinceCode>('ON')
  const [addressLookupStatus, setAddressLookupStatus] = useState<AddressLookupStatus>('idle')

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 40)
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      setScrollProgress(scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0)
    }
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const preloadLinks = ENERGY_VIDEO_SOURCES.map((src) => {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'video'
      link.href = src
      link.type = 'video/mp4'
      document.head.appendChild(link)
      return link
    })

    const preloadVideos = ENERGY_VIDEO_SOURCES.map((src) => {
      const video = document.createElement('video')
      video.preload = 'auto'
      video.muted = true
      video.playsInline = true
      video.src = src
      video.load()
      return video
    })

    return () => {
      preloadLinks.forEach((link) => link.remove())
      preloadVideos.forEach((video) => {
        video.removeAttribute('src')
        video.load()
      })
    }
  }, [])

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>('.reveal'))
    if (!sections.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
          }
        }
      },
      {
        threshold: 0.24,
        rootMargin: '0px 0px -12% 0px',
      },
    )

    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  const result = useMemo(() => calculateEnergy({ province, monthlyBill, heating, ev }), [province, monthlyBill, heating, ev])
  const rate = PROVINCES[province]
  const sliderFill = `${((monthlyBill - 50) / (1000 - 50)) * 100}%`
  const rebates = [
    result.fedSolar > 0 ? { name: 'Greener Homes Loan', amount: result.fedSolar, tag: 'federal' } : null,
    result.fedHp > 0 ? { name: heating === 'oil' ? 'Oil-to-Heat-Pump Grant' : 'Greener Homes HP Rebate', amount: result.fedHp, tag: 'federal' } : null,
    result.fedEv > 0 ? { name: 'iMHZEV Charger Rebate', amount: result.fedEv, tag: 'federal' } : null,
    result.provHp > 0 ? { name: result.hpName, amount: result.provHp, tag: 'provincial' } : null,
    result.provEv > 0 ? { name: 'Provincial EV incentive', amount: result.provEv, tag: 'provincial' } : null,
  ].filter((row): row is { name: string; amount: number; tag: string } => Boolean(row))

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
  }

  return (
    <main className="snap-shell">
      <nav className={`nav on-dark ${scrolled ? 'scrolled' : ''}`} id="main-nav">
        <a className="brand" href="#hero">[BRAND]<sup>TM</sup></a>
        <div className="nav-links">
          <a href="#solar">Solar</a>
          <a href="#heatpump">Heat Pumps</a>
          <a href="#ev">EV Charging</a>
          <a href="#costs">Costs</a>
          <a href="#rebates">Incentives</a>
          <a href="#contact">Contact</a>
        </div>
        <a href="#contact" className="btn btn-white nav-cta">Book assessment</a>
        <div className="nav-progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${scrollProgress})` }} />
        </div>
      </nav>

      <section className="hero snap-panel" id="hero">
        <div className="hero-bg">
          <div className="hero-media-shell">
            <Image
              className={`hero-poster ${heroVideoReady ? 'is-muted' : ''}`}
              src="/hero/house-solar-hero-poster.webp"
              alt=""
              aria-hidden="true"
              fill
              priority
              sizes="100vw"
            />
            <video
              className={`hero-video ${heroVideoReady ? 'is-ready' : ''}`}
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              poster="/hero/house-solar-hero-poster.webp"
              onCanPlay={() => setHeroVideoReady(true)}
              onLoadedData={() => setHeroVideoReady(true)}
              onError={() => setHeroVideoReady(false)}
            >
              <source src="/hero/house-solar-hero.mp4" type="video/mp4" />
            </video>
          </div>
        </div>
        <div className="hero-overlay" />
        <div className="hero-content container">
          <div className="hero-overline">Solar · Heat Pumps · EV Charging</div>
          <h1>The energy upgrade<br /><em>Canada&apos;s homes</em><br />deserve.</h1>
          <p className="hero-sub">Solar panels, heat pumps, and EV charging from trusted Canadian specialists. One assessment. Every incentive reviewed.</p>
          <div className="hero-actions">
            <a href="#calculator" className="btn btn-white">Calculate my savings <span className="arrow">-&gt;</span></a>
            <a href="#contact" className="btn btn-outline-white">Book free assessment</a>
          </div>
        </div>
        <div className="hero-scroll"><div className="scroll-line" /><span>Scroll</span></div>
      </section>

      <section className="section-pad snap-panel reveal" id="calculator">
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
                <h3>Your home</h3>
                <span className="calc-badge">Residential</span>
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

              <div className="input-group">
                <div className="field-label"><span className="fl">Do you drive an EV?</span></div>
                <div className="chip-row">
                  <button className={`chip ${ev ? 'active' : ''}`} type="button" onClick={() => setEv(true)}>Yes - I have an EV</button>
                  <button className={`chip ${!ev ? 'active' : ''}`} type="button" onClick={() => setEv(false)}>Not yet</button>
                </div>
              </div>

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

      <section className="chart-pin snap-panel reveal" id="costs">
        <div className="chart-section">
          <div className="container chart-section-inner">
            <div className="chart-copy">
              <div className="eyebrow">Energy price curve</div>
              <h2 className="h-section">See the cost<br /><em>you are avoiding.</em></h2>
              <p className="h-sub">Hover the graph to compare projected utility costs with an estimated solar payment over time.</p>
            </div>
            <EnergyPriceChart monthlyBill={monthlyBill} solarSavings={result.solarSavings} large />
          </div>
        </div>
      </section>

      <section className="section-pad bg-warm snap-panel reveal" id="how">
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

      <EnergyScrollytelling />

      <section className="section-pad bg-warm snap-panel reveal" id="rebates">
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
              ['Federal', 'iMHZEV Charger Rebate', 'Support for eligible home charging equipment.', 'Up to', '$600', 'CAD'],
            ].map(([scope, title, copy, pre, amount, unit]) => (
              <div className="incentive-card featured" key={title}>
                <div className="ic-scope">{scope}</div>
                <h4>{title}</h4>
                <p>{copy}</p>
                <div className="ic-amount"><span className="pre">{pre}</span>{amount}<span className="u">{unit}</span></div>
              </div>
            ))}
          </div>
          <div className="incentive-band">
            <div className="incentive-band-card">
              <span className="incentive-band-label">Province-aware calculator</span>
              <p>Real power-rate inputs by province keep the savings range grounded in the market you&apos;re actually in.</p>
            </div>
            <div className="incentive-band-card">
              <span className="incentive-band-label">Federal-first strategy</span>
              <p>We highlight the biggest national programs first, then layer local rebate opportunities where they meaningfully improve payback.</p>
            </div>
            <div className="incentive-band-card">
              <span className="incentive-band-label">Reviewed before quoting</span>
              <p>Final eligibility always gets checked against your property, utility, and install plan before numbers turn into a proposal.</p>
            </div>
          </div>
          <p className="rebate-note">Rebate amounts are directional and may change by province, utility, income, equipment, and installer eligibility.</p>
        </div>
      </section>

      <section className="section-pad snap-panel reveal" id="contact">
        <div className="container">
          <div className="contact-split">
            <div className="contact-left">
              <div className="eyebrow">Free assessment</div>
              <h2 className="h-section">Let&apos;s build your<br /><em>energy plan.</em></h2>
              <p className="h-sub">Tell us about your property and we&apos;ll review your savings potential and incentive eligibility. No pressure.</p>
              <div className="contact-details">
                <div className="contact-detail-row"><span className="cdl">Scope</span><span>Solar, heat pumps, and EV charging for homes</span></div>
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
              <div className="form-row single">
                <AddressAutocompleteField
                  value={contactAddress}
                  onChange={setContactAddress}
                  onProvinceChange={setContactProvince}
                  onStatusChange={setAddressLookupStatus}
                />
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label htmlFor="form-province">Province</label>
                  <div className="sel-wrap">
                    <select
                      id="form-province"
                      value={contactProvince}
                      onChange={(event) => setContactProvince(event.target.value as ProvinceCode)}
                    >
                      {provinceRows.map(([code, row]) => <option key={code} value={code}>{row.name}</option>)}
                    </select>
                  </div>
                </div>
                <Field id="property" label="Property type" placeholder="Detached, semi, townhouse..." />
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
                <p className="fine-print">
                  {addressLookupStatus === 'ready'
                    ? 'Address autocomplete is on. Pick a suggested address to speed up the assessment.'
                    : 'By submitting, you agree to be contacted about your assessment. No spam.'}
                </p>
                <button className="btn btn-black" type="submit">{submitted ? 'Sent' : 'Submit request'} <span className="arrow">-&gt;</span></button>
              </div>
              {submitted && <div id="form-success">Received. This preview form is ready to wire into your preferred CRM or lead endpoint.</div>}
            </form>
          </div>
        </div>
      </section>

      <footer className="snap-panel reveal">
        <div className="footer-inner">
          <div className="footer-top">
            <div>
              <div className="brand">[BRAND]<sup>TM</sup></div>
              <p className="footer-tagline">Premium clean-energy upgrades for Canadian homes.</p>
            </div>
            <FooterColumn title="Products" links={['Solar', 'Heat Pumps', 'EV Charging']} />
            <FooterColumn title="Services" links={['Energy planning', 'Savings review', 'Assessment booking']} />
            <FooterColumn title="Contact" links={['Book assessment', 'Incentives', 'Calculator']} />
          </div>
          <div className="footer-bot"><span>© 2026 [BRAND]. All rights reserved.</span><span>Canada · CAD estimates</span></div>
        </div>
      </footer>
    </main>
  )
}

function EnergyScrollytelling() {
  const storyRef = useRef<HTMLElement | null>(null)
  const prefersReducedMotion = useReducedMotion()

  useEnergyStoryScrollControl(storyRef, Boolean(prefersReducedMotion))

  return (
    <section className="energy-story" aria-label="Home energy systems" ref={storyRef}>
      {ENERGY_STORY_SECTIONS.map((section) => (
        <EnergyStoryScene key={section.key} section={section} />
      ))}
    </section>
  )
}

function useEnergyStoryScrollControl(storyRef: RefObject<HTMLElement | null>, disabled: boolean) {
  const targetScrollRef = useRef<number | null>(null)
  const scrollAnimationRef = useRef<number | null>(null)
  const lastScrollAnimationTimeRef = useRef<number | null>(null)
  const lastTouchYRef = useRef<number | null>(null)

  useEffect(() => {
    if (disabled) return

    const getBounds = () => {
      const story = storyRef.current
      if (!story) return null

      const start = story.offsetTop
      const end = Math.max(start, start + story.offsetHeight - window.innerHeight)
      return { start, end }
    }

    const isStoryPinned = () => {
      const story = storyRef.current
      if (!story) return false

      const rect = story.getBoundingClientRect()
      return rect.top <= 2 && rect.bottom >= window.innerHeight - 2
    }

    const scrollToFrame = (top: number) => {
      const root = document.documentElement
      const previousScrollBehavior = root.style.scrollBehavior
      root.style.scrollBehavior = 'auto'
      window.scrollTo(0, top)
      root.style.scrollBehavior = previousScrollBehavior
    }

    const animateScroll = (timestamp: number) => {
      const target = targetScrollRef.current
      if (target === null) {
        scrollAnimationRef.current = null
        lastScrollAnimationTimeRef.current = null
        return
      }

      const lastTime = lastScrollAnimationTimeRef.current ?? timestamp
      const elapsedSeconds = Math.min(0.05, Math.max(0, (timestamp - lastTime) / 1000))
      lastScrollAnimationTimeRef.current = timestamp

      const current = window.scrollY
      const speed =
        window.matchMedia('(max-width: 640px)').matches
          ? ENERGY_SCROLL_PIXELS_PER_SECOND_MOBILE
          : ENERGY_SCROLL_PIXELS_PER_SECOND
      const maxStep = speed * elapsedSeconds
      const distance = target - current
      const next =
        Math.abs(distance) <= maxStep
          ? target
          : current + Math.sign(distance) * maxStep

      scrollToFrame(next)

      if (Math.abs(target - next) > 0.5) {
        scrollAnimationRef.current = window.requestAnimationFrame(animateScroll)
        return
      }

      scrollAnimationRef.current = null
      lastScrollAnimationTimeRef.current = null
    }

    const queueControlledScroll = (direction: number, multiplier = 1) => {
      const bounds = getBounds()
      if (!bounds || direction === 0 || !isStoryPinned()) return false

      const current = window.scrollY
      const atStart = current <= bounds.start + 1
      const atEnd = current >= bounds.end - 1
      if ((direction < 0 && atStart) || (direction > 0 && atEnd)) return false

      const baseTarget = targetScrollRef.current ?? current
      const queuedTarget = baseTarget + direction * ENERGY_SCROLL_STEP * multiplier
      const maxForward = current + ENERGY_SCROLL_MAX_QUEUE
      const maxBackward = current - ENERGY_SCROLL_MAX_QUEUE
      targetScrollRef.current = Math.min(
        bounds.end,
        Math.max(bounds.start, Math.min(maxForward, Math.max(maxBackward, queuedTarget))),
      )

      if (scrollAnimationRef.current === null) {
        scrollAnimationRef.current = window.requestAnimationFrame(animateScroll)
      }

      return true
    }

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return

      const direction = Math.sign(event.deltaY)
      if (!queueControlledScroll(direction)) return

      event.preventDefault()
    }

    const onTouchStart = (event: TouchEvent) => {
      lastTouchYRef.current = event.touches[0]?.clientY ?? null
    }

    const onTouchMove = (event: TouchEvent) => {
      const currentY = event.touches[0]?.clientY
      const lastY = lastTouchYRef.current
      if (currentY === undefined || lastY === null) return

      const delta = lastY - currentY
      lastTouchYRef.current = currentY
      if (Math.abs(delta) < 4) return

      if (!queueControlledScroll(Math.sign(delta), 0.72)) return
      event.preventDefault()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement
      ) {
        return
      }

      const downKeys = new Set(['ArrowDown', 'PageDown', ' ', 'Spacebar'])
      const upKeys = new Set(['ArrowUp', 'PageUp'])
      const direction = downKeys.has(event.key) ? 1 : upKeys.has(event.key) ? -1 : 0
      if (!queueControlledScroll(direction, event.key.includes('Page') ? 2 : 1)) return

      event.preventDefault()
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('keydown', onKeyDown)
      if (scrollAnimationRef.current !== null) window.cancelAnimationFrame(scrollAnimationRef.current)
    }
  }, [disabled, storyRef])
}

function EnergyStoryScene({ section }: { section: (typeof ENERGY_STORY_SECTIONS)[number] }) {
  const sectionRef = useRef<HTMLElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const videoDurationRef = useRef(0)
  const scrollFrame = useRef<number | null>(null)
  const animationFrame = useRef<number | null>(null)
  const targetProgressRef = useRef(0)
  const animatedProgressRef = useRef(0)
  const lastAnimationTimeRef = useRef<number | null>(null)
  const [sectionProgress, setSectionProgress] = useState(0)
  const [videoReady, setVideoReady] = useState(false)
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    const setVideoProgress = (progress: number) => {
      const video = videoRef.current
      const duration = videoDurationRef.current || video?.duration || 0
      if (!video || duration <= 0 || !Number.isFinite(duration)) return

      const videoProgress = Math.min(1, Math.max(0, progress / ENERGY_VIDEO_COMPLETE_AT))
      const targetTime = Math.min(duration - 0.08, Math.max(0, videoProgress * duration))
      if (Math.abs(video.currentTime - targetTime) > 0.035) {
        video.currentTime = targetTime
      }
    }

    const animateProgress = (timestamp: number) => {
      const lastTime = lastAnimationTimeRef.current ?? timestamp
      const elapsedSeconds = Math.min(0.05, Math.max(0, (timestamp - lastTime) / 1000))
      lastAnimationTimeRef.current = timestamp

      const currentProgress = animatedProgressRef.current
      const targetProgress = targetProgressRef.current
      const progressDelta = targetProgress - currentProgress
      const videoDuration =
        videoDurationRef.current || videoRef.current?.duration || ENERGY_DEFAULT_VIDEO_DURATION
      const videoProgressPerSecond =
        (ENERGY_VIDEO_ADVANCE_SECONDS_PER_SECOND / Math.max(1, videoDuration)) * ENERGY_VIDEO_COMPLETE_AT
      const progressPerSecond =
        currentProgress >= ENERGY_PANEL_APPEAR_AT && targetProgress >= ENERGY_PANEL_APPEAR_AT
          ? ENERGY_TEXT_PROGRESS_PER_SECOND
          : videoProgressPerSecond
      const maxStep = progressPerSecond * elapsedSeconds
      const nextProgress =
        Math.abs(progressDelta) <= maxStep
          ? targetProgress
          : currentProgress + Math.sign(progressDelta) * maxStep

      animatedProgressRef.current = nextProgress
      setSectionProgress(nextProgress)
      setVideoProgress(nextProgress)

      if (Math.abs(targetProgress - nextProgress) > 0.001) {
        animationFrame.current = window.requestAnimationFrame(animateProgress)
        return
      }

      animationFrame.current = null
      lastAnimationTimeRef.current = null
    }

    const scheduleAnimation = () => {
      if (animationFrame.current !== null) return
      animationFrame.current = window.requestAnimationFrame(animateProgress)
    }

    const updateTargetProgress = () => {
      scrollFrame.current = null
      const section = sectionRef.current
      if (!section) return

      const scrollRange = Math.max(1, section.offsetHeight - window.innerHeight)
      const nextProgress = Math.min(1, Math.max(0, -section.getBoundingClientRect().top / scrollRange))

      targetProgressRef.current = nextProgress

      if (prefersReducedMotion) {
        animatedProgressRef.current = nextProgress
        setSectionProgress(nextProgress)
        return
      }

      scheduleAnimation()
    }

    const scheduleTargetProgress = () => {
      if (scrollFrame.current !== null) return
      scrollFrame.current = window.requestAnimationFrame(updateTargetProgress)
    }

    updateTargetProgress()
    window.addEventListener('scroll', scheduleTargetProgress, { passive: true })
    window.addEventListener('resize', scheduleTargetProgress)

    return () => {
      window.removeEventListener('scroll', scheduleTargetProgress)
      window.removeEventListener('resize', scheduleTargetProgress)
      if (scrollFrame.current !== null) window.cancelAnimationFrame(scrollFrame.current)
      if (animationFrame.current !== null) window.cancelAnimationFrame(animationFrame.current)
    }
  }, [prefersReducedMotion])

  const showPanel = prefersReducedMotion || sectionProgress >= ENERGY_PANEL_APPEAR_AT
  const sceneId = section.key === 'solar' ? 'solar' : section.key

  return (
    <section className={`energy-story-scene snap-panel ${section.key}`} id={sceneId} ref={sectionRef}>
      <div className="energy-story-sticky">
        <div className="energy-story-media" aria-hidden="true">
          <video
            ref={videoRef}
            className={`energy-story-video ${videoReady ? 'is-ready' : ''}`}
            muted
            playsInline
            preload="auto"
            onCanPlay={() => setVideoReady(true)}
            onLoadedMetadata={(event) => {
              const video = event.currentTarget
              const duration = video.duration || 0
              videoDurationRef.current = duration
              const videoProgress = Math.min(1, Math.max(0, animatedProgressRef.current / ENERGY_VIDEO_COMPLETE_AT))
              video.currentTime =
                duration > 0 && Number.isFinite(duration)
                  ? Math.min(duration - 0.08, Math.max(0.001, videoProgress * duration))
                  : 0.001
              setVideoReady(true)
            }}
            onLoadedData={() => setVideoReady(true)}
            onError={() => setVideoReady(false)}
          >
            <source src={section.videoSrc} type="video/mp4" />
          </video>
        </div>

        <div className={`container energy-story-inner ${showPanel ? 'is-visible' : ''}`}>
          <div className="energy-story-panel-wrap">
            <AnimatePresence initial={false}>
              {showPanel && <EnergyStoryPanel key={section.key} section={section} />}
            </AnimatePresence>
          </div>

          <div className="energy-story-progress" aria-hidden="true">
            <span style={{ transform: `scaleX(${sectionProgress})` }} />
          </div>
        </div>
      </div>
    </section>
  )
}

function EnergyStoryPanel({
  section,
  staticPanel = false,
}: {
  section: (typeof ENERGY_STORY_SECTIONS)[number]
  staticPanel?: boolean
}) {
  const content = (
    <>
      <div className="energy-story-label">{section.label}</div>
      <h2>{section.headline}</h2>
      <p>{section.body}</p>
      <div className="spec-grid energy-story-specs">
        {section.stats.map(([label, value, unit]) => (
          <div className="spec-cell" key={label}>
            <div className="sc-l">{label}</div>
            <div className="sc-v">
              {value}
              {unit && <span className="sc-u">{unit}</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="product-actions energy-story-actions">
        <a href="#calculator" className="btn btn-white">
          Calculate savings <span className="arrow">-&gt;</span>
        </a>
        <a href="#contact" className="btn btn-outline-white">Learn more</a>
      </div>
    </>
  )

  if (staticPanel) {
    return <div className="energy-story-panel">{content}</div>
  }

  return (
    <motion.div
      className="energy-story-panel"
      initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -18, filter: 'blur(8px)' }}
      transition={{ duration: 0.55, ease: [0.2, 1, 0.2, 1] }}
    >
      {content}
    </motion.div>
  )
}

function EnergyPriceChart({ monthlyBill, solarSavings, large = false }: { monthlyBill: number; solarSavings: number; large?: boolean }) {
  const [hoverYear, setHoverYear] = useState(10)
  const years = useMemo(() => Array.from({ length: 26 }, (_, year) => year), [])
  const monthlySolar = Math.max(25, Math.round(monthlyBill - solarSavings / 12))
  const utilityValues = years.map((year) => Math.round(monthlyBill * Math.pow(1.037, year)))
  const maxValue = Math.max(450, Math.ceil((Math.max(...utilityValues) + 40) / 50) * 50)
  const width = large ? 960 : 720
  const height = large ? 340 : 300
  const pad = large
    ? { top: 28, right: 28, bottom: 48, left: 64 }
    : { top: 24, right: 20, bottom: 40, left: 54 }
  const innerWidth = width - pad.left - pad.right
  const innerHeight = height - pad.top - pad.bottom
  const selectedYear = Math.min(25, Math.max(0, hoverYear))
  const selectedUtility = utilityValues[selectedYear]
  const selectedX = pad.left + (selectedYear / 25) * innerWidth
  const selectedY = valueToY(selectedUtility)
  const solarY = valueToY(monthlySolar)
  const utilityLine = years.map((year) => `${pad.left + (year / 25) * innerWidth},${valueToY(utilityValues[year])}`).join(' ')
  const utilityArea = `${pad.left},${valueToY(utilityValues[0])} ${utilityLine} ${pad.left + innerWidth},${pad.top + innerHeight} ${pad.left},${pad.top + innerHeight}`

  function valueToY(value: number) {
    return pad.top + innerHeight - (value / maxValue) * innerHeight
  }

  function setYearFromPointer(clientX: number, rect: DOMRect) {
    const x = Math.min(innerWidth, Math.max(0, clientX - rect.left - pad.left))
    setHoverYear(Math.round((x / innerWidth) * 25))
  }

  return (
    <div className={`energy-chart ${large ? 'large' : ''}`} onPointerLeave={() => setHoverYear(10)}>
      <div className="energy-chart-head">
        <div>
          <span>25-year energy comparison</span>
          <strong>${formatNumber(selectedUtility - monthlySolar)}</strong>
        </div>
        <div>
          <span>Year {selectedYear}</span>
          <strong>${formatNumber(selectedUtility)} vs ${formatNumber(monthlySolar)}</strong>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Monthly utility cost compared with estimated monthly solar payment over 25 years"
        onPointerMove={(event) => setYearFromPointer(event.clientX, event.currentTarget.getBoundingClientRect())}
      >
        <defs>
          <linearGradient id="utilityFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(64, 156, 172, 0.58)" />
            <stop offset="100%" stopColor="rgba(64, 156, 172, 0.03)" />
          </linearGradient>
        </defs>
        {[0, 100, 200, 300, 400].filter((value) => value <= maxValue).map((value) => (
          <g key={value} className="chart-grid">
            <line x1={pad.left} x2={pad.left + innerWidth} y1={valueToY(value)} y2={valueToY(value)} />
            <text x={pad.left - 10} y={valueToY(value) + 4}>${value}</text>
          </g>
        ))}
        <polygon className="utility-area" points={utilityArea} />
        <polyline className="utility-line" points={utilityLine} />
        <line className="solar-line" x1={pad.left} x2={pad.left + innerWidth} y1={solarY} y2={solarY} />
        <path className="chart-future-dim" d={`M ${selectedX} ${pad.top} H ${pad.left + innerWidth} V ${pad.top + innerHeight} H ${selectedX} Z`} />
        <line className="hover-line" x1={selectedX} x2={selectedX} y1={pad.top} y2={pad.top + innerHeight} />
        <circle className="utility-dot" cx={selectedX} cy={selectedY} r="5" />
        <circle className="solar-dot" cx={selectedX} cy={solarY} r="4" />
        {[0, 5, 10, 15, 20, 25].map((year) => (
          <text className="chart-year" key={year} x={pad.left + (year / 25) * innerWidth} y={height - 12}>{year}</text>
        ))}
      </svg>
      <div className="energy-chart-legend">
        <span><i className="solar-key" />Estimated solar payment</span>
        <span><i className="utility-key" />Projected utility bill</span>
      </div>
    </div>
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

function AddressAutocompleteField({
  value,
  onChange,
  onProvinceChange,
  onStatusChange,
}: {
  value: string
  onChange: (value: string) => void
  onProvinceChange: (value: ProvinceCode) => void
  onStatusChange: (value: AddressLookupStatus) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let cancelled = false
    let listener: google.maps.MapsEventListener | null = null

    async function init() {
      const googleApi = await loadGooglePlacesScript()
      if (cancelled || !googleApi?.maps?.places || !inputRef.current) {
        onStatusChange('unavailable')
        return
      }

      const autocomplete = new googleApi.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'ca' },
        fields: ['formatted_address', 'address_components'],
        types: ['address'],
      })

      listener = autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace()
        const formattedAddress = place.formatted_address?.trim() || inputRef.current?.value.trim() || ''
        onChange(formattedAddress)

        const provinceCode = provinceCodeFromPlace(place)
        if (provinceCode) onProvinceChange(provinceCode)
      })

      onStatusChange('ready')
    }

    init()

    return () => {
      cancelled = true
      listener?.remove()
    }
  }, [onChange, onProvinceChange, onStatusChange])

  return (
    <div className="form-field">
      <label htmlFor="address">Property address</label>
      <div className="address-field">
        <input
          ref={inputRef}
          id="address"
          type="text"
          value={value}
          placeholder="Start typing your address"
          autoComplete="street-address"
          onChange={(event) => onChange(event.target.value)}
          required
        />
        <span className="address-badge">Places</span>
      </div>
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
