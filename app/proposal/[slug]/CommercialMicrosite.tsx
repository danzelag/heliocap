"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import type { Prospect } from "@/lib/types";

type Props = {
  prospect: Prospect;
  bookingUrl: string | null;
  contactEmail: string | null;
};

const COMMERCIAL_FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1800&q=80";

export function CommercialMicrosite({ prospect, bookingUrl, contactEmail }: Props) {
  const { pageProgress, heroProgress } = useProposalScroll("commercialHero");
  const solarData = hasSolarData(prospect);
  const evData = hasEvData(prospect);
  const hasSolar = prospect.include_solar === true || (prospect.include_solar !== false && solarData);
  const hasEv = prospect.include_ev === true || (prospect.include_ev !== false && evData);
  const offer = hasSolar && hasEv ? "Solar + EV" : hasSolar ? "Solar" : hasEv ? "EV charging" : "Assessment";
  const displayName = prospect.company_name ?? prospect.address;
  const heroVideo = hasSolar ? prospect.video_url : hasEv ? prospect.ev_video_url : null;
  const heroPoster = (hasSolar ? prospect.video_thumbnail_url : prospect.ev_video_thumbnail_url) ?? prospect.satellite_image_url;
  const primaryHref =
    bookingUrl ??
    `mailto:${contactEmail ?? ""}?subject=${encodeURIComponent(`Commercial energy proposal - ${prospect.address}`)}`;
  const solarAnnual = hasSolar ? prospect.yearly_savings ?? 0 : 0;
  const evAnnual = hasEv ? prospect.ev_charger_annual_value ?? 0 : 0;
  const combinedAnnual = solarAnnual + evAnnual;
  const solarLifetime = hasSolar ? prospect.savings_25yr ?? solarAnnual * 21 : 0;
  const evLifetime = hasEv ? evAnnual * 10 : 0;
  const lifetimeValue = solarLifetime + evLifetime;
  const panelCount = Math.max(Math.min(prospect.panel_count ?? 112, 140), 40);
  const litPanels = Math.round(clamp((heroProgress - 0.18) / 0.52) * panelCount);
  const wipe = clamp((heroProgress - 0.1) / 0.5);
  const secondHeadline = heroProgress > 0.5;
  const roofSize = prospect.sqft ? `${num(prospect.sqft)} sq ft` : "this";
  const co2 = prospect.yearly_kwh ? Math.round(prospect.yearly_kwh * 0.000356) : null;

  const readout = secondHeadline
    ? `${prospect.system_kw ? `${num(prospect.system_kw)} kW` : "SYSTEM"} · ${prospect.panel_count ? `${num(prospect.panel_count)} MODULES` : "MODULES"}`
    : `${prospect.sqft ? `${num(prospect.sqft)} SQFT ROOF` : "PROPERTY ROOF"}`;

  const config = useMemo(() => {
    if (hasSolar && hasEv) return "both";
    if (hasSolar) return "solar";
    if (hasEv) return "ev";
    return "unknown";
  }, [hasEv, hasSolar]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f8faf9] text-[#252b32] [font-family:var(--font-instrument),ui-sans-serif,system-ui,sans-serif]">
      <div className="fixed left-0 top-0 z-[80] h-0.5 bg-[#2f9d83] transition-[width] duration-100" style={{ width: `${pageProgress * 100}%` }} />
      <div className="pointer-events-none fixed left-0 right-0 top-0 z-[70] flex items-center justify-between px-5 py-4 mix-blend-difference sm:px-10">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 bg-[#2f9d83]" />
          <span className="text-sm font-bold uppercase tracking-[0.16em] text-white">Meridian Commercial</span>
        </div>
        <span className="hidden text-[10px] uppercase tracking-[0.16em] text-white/65 [font-family:var(--font-jetbrains),ui-monospace,monospace] sm:inline">
          Confidential proposal · Jun 2026
        </span>
      </div>

      <section id="commercialHero" className="relative h-[300svh] bg-[#1f242c]">
        <div className="sticky top-0 h-[100svh] overflow-hidden bg-[#1f242c]">
          <div className="absolute inset-0">
            <HeroMedia src={heroVideo} poster={heroPoster} fallback={COMMERCIAL_FALLBACK_IMAGE} />
            <div
              className="absolute inset-0"
              style={{ clipPath: `inset(${(100 - wipe * 100).toFixed(1)}% 0 0 0)` }}
            >
              <HeroMedia src={heroVideo} poster={heroPoster} fallback={COMMERCIAL_FALLBACK_IMAGE} after />
              {hasSolar ? (
                <div className="absolute left-[18%] top-[30%] grid h-[42%] w-[58%] origin-center [grid-template-columns:repeat(14,minmax(0,1fr))] [transform:perspective(1100px)_rotateX(58deg)_rotateZ(-14deg)] gap-px">
                  {Array.from({ length: panelCount }).map((_, index) => (
                    <span
                      key={index}
                      className={`min-h-2 border border-[#b7c5e7]/40 bg-[linear-gradient(150deg,#35477f,#1b243c)] transition duration-500 ${
                        index < litPanels ? "scale-100 opacity-100" : "scale-50 opacity-0"
                      }`}
                    />
                  ))}
                </div>
              ) : null}
            </div>
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,18,24,.52)_0%,rgba(15,18,24,.08)_28%,rgba(15,18,24,.12)_48%,rgba(15,18,24,.84)_100%)]" />
            <span className="absolute left-5 top-20 z-10 border border-white/18 px-2.5 py-1 text-[9px] uppercase tracking-[0.12em] text-white/45 [font-family:var(--font-jetbrains),ui-monospace,monospace] sm:left-10">
              {secondHeadline ? (hasSolar ? "Render complete · modules placed" : "EV charger proposal loaded") : mediaLabel(hasSolar, hasEv)}
            </span>
            <div className="absolute right-10 top-20 z-10 hidden text-right text-[10px] uppercase leading-5 tracking-[0.1em] text-white/50 [font-family:var(--font-jetbrains),ui-monospace,monospace] sm:block">
              {readout}<br /><b className="text-[#2f9d83]">{secondHeadline ? qualifiedLabel(hasSolar, hasEv) : "STANDBY"}</b>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 z-20">
            <div className="mx-auto w-full max-w-[1160px] px-5 pb-8 sm:px-10 sm:pb-11">
              <p className="mb-4 text-[11px] uppercase tracking-[0.18em] text-white/65 [font-family:var(--font-jetbrains),ui-monospace,monospace]">
                Confidential {offer.toLowerCase()} proposal for <b className="text-[#2f9d83]">{displayName}</b>
              </p>
              <div className="relative h-[clamp(118px,17vw,210px)]">
                <h1
                  className="absolute bottom-0 left-0 max-w-[18ch] text-[clamp(34px,5.6vw,80px)] font-semibold leading-none tracking-[-.028em] text-[#f3f6f3]"
                  style={{ opacity: secondHeadline ? 0 : 1, transform: secondHeadline ? "translateY(-20px)" : "none", transition: "opacity .7s ease, transform .7s cubic-bezier(.2,.7,.2,1)" }}
                >
                  {hasSolar ? `${roofSize} of roof. Right now it is just overhead.` : hasEv ? "Parking capacity, ready for a charging strategy." : "Your property assessment is in progress."}
                </h1>
                <h1
                  className="absolute bottom-0 left-0 max-w-[18ch] text-[clamp(34px,5.6vw,80px)] font-semibold leading-none tracking-[-.028em] text-[#f3f6f3]"
                  style={{ opacity: secondHeadline ? 1 : 0, transform: secondHeadline ? "none" : "translateY(20px)", transition: "opacity .7s ease, transform .7s cubic-bezier(.2,.7,.2,1)" }}
                >
                  {hasSolar ? `${roofSize} of roof — now a ${money(lifetimeValue || solarLifetime)} asset.` : hasEv ? "Parking becomes a measurable energy revenue stream." : "A complete proposal will land here shortly."}
                </h1>
              </div>
              <div className="mt-7 flex items-end justify-between gap-6 border-t border-white/15 pt-5">
                <div className="text-xs uppercase tracking-[0.04em] text-white/75 [font-family:var(--font-jetbrains),ui-monospace,monospace]">
                  {prospect.address} · {prospect.city || "Ontario"}
                </div>
                <div className="hidden flex-col items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-white/45 transition-opacity [font-family:var(--font-jetbrains),ui-monospace,monospace] sm:flex" style={{ opacity: heroProgress > 0.08 ? 0 : 1 }}>
                  <span>Scroll</span>
                  <span className="relative h-9 w-px overflow-hidden bg-white/30">
                    <span className="absolute inset-x-0 top-0 h-2/5 animate-pulse bg-[#2f9d83]" />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {!hasSolar && !hasEv ? (
        <AssessmentState prospect={prospect} primaryHref={primaryHref} bookingUrl={bookingUrl} />
      ) : (
        <>
          {hasSolar ? <SolarSection prospect={prospect} co2={co2} /> : null}
          {hasEv ? <EvSection prospect={prospect} /> : null}
          <FinancialSummary
            prospect={prospect}
            hasSolar={hasSolar}
            hasEv={hasEv}
            combinedAnnual={combinedAnnual}
            lifetimeValue={lifetimeValue}
            co2={co2}
          />
        </>
      )}

      <section className="px-5 py-[clamp(86px,12vh,156px)] sm:px-10">
        <div className="mx-auto grid max-w-[1160px] items-center gap-12 md:grid-cols-[1.1fr_.9fr]">
          <div>
            <Kick>Next step</Kick>
            <h2 className="mt-5 text-[clamp(32px,4.6vw,58px)] font-semibold leading-[1.02] tracking-[-.022em]">
              A 30-minute<br />discovery call.
            </h2>
            <p className="mt-5 max-w-[48ch] text-[clamp(17px,1.9vw,21px)] leading-[1.62] text-[#5c6870]">
              We will walk through the model, confirm roof and load data, and outline financing and incentive timing. No obligation, just a working session to pressure-test the numbers.
            </p>
          </div>
          <div className="border border-[#252b32]/22 bg-[#f8faf9] p-8">
            <a
              href={primaryHref}
              target={bookingUrl ? "_blank" : undefined}
              rel={bookingUrl ? "noopener noreferrer" : undefined}
              className="flex w-full items-center justify-center gap-3 bg-[#252b32] px-5 py-4 text-sm font-semibold text-[#f8faf9] transition hover:-translate-y-0.5 hover:bg-[#2f9d83]"
            >
              Book a discovery call <span aria-hidden>→</span>
            </a>
            <CtaRow label="Prepared for" value={`${prospect.owner_name ?? "Decision maker"}${prospect.owner_title ? ` · ${prospect.owner_title}` : ""}`} />
            <CtaRow label="Property" value={`${prospect.sqft ? `${num(prospect.sqft)} sq ft · ` : ""}${prospect.year_built ? `built ${prospect.year_built} · ` : ""}${prospect.industry ?? "commercial"}`} />
            <CtaRow label="Contact" value={contactEmail ?? "deals@heliocap.energy"} accent />
          </div>
        </div>
      </section>

      <OfferConfigurations active={config} />

      <footer className="border-t border-white/10 bg-[#1f242c] px-5 py-10 text-[11.5px] leading-7 text-white/42 sm:px-10">
        <div className="mx-auto grid max-w-[1160px] gap-8 md:grid-cols-[1fr_2fr]">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 bg-[#2f9d83]" />
            <span className="font-bold uppercase tracking-[0.16em] text-white/70">Meridian Commercial</span>
          </div>
          <p>
            <b className="font-semibold text-white/70">About these figures.</b> Savings, payback, incentive, and 25-year values are modeled estimates derived from roof geometry, local irradiance, current utility rates, and standard equipment performance. They are marked <span className="text-white/70">Est.</span> and are not a quote, offer, or guarantee.
          </p>
        </div>
      </footer>
    </main>
  );
}

function SolarSection({ prospect, co2 }: { prospect: Prospect; co2: number | null }) {
  return (
    <section className="px-5 py-[clamp(86px,12vh,156px)] sm:px-10">
      <div className="mx-auto max-w-[1160px]">
        <Kick>01 — Rooftop Solar</Kick>
        <h2 className="mt-5 max-w-[20ch] text-[clamp(32px,4.6vw,58px)] font-semibold leading-[1.02] tracking-[-.022em]">
          A {prospect.system_kw ? `${num(prospect.system_kw)} kW` : "site-sized"} array, sized to your <em className="not-italic text-[#2f806d]">load profile.</em>
        </h2>
        <p className="mt-5 max-w-[48ch] text-[clamp(17px,1.9vw,21px)] leading-[1.62] text-[#5c6870]">
          Modeled on roof geometry, local irradiance, and current commercial rates. Figures are estimates pending confirmed site assessment.
        </p>
        <div className="mt-12 grid border border-[#252b32]/22 md:grid-cols-2">
          <DataCell label="Year-1 energy savings" value={`${money(prospect.yearly_savings ?? 0)} /yr`} energy />
          <DataCell label="25-year net" value={prospect.savings_25yr ? compactMoney(prospect.savings_25yr) : "Pending"} />
          <DataCell label="System size (DC)" value={prospect.system_kw ? `${num(prospect.system_kw)} kW` : "Pending"} />
          <DataCell label="Modules" value={prospect.panel_count ? num(prospect.panel_count) : "Pending"} />
        </div>
        <div className="mt-12 grid gap-px border border-[#252b32]/12 bg-[#252b32]/12 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureCell label="kWh / year" value={prospect.yearly_kwh ? compactNumber(prospect.yearly_kwh) : "Pending"} />
          <FeatureCell label="Incentive stack" value={prospect.incentive_amount ? money(prospect.incentive_amount) : "TBD"} energy />
          <FeatureCell label="Simple payback" value={payback(prospect)} />
          <FeatureCell label="CO₂ offset / yr" value={co2 ? `${num(co2)} t` : "Pending"} />
        </div>
      </div>
    </section>
  );
}

function EvSection({ prospect }: { prospect: Prospect }) {
  return (
    <section className="bg-[#f1f5f5] px-5 py-[clamp(86px,12vh,156px)] sm:px-10">
      <div className="mx-auto max-w-[1160px]">
        <Kick>02 — EV Charging</Kick>
        <h2 className="mt-5 max-w-[20ch] text-[clamp(32px,4.6vw,58px)] font-semibold leading-[1.02] tracking-[-.022em]">
          Turn parking into <em className="not-italic text-[#2f806d]">recurring value.</em>
        </h2>
        <div className="mt-11 grid items-center gap-12 lg:grid-cols-[1.05fr_.95fr]">
          <div className="relative aspect-video overflow-hidden border border-[#252b32]/22 bg-[#0e1418]">
            {prospect.ev_video_url ? (
              <video
                src={prospect.ev_video_url}
                poster={prospect.ev_video_thumbnail_url ?? prospect.satellite_image_url ?? undefined}
                autoPlay
                muted
                loop
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : prospect.satellite_image_url ? (
              <img src={prospect.satellite_image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />
            ) : (
              <div className="absolute inset-0 bg-[repeating-linear-gradient(125deg,rgba(255,255,255,.04)_0_1px,transparent_1px_13px)]" />
            )}
            <span className="absolute left-4 top-4 border border-white/20 px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-white/50 [font-family:var(--font-jetbrains),ui-monospace,monospace]">
              EV charger flyover
            </span>
            {!prospect.ev_video_url ? (
              <span className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 text-white">▶</span>
            ) : null}
          </div>
          <div>
            <p className="text-lg leading-8 text-[#5c6870]">
              {prospect.ev_charger_notes || "Charging is modeled for tenant amenity, staff use, or fleet operations, with charger count and utilization confirmed in discovery."}
            </p>
            <div className="mt-7 border-t border-[#252b32]/12">
              <EvRow label="Charging ports" value={prospect.ev_charger_count ? num(prospect.ev_charger_count) : "Pending"} />
              <EvRow label="Annual value" value={`${money(prospect.ev_charger_annual_value ?? 0)} / yr`} energy />
              <EvRow label="Utilization basis" value="Tenant + fleet" />
              <EvRow label="Notes" value={prospect.ev_charger_notes ? "Provided" : "Networked · OCPP-ready"} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinancialSummary({
  prospect,
  hasSolar,
  hasEv,
  combinedAnnual,
  lifetimeValue,
  co2,
}: {
  prospect: Prospect;
  hasSolar: boolean;
  hasEv: boolean;
  combinedAnnual: number;
  lifetimeValue: number;
  co2: number | null;
}) {
  return (
    <section className="bg-[#1f242c] px-5 py-[clamp(86px,12vh,156px)] text-[#f3f6f3] sm:px-10">
      <div className="mx-auto max-w-[1160px]">
        <Kick night>03 — The investment</Kick>
        <div className="mt-8 grid items-end gap-12 lg:grid-cols-[1.1fr_.9fr]">
          <div className="text-[clamp(72px,12vw,158px)] font-light leading-[.82] tracking-[-.03em] text-white [font-family:var(--font-newsreader),Georgia,serif]">
            {payback(prospect)}
            <span className="mt-5 block text-xs uppercase tracking-[0.16em] text-white/55 [font-family:var(--font-jetbrains),ui-monospace,monospace]">
              Simple payback <Estimate night /> · then operating upside
            </span>
          </div>
          <div>
            <div className="border-t border-white/15">
              <RoiLine label="Combined year-1 value" value={money(combinedAnnual)} energy />
              <RoiLine label="25-year lifetime value" value={money(lifetimeValue)} />
              <RoiLine label="Incentive stack applied" value={prospect.incentive_amount ? money(prospect.incentive_amount) : "To confirm"} />
              <RoiLine label="CO₂ offset over life" value={co2 && hasSolar ? `${num(co2 * 25)} t` : "Pending"} />
            </div>
            <p className="mt-6 max-w-[44ch] text-sm leading-7 text-white/50">
              Incentives are modeled at current program rates and applied against installed cost. The summary reflects {hasSolar && hasEv ? "solar and EV charging" : hasSolar ? "solar" : "EV charging"} only.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function AssessmentState({
  prospect,
  primaryHref,
  bookingUrl,
}: {
  prospect: Prospect;
  primaryHref: string;
  bookingUrl: string | null;
}) {
  return (
    <section className="bg-[#f1f5f5] px-5 py-[clamp(86px,12vh,156px)] sm:px-10">
      <div className="mx-auto max-w-[1160px]">
        <div className="border border-[#252b32]/22 bg-[linear-gradient(180deg,#1f242c,#2a3038)] p-11 text-center text-[#f3f6f3]">
          <span className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/30">
            <span className="h-2.5 w-2.5 rounded-full bg-[#2f9d83]" />
          </span>
          <h2 className="mt-5 text-3xl font-semibold">Assessment in progress</h2>
          <p className="mx-auto mt-4 max-w-[42ch] text-sm leading-7 text-white/62">
            We are modeling {prospect.address} now: roof geometry, irradiance, load profile, and EV fit. The full proposal will land here once products are qualified.
          </p>
          <a
            href={primaryHref}
            target={bookingUrl ? "_blank" : undefined}
            rel={bookingUrl ? "noopener noreferrer" : undefined}
            className="mt-7 inline-flex bg-[#2f9d83] px-5 py-3 text-sm font-semibold text-[#101817]"
          >
            Book a discovery call
          </a>
        </div>
      </div>
    </section>
  );
}

function OfferConfigurations({ active }: { active: "solar" | "ev" | "both" | "unknown" }) {
  const configs = [
    ["solar", "Config A", "Solar only", "Hero solar video, solar data band, ROI. EV section omitted entirely."],
    ["both", "Config B", "Solar + EV", "Both sections render, each with its own media. ROI combines annual and lifetime value."],
    ["ev", "Config C", "EV only", "Hero uses EV media. Solar section omitted. ROI reframes around charging value."],
    ["unknown", "Config D", "Unknown", "No confirmed products, so the assessment-in-progress state replaces product sections."],
  ] as const;

  return (
    <section className="border-t border-[#252b32]/22 bg-[#edf1f1] px-5 py-[clamp(70px,10vh,120px)] sm:px-10">
      <div className="mx-auto max-w-[1160px]">
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-[#7b878e] [font-family:var(--font-jetbrains),ui-monospace,monospace]">
          <span className="h-2 w-2 bg-[#2f9d83]" /> Build note · not part of the client proposal
        </div>
        <h2 className="mt-4 text-[clamp(24px,3vw,34px)] font-semibold">Four offer configurations the template handles</h2>
        <p className="mt-2 max-w-[60ch] text-sm leading-7 text-[#5c6870]">
          Sections appear only when their include flags are true. Each product uses its own uploaded video or falls back to the satellite still, so the page never looks broken.
        </p>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {configs.map(([key, tag, title, copy]) => (
            <div key={key} className={`border bg-[#f8faf9] p-5 ${active === key ? "border-[#2f9d83] shadow-[0_0_0_1px_#2f9d83_inset]" : "border-[#252b32]/22"}`}>
              <div className="text-[9.5px] uppercase tracking-[0.1em] text-[#2f806d] [font-family:var(--font-jetbrains),ui-monospace,monospace]">{tag}{active === key ? " · shown" : ""}</div>
              <h3 className="mt-2 text-base font-semibold">{title}</h3>
              <p className="mt-2 text-[12.5px] leading-5 text-[#7b878e]">{copy}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HeroMedia({ src, poster, fallback, after }: { src: string | null; poster: string | null; fallback: string; after?: boolean }) {
  if (src) {
    return (
      <video
        src={src}
        poster={poster ?? undefined}
        autoPlay
        muted
        loop
        playsInline
        className={`absolute inset-0 h-full w-full object-cover ${after ? "brightness-110 saturate-110" : "opacity-75"}`}
      />
    );
  }
  if (poster) {
    return <img src={poster} alt="" className={`absolute inset-0 h-full w-full object-cover ${after ? "brightness-110 saturate-110" : "opacity-60"}`} />;
  }
  return (
    <>
      <img src={fallback} alt="" className={`absolute inset-0 h-full w-full object-cover ${after ? "brightness-110 saturate-110" : "opacity-60"}`} />
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_60%_22%,rgba(70,92,103,.45),transparent_60%),repeating-linear-gradient(90deg,rgba(255,255,255,.03)_0_1px,transparent_1px_64px),repeating-linear-gradient(0deg,rgba(255,255,255,.03)_0_1px,transparent_1px_64px)]" />
    </>
  );
}

function Kick({ children, night }: { children: React.ReactNode; night?: boolean }) {
  return (
    <div className={`inline-flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] [font-family:var(--font-jetbrains),ui-monospace,monospace] ${night ? "text-[#2f9d83]" : "text-[#2f806d]"}`}>
      <span className="h-px w-6 bg-[#2f9d83]" />
      {children}
    </div>
  );
}

function DataCell({ label, value, energy }: { label: string; value: string; energy?: boolean }) {
  return (
    <div className="border-b border-r border-[#252b32]/12 p-7 even:border-r-0">
      <div className={`text-[clamp(40px,5vw,62px)] font-light leading-[.92] tracking-[-.02em] [font-family:var(--font-newsreader),Georgia,serif] ${energy ? "text-[#2f806d]" : ""}`}>{value}</div>
      <div className="mt-4 text-[10.5px] uppercase tracking-[0.12em] text-[#7b878e] [font-family:var(--font-jetbrains),ui-monospace,monospace]">{label} <Estimate /></div>
    </div>
  );
}

function FeatureCell({ label, value, energy }: { label: string; value: string; energy?: boolean }) {
  return (
    <div className="bg-[#f8faf9] p-6">
      <div className={`text-[clamp(34px,4vw,48px)] font-light leading-none [font-family:var(--font-newsreader),Georgia,serif] ${energy ? "text-[#2f806d]" : ""}`}>{value}</div>
      <div className="mt-3 text-[10px] uppercase tracking-[0.1em] text-[#7b878e] [font-family:var(--font-jetbrains),ui-monospace,monospace]">{label}</div>
    </div>
  );
}

function EvRow({ label, value, energy }: { label: string; value: string; energy?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-5 border-b border-[#252b32]/12 py-4">
      <span className="text-sm text-[#5c6870]">{label}</span>
      <span className={`text-[15px] [font-family:var(--font-jetbrains),ui-monospace,monospace] ${energy ? "text-[#2f806d]" : "text-[#252b32]"}`}>{value}</span>
    </div>
  );
}

function RoiLine({ label, value, energy }: { label: string; value: string; energy?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-5 border-b border-white/15 py-4">
      <span className="text-sm text-white/66">{label}</span>
      <span className={`text-[15px] [font-family:var(--font-jetbrains),ui-monospace,monospace] ${energy ? "text-[#2f9d83]" : "text-white"}`}>{value}</span>
    </div>
  );
}

function CtaRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex gap-4 border-t border-[#252b32]/12 py-4 text-sm text-[#5c6870] first-of-type:mt-6">
      <span className="w-20 flex-none text-[10px] uppercase tracking-[0.12em] text-[#7b878e] [font-family:var(--font-jetbrains),ui-monospace,monospace]">{label}</span>
      <span className={accent ? "font-semibold text-[#2f806d]" : ""}>{value}</span>
    </div>
  );
}

function Estimate({ night }: { night?: boolean }) {
  return <span className={`ml-1 align-[.5em] text-[.5em] uppercase tracking-[0.08em] ${night ? "text-white/55" : "text-[#7b878e]"}`}>Est.</span>;
}

function useProposalScroll(heroId: string) {
  const [pageProgress, setPageProgress] = useState(0);
  const [heroProgress, setHeroProgress] = useState(0);

  useEffect(() => {
    let ticking = false;
    function update() {
      ticking = false;
      const docTotal = Math.max(document.body.scrollHeight - window.innerHeight, 1);
      setPageProgress(clamp(window.scrollY / docTotal));
      const hero = document.getElementById(heroId);
      if (!hero) return;
      const rect = hero.getBoundingClientRect();
      const total = Math.max(hero.offsetHeight - window.innerHeight, 1);
      setHeroProgress(clamp(-rect.top / total));
    }
    function onScroll() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
    };
  }, [heroId]);

  return { pageProgress, heroProgress };
}

function hasSolarData(prospect: Prospect) {
  return Boolean(
    prospect.video_url ||
      prospect.yearly_savings ||
      prospect.system_kw ||
      prospect.panel_count ||
      prospect.savings_25yr ||
      prospect.yearly_kwh ||
      prospect.system_cost ||
      prospect.incentive_amount
  );
}

function hasEvData(prospect: Prospect) {
  return Boolean(
    prospect.ev_video_url ||
      prospect.ev_charger_count ||
      prospect.ev_charger_annual_value ||
      prospect.ev_charger_notes
  );
}

function mediaLabel(hasSolar: boolean, hasEv: boolean) {
  if (hasSolar) return "Solar flyover · poster frame";
  if (hasEv) return "EV charger flyover · poster frame";
  return "Assessment preview";
}

function qualifiedLabel(hasSolar: boolean, hasEv: boolean) {
  if (hasSolar && hasEv) return "SOLAR + EV QUALIFIED";
  if (hasSolar) return "SOLAR QUALIFIED";
  if (hasEv) return "EV QUALIFIED";
  return "IN PROGRESS";
}

function payback(prospect: Prospect) {
  const annual = prospect.yearly_savings ?? 0;
  const cost = Math.max((prospect.system_cost ?? 0) - (prospect.incentive_amount ?? 0), 0);
  return annual && cost ? `${(cost / annual).toFixed(1)} yrs` : "Pending";
}

function compactMoney(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "$0";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 2)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return money(value);
}

function compactNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 2)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return num(value);
}

function money(value: number) {
  return `$${Math.round(Number.isFinite(value) ? value : 0).toLocaleString("en-CA")}`;
}

function num(value: number) {
  return Math.round(Number.isFinite(value) ? value : 0).toLocaleString("en-CA");
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}
