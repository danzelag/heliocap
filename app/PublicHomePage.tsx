"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useMemo, useState } from "react";

type UpgradeKey = "solar" | "heat" | "ev";

const upgrades: Array<{
  key: UpgradeKey;
  title: string;
  partner: string;
  label: string;
  description: string;
  image: string;
  alt: string;
  monthlyOffset: number;
}> = [
  {
    key: "solar",
    title: "Solar panels",
    partner: "Firefly Solar",
    label: "The foundation",
    description:
      "Generate your own electricity from the roof you already own. Premium panels, engineered placement, decades of clean power.",
    image: "/assets/solar-house.png",
    alt: "Home with rooftop solar",
    monthlyOffset: 92,
  },
  {
    key: "heat",
    title: "Heat pumps",
    partner: "Smarco Building Solutions",
    label: "Comfort upgrade",
    description:
      "One quiet system that heats in winter and cools in summer, running on the power you make.",
    image: "/assets/heat-pump.png",
    alt: "Heat pump unit",
    monthlyOffset: 58,
  },
  {
    key: "ev",
    title: "EV charging",
    partner: "Maxperr Energy",
    label: "Future-proof",
    description:
      "Charge at home on your own sunshine instead of buying gas. Certified chargers ready for the car in your driveway.",
    image: "/assets/ev-charger.png",
    alt: "EV charger",
    monthlyOffset: 44,
  },
];

const partners = [
  {
    name: "Firefly Solar",
    role: "Solar | panels & storage",
    logo: "/assets/logo-firefly.png",
    description:
      "One of Canada's most-reviewed solar installers, with engineering-led designs built to last 25+ years.",
    accent: "text-[#b9783f]",
  },
  {
    name: "Smarco Building Solutions",
    role: "Heating & cooling | heat pumps",
    logo: "/assets/logo-smarco.png",
    description:
      "Residential and commercial HVAC-R specialists delivering efficient heat pumps and air systems.",
    accent: "text-[#397f91]",
  },
  {
    name: "Maxperr Energy",
    role: "EV charging | infrastructure",
    logo: "/assets/logo-maxperr.png",
    description:
      "Enterprise-grade EV charging infrastructure with hardware, software, and certified installation.",
    accent: "text-[#287a54]",
  },
];

export default function PublicHomePage() {
  const [monthlyBill, setMonthlyBill] = useState(240);
  const [selected, setSelected] = useState<Record<UpgradeKey, boolean>>({
    solar: true,
    heat: true,
    ev: false,
  });

  const totals = useMemo(() => {
    const active = upgrades.filter((upgrade) => selected[upgrade.key]);
    const monthlySavings = active.reduce((sum, upgrade) => sum + upgrade.monthlyOffset, 0);
    const gridYearOne = monthlyBill * 12;
    const amberfieldYearOne = Math.max(0, gridYearOne - monthlySavings * 12);
    return {
      active,
      monthlySavings,
      yearOne: Math.max(0, gridYearOne - amberfieldYearOne),
      yearFive: Math.round((monthlySavings * 12 * 5) + monthlyBill * 1.2),
    };
  }, [monthlyBill, selected]);

  function toggleUpgrade(key: UpgradeKey) {
    setSelected((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <main className="min-h-screen bg-[#f7f4ed] text-[#302c25]">
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-[#1d1a16]/60 px-5 py-4 backdrop-blur-xl sm:px-10">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-5">
          <a href="#top" aria-label="AmberField Energy home" className="min-w-0">
            <img
              src="/assets/amberfield-logo-light.svg"
              alt="AmberField Energy"
              className="h-10 w-auto max-w-[210px] object-contain sm:h-12"
            />
          </a>
          <nav className="flex items-center gap-7">
            <div className="hidden items-center gap-7 text-sm font-medium text-white/80 md:flex">
              <a href="#solutions" className="transition hover:text-[#d29a55]">Solutions</a>
              <a href="#calculator" className="transition hover:text-[#d29a55]">Calculator</a>
              <a href="#partners" className="transition hover:text-[#d29a55]">Partners</a>
            </div>
            <Link
              href="/estimate"
              className="shrink-0 bg-[#d29a55] px-5 py-3 text-sm font-semibold text-[#1d1a16] transition hover:-translate-y-0.5 hover:bg-[#b9783f] hover:text-white"
            >
              Get an estimate
            </Link>
          </nav>
        </div>
      </header>

      <section id="top" className="relative min-h-[92vh] overflow-hidden bg-[#1d1a16] pt-28">
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_72%_22%,rgba(200,141,72,0.48),transparent_60%),linear-gradient(180deg,#654a31,#1d1a16)]" />
        <video autoPlay muted loop playsInline preload="auto" className="absolute inset-0 h-full w-full object-cover object-center">
          <source src="/assets/golden-hour.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(18,16,13,0.66)_0%,rgba(18,16,13,0.34)_34%,rgba(18,16,13,0.54)_64%,rgba(18,16,13,0.92)_96%)]" />
        <div className="relative z-10 mx-auto flex min-h-[calc(92vh-7rem)] max-w-[1180px] flex-col justify-end px-5 pb-[8vh] sm:px-10">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.3em] text-[#d29a55]">
            Your property. Your power.
          </p>
          <h1 className="max-w-[16ch] font-serif text-[clamp(44px,7.2vw,104px)] font-light leading-[0.98] tracking-normal text-[#f5f0e7]">
            Turn your roof into a <em className="text-[#d29a55]">power plant.</em>
          </h1>
          <p className="mt-6 max-w-[46ch] text-[clamp(17px,2vw,22px)] leading-normal text-white/80">
            Solar, heat pumps, and EV charging, designed, installed, and backed by Canada&apos;s best in each field.
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <Link href="/estimate" className="inline-flex items-center gap-3 bg-[#d29a55] px-8 py-4 font-semibold text-[#1d1a16] transition hover:-translate-y-0.5 hover:bg-[#b9783f] hover:text-white">
              Get an estimate <ArrowIcon />
            </Link>
            <a href="#calculator" className="inline-flex items-center border border-white/45 px-8 py-4 font-semibold text-white transition hover:bg-white/10">
              Estimate my savings
            </a>
          </div>
          <div className="mt-12 flex flex-wrap gap-x-9 gap-y-5 border-t border-white/15 pt-5">
            <HeroStat value="$2,180" label="Avg. yearly savings | est." />
            <HeroStat value="3" label="Trusted specialist partners" />
            <HeroStat value="25 yrs" label="Of clean power" />
          </div>
        </div>
      </section>

      <section id="solutions" className="px-5 py-20 sm:px-10 lg:py-32">
        <div className="mx-auto max-w-[1180px]">
          <Kicker>What we install</Kicker>
          <h2 className="mt-6 max-w-[10ch] font-serif text-[clamp(52px,9vw,128px)] font-normal leading-[0.9] tracking-normal">
            Three upgrades. <em className="text-[#b9783f]">One energy plan.</em>
          </h2>
          <p className="mt-8 max-w-[42ch] text-lg leading-8 text-[#6b6255]">
            Solar is the foundation. Add a heat pump for comfort and an EV charger when you&apos;re ready. Each upgrade stacks more savings on top.
          </p>

          <div className="mt-12 border-y border-[#302c25]/15">
            {upgrades.map((upgrade, index) => (
              <article key={upgrade.key} className="grid gap-6 border-b border-[#302c25]/10 py-8 last:border-b-0 lg:grid-cols-[auto_1fr_220px_220px] lg:items-center">
                <div className="text-sm font-semibold tabular-nums text-[#8d8272]">0{index + 1}</div>
                <div>
                  <h3 className="font-serif text-[clamp(32px,4.4vw,60px)] font-normal leading-none tracking-normal">
                    {upgrade.title}
                  </h3>
                  <p className="mt-3 max-w-[54ch] text-sm leading-6 text-[#6b6255]">{upgrade.description}</p>
                </div>
                <div className="text-left text-xs font-semibold uppercase tracking-[0.14em] text-[#8d8272] lg:text-right">
                  {upgrade.label}
                  <b className="mt-1 block font-serif text-xl font-normal normal-case tracking-normal text-[#302c25]">
                    {upgrade.partner}
                  </b>
                </div>
                <img src={upgrade.image} alt={upgrade.alt} className="h-40 w-full object-cover lg:h-32" />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="calculator" className="bg-[#1d1a16] px-5 py-20 text-[#f5f0e7] sm:px-10 lg:py-32">
        <div className="mx-auto max-w-[1180px]">
          <Kicker dark>Energy savings calculator</Kicker>
          <h2 className="mt-5 max-w-[18ch] font-serif text-[clamp(34px,5vw,66px)] font-light leading-none tracking-normal">
            See what rising energy costs are really <em className="text-[#d29a55]">costing you.</em>
          </h2>
          <p className="mt-5 max-w-[60ch] text-white/70">
            Ontario demand rose 4.4% in 2025. Model how locking in your own power changes the math.
          </p>

          <div className="mt-12 grid gap-10 lg:grid-cols-[0.82fr_1.18fr]">
            <div>
              <div className="mb-4 flex items-baseline justify-between gap-4 text-xs font-semibold uppercase tracking-[0.12em] text-white/60">
                Average monthly energy bill
                <b className="font-serif text-3xl font-normal normal-case tracking-normal text-[#d29a55]">${monthlyBill}</b>
              </div>
              <input
                type="range"
                min="80"
                max="600"
                step="10"
                value={monthlyBill}
                onChange={(event) => setMonthlyBill(Number(event.target.value))}
                className="w-full accent-[#d29a55]"
              />
              <div className="mt-1 flex justify-between text-xs text-white/40">
                <span>$80</span>
                <span>$600+</span>
              </div>

              <div className="mt-8 text-xs font-semibold uppercase tracking-[0.12em] text-white/60">
                Upgrades I&apos;m considering
              </div>
              <div className="mt-3 grid gap-3">
                {upgrades.map((upgrade) => (
                  <button
                    key={upgrade.key}
                    type="button"
                    onClick={() => toggleUpgrade(upgrade.key)}
                    className={`flex items-center gap-4 border p-4 text-left transition ${
                      selected[upgrade.key]
                        ? "border-[#d29a55] bg-[#d29a55]/10"
                        : "border-white/20 hover:border-white/40"
                    }`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${selected[upgrade.key] ? "border-[#d29a55] bg-[#d29a55]" : "border-white/35"}`}>
                      {selected[upgrade.key] ? <CheckIcon /> : null}
                    </span>
                    <span className="flex-1">
                      <span className="block font-semibold text-white">{upgrade.title}</span>
                      <span className="text-xs text-white/55">{upgrade.partner}</span>
                    </span>
                    <span className="font-serif text-xl text-[#d29a55]">${upgrade.monthlyOffset}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="border border-white/15 bg-white/[0.04] p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="font-serif text-2xl font-normal tracking-normal text-white">Estimated savings</h3>
                <span className="text-xs text-white/50">Illustrative residential model</span>
              </div>
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <Metric label="Monthly reduction" value={`$${totals.monthlySavings}`} />
                <Metric label="Year one" value={`$${totals.yearOne.toLocaleString()}`} />
                <Metric label="Five year view" value={`$${totals.yearFive.toLocaleString()}`} />
              </div>
              <div className="mt-8 h-64 border-l border-b border-white/15 p-4">
                <div className="flex h-full items-end gap-4">
                  {[1, 2, 3, 4, 5].map((year) => {
                    const grid = monthlyBill * 12 * Math.pow(1.044, year - 1);
                    const modeled = Math.max(0, grid - totals.monthlySavings * 12);
                    return (
                      <div key={year} className="flex flex-1 items-end justify-center gap-1">
                        <Bar value={grid} max={monthlyBill * 12 * 1.24} tone="grid" />
                        <Bar value={modeled} max={monthlyBill * 12 * 1.24} tone="amberfield" />
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-4 flex gap-5 text-xs text-white/55">
                <span><i className="mr-2 inline-block h-2 w-2 rounded-full bg-[#b9783f]" />Grid bill</span>
                <span><i className="mr-2 inline-block h-2 w-2 rounded-full bg-[#75b889]" />With AmberField</span>
              </div>
              <Link href="/estimate" className="mt-6 inline-flex w-full items-center justify-center gap-3 bg-[#d29a55] px-8 py-4 font-semibold text-[#1d1a16] transition hover:bg-[#b9783f] hover:text-white">
                Get my exact numbers <ArrowIcon />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="partners" className="bg-[#f1ece2] px-5 py-20 sm:px-10 lg:py-32">
        <div className="mx-auto max-w-[1180px]">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <Kicker>Our specialist partners</Kicker>
              <h2 className="mt-5 font-serif text-[clamp(34px,5vw,66px)] font-light leading-none tracking-normal">
                The best in <em className="text-[#b9783f]">every field.</em>
              </h2>
            </div>
            <p className="max-w-[42ch] text-lg leading-8 text-[#6b6255]">
              AmberField brings together category leaders for each upgrade, vetted, certified, and accountable through one point of contact.
            </p>
          </div>
          <div className="mt-12 grid border border-[#302c25]/15 bg-[#302c25]/15 lg:grid-cols-3">
            {partners.map((partner) => (
              <article key={partner.name} className="bg-[#f7f4ed] p-8 text-center">
                <div className="mx-auto flex h-20 max-w-[220px] items-center justify-center">
                  <img src={partner.logo} alt={partner.name} className="max-h-full w-auto object-contain" />
                </div>
                <div className={`mt-8 text-xs font-semibold uppercase tracking-[0.16em] ${partner.accent}`}>
                  {partner.role}
                </div>
                <h3 className="mt-2 font-serif text-2xl font-normal tracking-normal">{partner.name}</h3>
                <p className="mt-3 text-sm leading-6 text-[#6b6255]">{partner.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-20 sm:px-10 lg:py-32">
        <div className="mx-auto max-w-[1180px]">
          <Kicker>How it works</Kicker>
          <h2 className="mt-5 max-w-[16ch] font-serif text-[clamp(34px,5vw,66px)] font-light leading-none tracking-normal">
            From estimate to switched-on.
          </h2>
          <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            <Step number="01" title="Tell us about your home">Two minutes on one short form: address, bill, and what you&apos;re interested in.</Step>
            <Step number="02" title="Get your free estimate">We model your roof, sun exposure, and rates within 24 hours.</Step>
            <Step number="03" title="Meet your advisor">One human walks you through the plan and matches the right partners.</Step>
            <Step number="04" title="We install and you save">Our specialists handle the work. AmberField manages it end to end.</Step>
          </div>
        </div>
      </section>

      <section className="relative flex min-h-[80vh] items-center justify-center overflow-hidden bg-[#1d1a16] px-5 py-20 text-center sm:px-10">
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_30%,rgba(201,139,70,0.38),transparent_60%),linear-gradient(180deg,#4e3925,#1d1a16)]" />
        <video muted playsInline autoPlay loop preload="auto" className="absolute inset-0 h-full w-full object-cover">
          <source src="/assets/cta-savings.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-[radial-gradient(80%_80%_at_50%_50%,rgba(18,16,13,0.36),rgba(18,16,13,0.78))]" />
        <div className="relative max-w-[660px] border border-white/15 bg-[#1d1a16]/45 px-6 py-12 shadow-[0_50px_110px_-50px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:px-14">
          <Kicker dark>Your property. Your power.</Kicker>
          <h2 className="mx-auto mt-6 max-w-[16ch] font-serif text-[clamp(34px,5.2vw,64px)] font-light leading-none tracking-normal text-white">
            Find out what your property could be <em className="text-[#d29a55]">saving you.</em>
          </h2>
          <Link href="/estimate" className="mt-9 inline-flex items-center gap-3 bg-[#d29a55] px-8 py-4 font-semibold text-[#1d1a16] transition hover:bg-[#b9783f] hover:text-white">
            Get an estimate <ArrowIcon />
          </Link>
        </div>
      </section>

      <footer className="bg-[#1d1a16] px-5 py-14 text-xs leading-6 text-white/45 sm:px-10">
        <div className="mx-auto grid max-w-[1180px] gap-10 md:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <img src="/assets/amberfield-logo-light.svg" alt="AmberField Energy" className="h-9 w-auto" />
            <p className="mt-4 font-serif text-xl italic text-white/80">Your property. Your power.</p>
          </div>
          <FooterLinks title="Solutions" links={["Solar panels", "Heat pumps", "EV charging", "Savings calculator"]} />
          <FooterLinks title="Company" links={["Our partners", "Get an estimate", "Estimate savings"]} />
          <p className="border-t border-white/10 pt-6 md:col-span-3">
            <b className="font-semibold text-white/70">About these numbers.</b> Savings and payment figures are illustrative estimates based on typical homes, local sun data, and current utility rates. Your personalized estimate is modeled on your specific property and bill. Installation services are delivered by independent partner companies. © 2026 AmberField Energy.
          </p>
        </div>
      </footer>
    </main>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-[130px] border-r border-white/15 pr-9 last:border-r-0">
      <div className="font-serif text-4xl text-white">{value}</div>
      <div className="mt-2 text-xs uppercase tracking-[0.12em] text-white/50">{label}</div>
    </div>
  );
}

function Kicker({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div className={`inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.24em] ${dark ? "text-[#d29a55]" : "text-[#b9783f]"}`}>
      <span className="h-px w-7 bg-[#d29a55]" />
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/15 bg-white/[0.04] p-4">
      <div className="text-xs uppercase tracking-[0.12em] text-white/45">{label}</div>
      <div className="mt-2 font-serif text-3xl text-white">{value}</div>
    </div>
  );
}

function Bar({ value, max, tone }: { value: number; max: number; tone: "grid" | "amberfield" }) {
  const height = Math.max(12, Math.min(100, (value / max) * 100));
  return (
    <span
      className={`w-5 ${tone === "grid" ? "bg-[#b9783f]" : "bg-[#75b889]"}`}
      style={{ height: `${height}%` }}
    />
  );
}

function Step({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <article>
      <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#d29a55] font-semibold text-[#b9783f]">
        {number}
      </div>
      <h3 className="mt-6 font-serif text-2xl font-normal tracking-normal">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-[#6b6255]">{children}</p>
    </article>
  );
}

function FooterLinks({ title, links }: { title: string; links: string[] }) {
  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/50">{title}</h3>
      {links.map((link) => (
        <a key={link} href={link === "Get an estimate" ? "/estimate" : "#solutions"} className="block py-1 text-white/60 transition hover:text-[#d29a55]">
          {link}
        </a>
      ))}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg className="h-3 w-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
      <path d="M5 12l5 5 9-11" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
