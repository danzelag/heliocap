"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import { getHeroScrollSvh, ScrollScrubVideo, useProposalScroll } from "./scrollScrub";
import type { Prospect } from "@/lib/types";

type Props = {
  prospect: Prospect;
  bookingUrl: string | null;
  contactEmail: string | null;
};

type PackageKey = "solar" | "heat" | "ev";

const RES_FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?auto=format&fit=crop&w=1800&q=80";

export function ResidentialMicrosite({ prospect, bookingUrl, contactEmail }: Props) {
  const [heroDuration, setHeroDuration] = useState<number | null>(null);
  const heroScrollSvh = getHeroScrollSvh(heroDuration);
  const { pageProgress, heroProgress } = useProposalScroll("residentialHero", heroScrollSvh);
  const includeSolar = prospect.include_solar !== false;
  const includeHeatPump = Boolean(prospect.include_heat_pump);
  const includeEv = Boolean(prospect.include_ev);
  const solarSavings = prospect.yearly_savings ?? estimateSolarSavings(prospect);
  const heatPumpSavings = prospect.heat_pump_annual_savings ?? 0;
  const evValue = prospect.ev_charger_annual_value ?? 0;
  const [state, setState] = useState<Record<PackageKey, boolean>>({
    solar: includeSolar,
    heat: includeHeatPump,
    ev: includeEv,
  });
  const [contactState, setContactState] = useState<"idle" | "success">("idle");
  const [fieldError, setFieldError] = useState("");
  const homeowner = prospect.contact_name ?? prospect.owner_name ?? "Homeowner";
  const primaryHref =
    bookingUrl ??
    `mailto:${contactEmail ?? ""}?subject=${encodeURIComponent(`Home energy proposal - ${prospect.address}`)}`;
  const hasAnyProduct = includeSolar || includeHeatPump || includeEv;
  const totals = useMemo(() => {
    const annual =
      (state.solar ? solarSavings : 0) +
      (state.heat ? heatPumpSavings : 0) +
      (state.ev ? evValue : 0);
    const lifetime =
      (state.solar ? prospect.savings_25yr ?? solarSavings * 21 : 0) +
      (state.heat ? heatPumpSavings * 12 : 0) +
      (state.ev ? evValue * 10 : 0);
    return { annual, lifetime };
  }, [evValue, heatPumpSavings, prospect.savings_25yr, solarSavings, state]);

  const panelCount = Math.max(Math.min(prospect.panel_count ?? 48, 72), 24);
  const litPanels = Math.round(clamp((heroProgress - 0.2) / 0.5) * panelCount);
  const wipe = clamp((heroProgress - 0.1) / 0.5);
  const secondHeadline = heroProgress > 0.5;

  function toggle(key: PackageKey) {
    if (key === "solar") return;
    setState((current) => ({ ...current, [key]: !current[key] }));
  }

  function submitContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = stringValue(form.get("name"));
    const email = stringValue(form.get("email"));
    const phone = stringValue(form.get("phone"));
    if (!name || (!email && !phone)) {
      setFieldError("Please add your name plus an email or phone number.");
      return;
    }
    setFieldError("");
    setContactState("success");
  }

  return (
    <main className="min-h-screen overflow-x-clip bg-[#fbfaf6] text-[#332c25] [font-family:var(--font-instrument),ui-sans-serif,system-ui,sans-serif]">
      <style>{`#residentialHero input[type="file"]{display:none!important;}`}</style>
      <div className="fixed left-0 top-0 z-[80] h-0.5 bg-[#d9a24e] transition-[width] duration-100" style={{ width: `${pageProgress * 100}%` }} />
      <div className="pointer-events-none fixed left-0 right-0 top-0 z-[70] flex items-center justify-between px-5 py-4 mix-blend-difference sm:px-10">
        <div className="pointer-events-auto flex items-center gap-3">
          <span className="h-3 w-3 rounded-full bg-[#d9a24e] shadow-[0_0_0_4px_rgba(217,162,78,.28)]" />
          <span className="text-sm font-semibold uppercase tracking-[0.18em] text-white">AmberField Energy</span>
        </div>
        <span className="hidden text-[10px] uppercase tracking-[0.2em] text-white/70 sm:inline">Private proposal · Prepared Jun 2026</span>
      </div>

      <section id="residentialHero" className="relative bg-[#24221f]" style={{ height: `${heroScrollSvh}svh` }}>
        <div className="sticky top-0 h-[100svh] overflow-hidden bg-[#24221f]">
          <div className="absolute inset-0">
            <HeroMedia prospect={prospect} includeVideo={includeSolar} fallback={RES_FALLBACK_IMAGE} progress={heroProgress} onDurationChange={setHeroDuration} />
            <div
              className="absolute inset-0"
              style={{ clipPath: `inset(${(100 - wipe * 100).toFixed(1)}% 0 0 0)` }}
            >
              <div className="absolute inset-0 bg-[#d9a24e]/10 mix-blend-screen" />
              <div className="absolute left-[22%] top-[34%] grid h-[34%] w-[52%] origin-center [transform:perspective(900px)_rotateX(54deg)_rotateZ(-19deg)] grid-cols-8 gap-0.5">
                {Array.from({ length: panelCount }).map((_, index) => (
                  <span
                    key={index}
                    className={`min-h-3 border border-[#b8c8ff]/45 bg-[linear-gradient(150deg,#3a4f91,#1d2547)] shadow-[inset_0_0_4px_rgba(5,12,30,.6)] transition duration-500 ${
                      index < litPanels ? "scale-100 opacity-100" : "scale-50 opacity-0"
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(22,20,17,.55)_0%,rgba(22,20,17,.08)_28%,rgba(22,20,17,.12)_48%,rgba(22,20,17,.82)_100%)]" />
            <span className="absolute left-5 top-20 z-10 border border-white/18 px-2.5 py-1 text-[9px] uppercase tracking-[0.16em] text-white/45 sm:left-10">
              {secondHeadline ? `${prospect.panel_count ?? "Solar"} panels placed` : "Solar flyover · poster frame"}
            </span>
          </div>

          <div className="absolute inset-x-0 bottom-0 z-20">
            <div className="mx-auto w-full max-w-[1140px] px-5 pb-8 sm:px-10 sm:pb-11">
              <p className="mb-4 text-xs uppercase tracking-[0.24em] text-white/65">
                A private solar & home-energy plan for <b className="text-[#d9a24e]">{homeowner}</b>
              </p>
              <div className="relative h-[clamp(132px,20vw,260px)]">
                <h1
                  className="absolute bottom-0 left-0 max-w-[16ch] text-[clamp(38px,6.4vw,92px)] font-light leading-[.98] text-[#f8f2e8] [font-family:var(--font-newsreader),Georgia,serif]"
                  style={{ opacity: secondHeadline ? 0 : 1, transform: secondHeadline ? "translateY(-22px)" : "none", transition: "opacity .7s ease, transform .7s cubic-bezier(.2,.7,.2,1)" }}
                >
                  This is your roof, quietly costing you money.
                </h1>
                <h1
                  className="absolute bottom-0 left-0 max-w-[16ch] text-[clamp(38px,6.4vw,92px)] font-light leading-[.98] text-[#f8f2e8] [font-family:var(--font-newsreader),Georgia,serif]"
                  style={{ opacity: secondHeadline ? 1 : 0, transform: secondHeadline ? "none" : "translateY(22px)", transition: "opacity .7s ease, transform .7s cubic-bezier(.2,.7,.2,1)" }}
                >
                  This is the same roof, <em className="text-[#d9a24e]">quietly paying you back.</em>
                </h1>
              </div>
              <div className="mt-7 flex items-end justify-between gap-6 border-t border-white/15 pt-5">
                <div className="text-sm text-white/80">{prospect.address} · {prospect.city || "Ontario"}</div>
                <div className="hidden flex-col items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-white/45 transition-opacity sm:flex" style={{ opacity: heroProgress > 0.08 ? 0 : 1 }}>
                  <span>Scroll</span>
                  <span className="relative h-9 w-px overflow-hidden bg-white/30">
                    <span className="absolute inset-x-0 top-0 h-2/5 animate-pulse bg-[#d9a24e]" />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-[clamp(90px,13vh,170px)] sm:px-10">
        <div className="mx-auto grid max-w-[1140px] items-end gap-12 md:grid-cols-2">
          <div>
            <Kick>Your plan at a glance</Kick>
            <p className="mt-6 max-w-[20ch] text-[clamp(28px,3.4vw,42px)] font-light leading-[1.32] text-[#332c25] [font-family:var(--font-newsreader),Georgia,serif]">
              {homeowner}, we modeled your home against your roof, local sun, and{" "}
              <em className="text-[#3a7c62]">{prospect.monthly_energy_bill ? `${money(prospect.monthly_energy_bill)} monthly bill` : "current utility bill"}</em>.
            </p>
          </div>
          <div className="flex flex-wrap border-t border-[#332c25]/12">
            <IntroCell value={prospect.monthly_energy_bill ? `${money(prospect.monthly_energy_bill)}/mo` : "Pending"} label="Current energy bill" />
            <IntroCell value={prospect.system_kw ? `${num(prospect.system_kw)} kW` : "Sizing"} label="Recommended system" />
            <IntroCell value={prospect.panel_count ? num(prospect.panel_count) : "TBD"} label="Roof panels" />
          </div>
        </div>
      </section>

      {includeSolar ? (
        <section className="bg-[#f4f0e8] px-5 py-[clamp(90px,13vh,170px)] sm:px-10">
          <div className="mx-auto max-w-[1140px]">
            <Kick>Solar — the foundation</Kick>
            <div className="mt-9 grid items-center gap-12 md:grid-cols-[1.15fr_.85fr]">
              <div className="text-[clamp(78px,14vw,184px)] font-light leading-[.84] tracking-[-.03em] text-[#b06f35] [font-family:var(--font-newsreader),Georgia,serif]">
                {money(solarSavings)}
                <span className="mt-5 block text-sm font-semibold uppercase tracking-[0.18em] text-[#897d70] [font-family:var(--font-instrument),ui-sans-serif,sans-serif]">
                  Saved every year <Estimate />
                </span>
              </div>
              <div>
                <div className="border-t border-[#332c25]/12">
                  <StatRow label="System size" value={prospect.system_kw ? `${num(prospect.system_kw)} kW` : "Under review"} />
                  <StatRow label="Panels on your roof" value={prospect.panel_count ? num(prospect.panel_count) : "Under review"} />
                  <StatRow label="Clean energy a year" value={prospect.yearly_kwh ? `${num(prospect.yearly_kwh)} kWh` : "Under review"} />
                  <StatRow label="Estimated payback" value={payback(prospect)} />
                  <StatRow label="25-year savings" value={prospect.savings_25yr ? money(prospect.savings_25yr) : money(solarSavings * 21)} accent />
                </div>
                <p className="mt-6 text-[15px] leading-7 text-[#6a5f52]">
                  After estimated incentives of <b className="text-[#332c25]">{prospect.incentive_amount ? money(prospect.incentive_amount) : "to be confirmed"}</b>
                  {prospect.system_cost ? ` against a system cost of ${money(prospect.system_cost)}` : ""}. Numbers are modeled estimates until final design.
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {includeHeatPump ? (
        <section className="px-5 py-[clamp(90px,13vh,170px)] sm:px-10">
          <div className="mx-auto grid max-w-[1140px] items-center gap-12 md:grid-cols-[.95fr_1.05fr]">
            <div className="relative aspect-[5/6] overflow-hidden border border-[#332c25]/12 bg-[#eee6da] md:aspect-[5/6]">
              <div className="absolute inset-0 bg-[repeating-linear-gradient(125deg,rgba(51,44,37,.12)_0_1px,transparent_1px_14px)]" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border border-[#332c25]/22 bg-[#fbfaf6] px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-[#897d70]">
                Comfort still · optional
              </span>
            </div>
            <div>
              <Kick>Heat pump — comfort that pays</Kick>
              <h2 className="mt-5 max-w-[15ch] text-[clamp(34px,4.6vw,58px)] font-light leading-[1.04] [font-family:var(--font-newsreader),Georgia,serif]">
                One quiet system for heating <em className="text-[#3a7c62]">and</em> cooling.
              </h2>
              <div className="mt-4 text-[clamp(60px,8vw,104px)] font-light leading-[.9] text-[#3a7c62] [font-family:var(--font-newsreader),Georgia,serif]">
                {heatPumpSavings ? money(heatPumpSavings) : "Pending"}
                <span className="ml-2 align-[.4em] text-sm uppercase tracking-[0.12em] text-[#897d70] [font-family:var(--font-instrument),ui-sans-serif,sans-serif]">Est. / yr</span>
              </div>
              <p className="mt-2 max-w-xl text-base leading-7 text-[#6a5f52]">vs. your current heating, while cooling every room in summer for less.</p>
              <div className="mt-7">
                <Feature text={<><b>Even, draft-free comfort</b> in every room, all year.</>} />
                <Feature text={<><b>Runs on your solar.</b> Pairs with the panels above so more of your heat is clean.</>} />
                <Feature text={<><b>Cleaner air, lower carbon</b> through electric efficiency.</>} />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {hasAnyProduct ? (
        <section className="bg-[#f4f0e8] px-5 py-[clamp(90px,13vh,170px)] sm:px-10">
          <div className="mx-auto max-w-[1140px]">
            <Kick>Build your package</Kick>
            <h2 className="mt-4 max-w-[18ch] text-[clamp(32px,4.4vw,56px)] font-light leading-[1.04] [font-family:var(--font-newsreader),Georgia,serif]">
              Choose what is right for your home. The numbers update as you go.
            </h2>
            <div className="mt-12 grid items-start gap-10 lg:grid-cols-2">
              <div>
                {includeSolar ? (
                  <PackageOption
                    label="Solar panels"
                    detail={`${prospect.system_kw ? `${num(prospect.system_kw)} kW` : "System sizing"} · ${prospect.panel_count ? `${num(prospect.panel_count)} panels` : "panels pending"}. The foundation of your plan.`}
                    price={`+${money(solarSavings)}/yr`}
                    checked={state.solar}
                    locked
                    onClick={() => toggle("solar")}
                  />
                ) : null}
                {includeHeatPump ? (
                  <PackageOption
                    label="Heat pump"
                    detail="Heating and cooling in one. Runs cleaner with your solar."
                    price={`+${money(heatPumpSavings)}/yr`}
                    checked={state.heat}
                    onClick={() => toggle("heat")}
                  />
                ) : null}
                {includeEv ? (
                  <PackageOption
                    label="EV charger"
                    detail="Charge at home on sunshine. Add it now or later."
                    price={evValue ? `+${money(evValue)}/yr` : "Optional"}
                    checked={state.ev}
                    onClick={() => toggle("ev")}
                    optional
                  />
                ) : null}
              </div>
              <aside className="border border-[#332c25]/22 bg-[#fbfaf6] p-6 shadow-[0_30px_70px_-50px_rgba(51,44,37,.5)] lg:sticky lg:top-9 sm:p-8">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#897d70]">Your combined savings</h3>
                <div className="mt-2 text-[clamp(60px,9vw,98px)] font-light leading-[.86] tracking-[-.02em] text-[#b06f35] [font-family:var(--font-newsreader),Georgia,serif]">
                  <span className="align-[.55em] text-[.4em] text-[#897d70]">$</span>{num(totals.annual)}
                </div>
                <div className="mt-2 text-sm text-[#5f554b]">estimated every year <Estimate /> · with {packageName(state)}</div>
                <div className="my-7 border-t border-[#332c25]/12">
                  {includeSolar ? <SummaryLine label="Solar panels" value={money(solarSavings)} active={state.solar} /> : null}
                  {includeHeatPump ? <SummaryLine label="Heat pump" value={money(heatPumpSavings)} active={state.heat} /> : null}
                  {includeEv ? <SummaryLine label="EV charger" value={evValue ? money(evValue) : "Optional"} active={state.ev} /> : null}
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-xs uppercase tracking-[0.08em] text-[#897d70]">Over 25 years <Estimate /></span>
                  <span className="text-4xl text-[#3a7c62] [font-family:var(--font-newsreader),Georgia,serif]">{money(totals.lifetime)}</span>
                </div>
                <a href="#contact" className="mt-7 flex w-full items-center justify-center gap-3 bg-[#332c25] px-5 py-4 text-sm font-semibold text-[#fbfaf6] transition hover:-translate-y-0.5 hover:bg-[#b06f35]">
                  Reserve this plan <span aria-hidden>→</span>
                </a>
              </aside>
            </div>
          </div>
        </section>
      ) : (
        <AssessmentPendingResidential prospect={prospect} />
      )}

      <section id="contact" className="bg-[#24221f] px-5 py-[clamp(90px,13vh,170px)] text-[#f8f2e8] sm:px-10">
        <div className="mx-auto grid max-w-[1140px] items-start gap-12 lg:grid-cols-2">
          <div>
            <Kick night>The next step</Kick>
            <h2 className="mt-5 text-[clamp(38px,5.4vw,72px)] font-light leading-none [font-family:var(--font-newsreader),Georgia,serif]">
              Let&apos;s make it<br /><em className="text-[#d9a24e]">real for your home.</em>
            </h2>
            <p className="mt-6 max-w-[42ch] text-base leading-7 text-white/68">
              Book a 20-minute call, or leave your details and we will reach out. No pressure, no obligation, just your numbers confirmed.
            </p>
            <div className="mt-9 border-t border-white/15 pt-7">
              <div className="flex flex-wrap gap-10">
                <AdvisorBlock label="Your advisor" value="Helio Cap" sub="Home energy team" />
                <AdvisorBlock label="Direct" value={contactEmail ?? "hello@heliocap.energy"} sub="Proposal support" accent />
              </div>
            </div>
          </div>

          <div className="border border-white/15 bg-white/[0.04] p-6 sm:p-8">
            {contactState === "success" ? (
              <div className="flex min-h-[380px] flex-col items-center justify-center gap-5 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full border border-[#d9a24e] text-3xl text-[#d9a24e]">✓</span>
                <h3 className="text-3xl [font-family:var(--font-newsreader),Georgia,serif]">You&apos;re all set, {homeowner.split(" ")[0] || "there"}.</h3>
                <p className="max-w-[34ch] text-sm leading-6 text-white/65">We will reach out within one business day to confirm your numbers and answer anything.</p>
              </div>
            ) : (
              <form onSubmit={submitContact} noValidate>
                <DarkField label="Full name" name="name" placeholder={homeowner === "Homeowner" ? "Your name" : homeowner} />
                <DarkField label="Email" name="email" type="email" placeholder="you@email.com" defaultValue={prospect.owner_email ?? ""} />
                <DarkField label="Phone" name="phone" placeholder="(905) 555-0000" defaultValue={prospect.owner_mobile ?? ""} />
                <label className="mt-7 flex cursor-pointer items-start gap-3 text-sm leading-6 text-white/65">
                  <input type="checkbox" name="insurance_quote_consent" className="mt-1 h-4 w-4 accent-[#d9a24e]" />
                  <span>I consent to being contacted about a home insurance quote.</span>
                </label>
                {fieldError ? <p className="mt-4 border border-[#d78764]/35 bg-[#d78764]/10 px-3 py-2 text-sm text-[#f0ae93]">{fieldError}</p> : null}
                <button type="submit" className="mt-6 w-full bg-[#d9a24e] px-5 py-4 text-sm font-semibold text-[#24221f] transition hover:-translate-y-0.5 hover:bg-[#b06f35] hover:text-white">
                  Send my details
                </button>
                <div className="my-6 flex items-center gap-4 text-[11px] uppercase tracking-[0.2em] text-white/40 before:h-px before:flex-1 before:bg-white/15 after:h-px after:flex-1 after:bg-white/15">or</div>
                <a
                  href={primaryHref}
                  target={bookingUrl ? "_blank" : undefined}
                  rel={bookingUrl ? "noopener noreferrer" : undefined}
                  className="flex w-full items-center justify-center gap-3 border border-white/25 px-5 py-4 text-sm font-medium text-white transition hover:border-[#d9a24e] hover:bg-[#d9a24e]/10"
                >
                  Book a 20-minute call <span aria-hidden>→</span>
                </a>
              </form>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#24221f] px-5 py-10 text-[11.5px] leading-7 text-white/42 sm:px-10">
        <div className="mx-auto grid max-w-[1140px] gap-8 md:grid-cols-[1fr_2fr]">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-[#d9a24e]" />
            <span className="font-semibold uppercase tracking-[0.18em] text-white/70">AmberField</span>
          </div>
          <p>
            <b className="font-semibold text-white/70">About these numbers.</b> All savings, payback, and 25-year figures shown are modeled estimates based on roof, local sun data, current utility rates, and typical equipment performance. They are marked <span className="text-white/70">Est.</span> throughout and are not a quote or guarantee. Final figures are produced after site assessment.
          </p>
        </div>
      </footer>
    </main>
  );
}

function HeroMedia({
  prospect,
  includeVideo,
  fallback,
  progress,
  onDurationChange,
}: {
  prospect: Prospect;
  includeVideo: boolean;
  fallback: string;
  progress: number;
  onDurationChange: (duration: number) => void;
}) {
  if (includeVideo && prospect.video_url) {
    const poster = prospect.video_thumbnail_url ?? prospect.satellite_image_url ?? fallback;
    return (
      <ScrollScrubVideo
        src={prospect.video_url}
        poster={poster}
        progress={progress}
        onDurationChange={onDurationChange}
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }
  if (prospect.satellite_image_url) {
    return <img src={prospect.satellite_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />;
  }
  return (
    <>
      <img src={fallback} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_64%_26%,rgba(166,133,80,.45),transparent_60%),repeating-linear-gradient(125deg,rgba(255,255,255,.035)_0_2px,transparent_2px_13px)]" />
    </>
  );
}

function Kick({ children, night }: { children: React.ReactNode; night?: boolean }) {
  return (
    <div className={`inline-flex items-center gap-3 text-[11.5px] font-semibold uppercase tracking-[0.24em] ${night ? "text-[#d9a24e]" : "text-[#b06f35]"}`}>
      <span className="h-px w-7 bg-[#d9a24e]/75" />
      {children}
    </div>
  );
}

function IntroCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="mr-7 border-r border-[#332c25]/12 py-5 pr-7 last:mr-0 last:border-r-0">
      <div className="text-3xl leading-none [font-family:var(--font-newsreader),Georgia,serif]">{value}</div>
      <div className="mt-2 text-[10.5px] uppercase tracking-[0.14em] text-[#897d70]">{label}</div>
    </div>
  );
}

function StatRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-5 border-b border-[#332c25]/12 py-5">
      <span className="text-[14.5px] text-[#5f554b]">{label}</span>
      <span className={`text-3xl [font-family:var(--font-newsreader),Georgia,serif] ${accent ? "text-[#3a7c62]" : "text-[#332c25]"}`}>{value}</span>
    </div>
  );
}

function Feature({ text }: { text: React.ReactNode }) {
  return (
    <div className="flex gap-4 border-t border-[#332c25]/12 py-4 last:border-b">
      <span className="mt-2 h-2 w-2 flex-none rounded-full bg-[#6aaa83]" />
      <span className="text-[14.5px] leading-6 text-[#5f554b]">{text}</span>
    </div>
  );
}

function PackageOption({
  label,
  detail,
  price,
  checked,
  locked,
  optional,
  onClick,
}: {
  label: string;
  detail: string;
  price: string;
  checked: boolean;
  locked?: boolean;
  optional?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-3 flex w-full items-start gap-4 border p-5 text-left transition ${
        checked
          ? "border-[#d9a24e] bg-[#d9a24e]/[.055] shadow-[0_1px_0_#d9a24e_inset,0_18px_40px_-30px_rgba(176,111,53,.5)]"
          : "border-[#332c25]/12 bg-[#fbfaf6] hover:border-[#332c25]/25"
      } ${locked ? "cursor-default" : ""}`}
    >
      <span className={`mt-1 flex h-6 w-6 flex-none items-center justify-center rounded-md border ${checked ? "border-[#d9a24e] bg-[#d9a24e]" : "border-[#332c25]/25"}`}>
        {checked ? <span className="text-sm font-bold text-white">✓</span> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-2xl leading-tight [font-family:var(--font-newsreader),Georgia,serif]">{label}</span>
          <span className="whitespace-nowrap text-sm font-semibold text-[#3a7c62]">{price}</span>
        </span>
        <span className="mt-1.5 block text-[13.5px] leading-5 text-[#897d70]">{detail}</span>
        {locked ? <span className="mt-2 inline-block text-[11px] uppercase tracking-[0.1em] text-[#b06f35]">Included</span> : null}
        {optional ? <span className="mt-2 inline-block text-[11px] uppercase tracking-[0.1em] text-[#897d70]">Optional add-on</span> : null}
      </span>
    </button>
  );
}

function SummaryLine({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div className={`flex justify-between gap-4 border-b border-[#332c25]/12 py-3 text-sm text-[#5f554b] transition-opacity ${active ? "" : "opacity-35"}`}>
      <span>{label}</span>
      <span className="font-semibold text-[#332c25]">{value}</span>
    </div>
  );
}

function DarkField({ label, name, placeholder, type = "text", defaultValue = "" }: { label: string; name: string; placeholder: string; type?: string; defaultValue?: string }) {
  return (
    <label className="mb-5 block">
      <span className="mb-2 block text-[11.5px] uppercase tracking-[0.14em] text-white/60">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="w-full border-0 border-b border-white/25 bg-transparent px-0 py-2 text-base text-white outline-none transition placeholder:text-white/30 focus:border-[#d9a24e]"
      />
    </label>
  );
}

function AdvisorBlock({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div>
      <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-white/50">{label}</div>
      <div className={`text-2xl [font-family:var(--font-newsreader),Georgia,serif] ${accent ? "text-[#d9a24e]" : ""}`}>{value}</div>
      <div className="mt-1 text-sm text-white/60">{sub}</div>
    </div>
  );
}

function Estimate() {
  return <span className="ml-1 align-[.55em] text-[.5em] uppercase tracking-[0.12em] text-[#897d70]">Est.</span>;
}

function AssessmentPendingResidential({ prospect }: { prospect: Prospect }) {
  return (
    <section className="bg-[#f4f0e8] px-5 py-[clamp(90px,13vh,170px)] sm:px-10">
      <div className="mx-auto max-w-[1140px] border border-[#332c25]/12 bg-[#fbfaf6] p-8 text-center">
        <Kick>Your home assessment</Kick>
        <h2 className="mx-auto mt-5 max-w-[18ch] text-[clamp(32px,4.4vw,56px)] font-light leading-[1.04] [font-family:var(--font-newsreader),Georgia,serif]">
          We are still shaping the right package for {shortAddress(prospect.address)}.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[#6a5f52]">
          Solar, heat pump, and EV options are not confirmed yet. This private page will fill in as soon as the proposal editor has qualified products.
        </p>
      </div>
    </section>
  );
}

function estimateSolarSavings(prospect: Prospect) {
  if (prospect.monthly_energy_bill) return Math.round(prospect.monthly_energy_bill * 12 * 0.55);
  if (prospect.yearly_kwh) return Math.round(prospect.yearly_kwh * 0.147);
  return 0;
}

function payback(prospect: Prospect) {
  const annual = prospect.yearly_savings ?? estimateSolarSavings(prospect);
  const cost = Math.max((prospect.system_cost ?? 0) - (prospect.incentive_amount ?? 0), 0);
  return annual && cost ? `${(cost / annual).toFixed(1)} yr` : "To confirm";
}

function packageName(state: Record<PackageKey, boolean>) {
  if (state.heat && state.ev) return "Solar + Heat pump + EV";
  if (state.heat) return "Solar + Heat pump";
  if (state.ev) return "Solar + EV charger";
  if (state.solar) return "Solar only";
  return "selected options";
}

function shortAddress(address: string) {
  return address.split(",")[0] || "your home";
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

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}
