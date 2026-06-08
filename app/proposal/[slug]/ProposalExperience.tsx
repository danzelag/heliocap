/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import type { Prospect } from "@/lib/types";
import styles from "./ProposalExperience.module.css";

type ProposalExperienceProps = {
  prospect: Prospect;
  bookingUrl: string | null;
};

type ProposalModel = {
  id: string;
  company: string;
  owner: string;
  ownerTitle: string;
  address: string;
  city: string;
  sqft: number;
  yearBuilt: number | null;
  roofAge: number;
  roofScore: number;
  roofCondition: string;
  roofType: string;
  replaceWindow: string;
  panelCount: number;
  systemKw: number;
  yearlyKwh: number;
  yearlySavings: number;
  savings25yr: number;
  systemCost: number;
  incentiveAmount: number;
  paybackYears: number;
  usableRoofPct: number;
  offsetPct: number;
  co2Tonnes: number;
  lat: number | null;
  lng: number | null;
  videoUrl: string | null;
  videoThumbnailUrl: string | null;
  satelliteImageUrl: string | null;
  panelSvgUrl: string | null;
  mailto: string;
};

const SCENES = [
  "Opening",
  "Address",
  "Flyover",
  "Savings",
  "Payback",
  "Cash curve",
  "Roof",
  "Carbon",
  "Begin",
];

const ROWS = 13;
const COLS = 22;
const MAX_DIAG = ROWS + COLS - 2;

export function ProposalExperience({ prospect, bookingUrl }: ProposalExperienceProps) {
  const p = useMemo(() => toProposalModel(prospect), [prospect]);
  const progressRef = useRef<HTMLDivElement>(null);
  const heroMediaRef = useRef<HTMLDivElement>(null);
  const heroCopyRef = useRef<HTMLDivElement>(null);
  const flyoverRef = useRef<HTMLElement>(null);
  const [activeScene, setActiveScene] = useState(0);
  const [flyoverProgress, setFlyoverProgress] = useState(0);
  const primaryHref = bookingUrl ?? p.mailto;

  useEffect(() => {
    let raf = 0;

    const tick = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const pageProgress = maxScroll > 0 ? clamp(window.scrollY / maxScroll) : 0;
      if (progressRef.current) {
        progressRef.current.style.width = `${pageProgress * 100}%`;
      }

      if (heroMediaRef.current) {
        const y = window.scrollY;
        heroMediaRef.current.style.transform = `translate3d(0, ${(y * 0.16).toFixed(1)}px, 0) scale(${(
          1 + Math.min(y, 900) / 5200
        ).toFixed(4)})`;
      }

      if (heroCopyRef.current) {
        const y = window.scrollY;
        heroCopyRef.current.style.transform = `translate3d(0, ${(y * -0.08).toFixed(1)}px, 0)`;
        heroCopyRef.current.style.opacity = String(clamp(1 - y / (window.innerHeight * 0.76), 0, 1));
      }

      const fly = flyoverRef.current;
      if (fly) {
        const rect = fly.getBoundingClientRect();
        const denom = rect.height - window.innerHeight;
        const next = denom > 0 ? clamp(-rect.top / denom) : 0;
        setFlyoverProgress((prev) => (Math.abs(prev - next) > 0.004 ? next : prev));
      }

      const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-proposal-scene]"));
      const mid = window.innerHeight * 0.5;
      const idx = sections.findIndex((section) => {
        const r = section.getBoundingClientRect();
        return r.top <= mid && r.bottom > mid;
      });
      if (idx >= 0) setActiveScene((prev) => (prev === idx ? prev : idx));
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };

    tick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <main className={styles.page}>
      <div className={styles.progress} ref={progressRef} />
      <div className={`${styles.atmosphere} ${styles.vignette}`} />
      <div className={`${styles.atmosphere} ${styles.grain}`} />

      <div className={`${styles.frameMark} ${styles.frameTopLeft}`}>
        OPEN<span>CLAW</span>
      </div>
      <div className={`${styles.frameMark} ${styles.frameTopRight}`}>
        Private proposal
        <br />
        OC-{p.id.slice(0, 8).toUpperCase()}
      </div>
      <div className={`${styles.frameMark} ${styles.frameBottomLeft}`}>{p.city}</div>
      <SceneRail active={activeScene} />

      <section id="scene-0" className={`${styles.scene} ${styles.hero}`} data-proposal-scene>
        <div className={styles.heroMedia} ref={heroMediaRef}>
          <ProposalMedia p={p} />
        </div>
        <div className={styles.heroSun} />
        <div className={styles.heroHaze} />
        <div className={styles.heroCopy} ref={heroCopyRef}>
          <Reveal>
            <p className={styles.heroFor}>
              Prepared for <b>{p.owner}</b> at <b>{p.company}</b>
            </p>
            <h1 className={styles.heroTitle}>
              The sun has paid this roof a visit every day for <em>{Math.max(p.roofAge, 1)} years</em>.
            </h1>
            <p className={styles.heroSub}>
              OpenClaw mapped {p.address}, placed a {fmtInt(p.systemKw)} kW commercial solar system onto the roof, and ran
              the return model against the building itself.
            </p>
            <div className={styles.heroActions}>
              <a className={styles.primaryCta} href={primaryHref} target={bookingUrl ? "_blank" : undefined} rel={bookingUrl ? "noopener noreferrer" : undefined}>
                Book a walkthrough
              </a>
              <a className={styles.secondaryCta} href="#savings-model">
                View savings model
              </a>
            </div>
          </Reveal>
        </div>
        <div className={styles.heroResults}>
          <ResultMetric value={p.systemKw} format={(n) => `${fmtInt(n)} kW`} label="System size" />
          <ResultMetric value={p.yearlySavings} format={fmtMoney} label="Saved every year" />
          <ResultMetric value={p.savings25yr} format={fmtMoneyM} label="25-year net" />
          <ResultMetric value={p.incentiveAmount} format={fmtMoneyK} label="Incentive stack" />
        </div>
        <div className={styles.scrollCue}>
          Scroll
          <span />
        </div>
      </section>

      <section id="scene-1" className={`${styles.scene} ${styles.addressScene}`} data-proposal-scene>
        <div className={styles.wrap}>
          <Reveal className={styles.coord}>
            <span>{formatCoord(p.lat, "lat")}</span>
            <span>{formatCoord(p.lng, "lng")}</span>
            <span>{p.company}</span>
          </Reveal>
          <Reveal as="h2" className={styles.addressTitle} distance={72}>
            {splitAddress(p.address).number}
            <span>{splitAddress(p.address).street}</span>
          </Reveal>
          <Reveal className={styles.addressMeta} distance={28}>
            <MetaCell value={fmtInt(p.sqft)} unit="sqft" label="Gross roof" />
            <MetaCell value={p.yearBuilt?.toString() ?? "Verified"} label="Year built" />
            <MetaCell value={p.city} label="Location" />
            <MetaCell value={`${Math.round(p.usableRoofPct * 100)}%`} label="Usable plane" />
          </Reveal>
        </div>
      </section>

      <section id="scene-2" className={`${styles.scene} ${styles.flyoverWrap}`} ref={flyoverRef} data-proposal-scene>
        <div className={styles.flyoverPin}>
          <div className={styles.flyoverHead}>
            <div>
              <Reveal className={styles.kicker}>
                <span />
                Aerial survey
              </Reveal>
              <h2 className={styles.flyoverTitle}>
                Every panel, placed onto <em>your</em> roof.
              </h2>
            </div>
            <div className={styles.flyoverReadout}>
              <Readout label="Modules" value={fmtInt(p.panelCount * flyoverProgress)} />
              <Readout label="System DC" value={`${fmtInt(p.systemKw * flyoverProgress)} kW`} />
              <Readout label="Generation / yr" value={fmtMWh(p.yearlyKwh * flyoverProgress)} />
              <Readout label="Grid offset" value={`${Math.round(p.offsetPct * 100 * flyoverProgress)}%`} />
            </div>
          </div>
          <div className={styles.roofStage}>
            <RoofVisualization p={p} progress={flyoverProgress} />
          </div>
        </div>
      </section>

      <BigStat
        id="scene-3"
        sceneIndex
        kicker="What it saves"
        value={p.yearlySavings}
        format={fmtMoney}
        suffix="saved, every single year"
        sub={`At the modelled blended rate, the array offsets about ${Math.round(p.offsetPct * 100)}% of the building's grid electricity.`}
      />

      <BigStat
        id="scene-4"
        kicker="What it costs you to wait"
        value={p.paybackYears}
        format={(n) => n.toFixed(1)}
        suffix="years, then the power is owned"
        sub={`Net of the ${fmtMoneyK(p.incentiveAmount)} incentive stack currently modelled for this roof.`}
      />

      <section id="scene-5" className={`${styles.scene} ${styles.curveScene}`} data-proposal-scene>
        <span id="savings-model" className={styles.anchorOffset} />
        <div className={`${styles.wrap} ${styles.curveGrid}`}>
          <div>
            <Reveal className={styles.kicker}>
              <span />
              The 25-year arc
            </Reveal>
            <Reveal as="h2" className={styles.curveHeadline}>
              From outlay to <em>outright ownership</em>.
            </Reveal>
            <Reveal as="p" className={styles.lead}>
              One capital project when the roof is already under review, then the meter quietly works in your favour.
              The model crosses break-even in year {p.paybackYears.toFixed(1)}.
            </Reveal>
          </div>
          <Reveal className={styles.curveCard} distance={30}>
            <CashCurve p={p} />
          </Reveal>
        </div>
      </section>

      <section id="scene-6" className={`${styles.scene} ${styles.caseScene}`} data-proposal-scene>
        <div className={`${styles.wrap} ${styles.caseGrid}`}>
          <div>
            <Reveal className={styles.kicker}>
              <span />
              The decision in front of you
            </Reveal>
            <Reveal as="h2" className={styles.caseHeadline}>
              You are going to re-roof anyway. <em>Do it once.</em>
            </Reveal>
            <Reveal as="p" className={styles.lead}>
              The membrane at {p.address} is {p.roofAge} years into its service life. Stack solar onto the same
              mobilization and the structural work, permit set, and rooftop disruption are consolidated.
            </Reveal>
          </div>
          <Reveal className={styles.roofCase} distance={30}>
            <div className={styles.gaugeTop}>
              <div className={styles.gaugeScore}>
                {p.roofScore}
                <small>/100</small>
              </div>
              <div className={styles.gaugeTag}>{p.roofScore <= 28 ? "Critical" : "Elevated"} window</div>
            </div>
            <div className={styles.gaugeBar}>
              <span style={{ width: `${100 - p.roofScore}%` }} />
            </div>
            <div className={styles.gaugeScale}>
              <span>New</span>
              <span>{100 - p.roofScore}% degraded</span>
              <span>End of life</span>
            </div>
            <div className={styles.caseLines}>
              <LineItem label="Assembly" value={p.roofType} />
              <LineItem label="Observed" value={p.roofCondition} />
              <LineItem label="Replacement window" value={p.replaceWindow} hot />
            </div>
          </Reveal>
        </div>
      </section>

      <section id="scene-7" className={`${styles.scene} ${styles.cleanScene}`} data-proposal-scene>
        <div className={`${styles.wrap} ${styles.cleanGrid}`}>
          <Reveal className={styles.cleanBig}>
            <ScrollNumber value={p.co2Tonnes} />
            <span>tonnes of CO2 avoided every year</span>
          </Reveal>
          <div>
            <Reveal as="h2" className={styles.cleanHeadline}>
              The line your lenders and tenants will ask about.
            </Reveal>
            <Equation value={Math.round(p.co2Tonnes / 4.6)} label="cars taken off the road, every year it runs" />
            <Equation value={Math.round(p.yearlyKwh / 10700)} label="homes worth of clean electricity, annually" />
            <Equation
              value={Math.round((p.co2Tonnes * 25) / 100) / 10}
              format={(n) => `${n.toFixed(1)}k`}
              label="tonnes kept out of the air across 25 years"
            />
          </div>
        </div>
      </section>

      <section id="scene-8" className={`${styles.scene} ${styles.closeScene}`} data-proposal-scene>
        <div className={styles.wrap}>
          <Reveal as="h2" className={styles.closeHeadline}>
            Let&apos;s walk your roof, <em>{firstName(p.owner)}</em>.
          </Reveal>
          <Reveal>
            <a className={styles.closeCta} href={primaryHref} target={bookingUrl ? "_blank" : undefined} rel={bookingUrl ? "noopener noreferrer" : undefined}>
              Book a 20-minute walkthrough
              <span>{"->"}</span>
            </a>
            <p className={styles.closeSub}>We confirm the roof assumptions, incentive eligibility, and project sequence on site.</p>
          </Reveal>
          <Reveal className={styles.signatures}>
            <Signature label="Prepared by" name="OpenClaw" role="Autonomous solar proposal system" contact="Ontario commercial roofs" />
            <Signature label="Prepared for" name={p.owner} role={`${p.ownerTitle} · ${p.company}`} contact={p.address} />
          </Reveal>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.wrap}>
          <div className={styles.footerBrand}>
            OPEN<span>CLAW</span>
          </div>
          <p>
            <b>Methodology.</b> Roof geometry and project economics are generated from OpenClaw pipeline data, satellite
            imagery, solar layout assumptions, and market-rate economics. This is an indicative proposal, not a binding
            quote or guarantee of yield, eligibility, or construction pricing. Every figure is confirmed during
            engineering review.
          </p>
        </div>
      </footer>
    </main>
  );
}

function ProposalMedia({ p }: { p: ProposalModel }) {
  if (p.videoUrl) {
    return (
      <video
        src={p.videoUrl}
        poster={p.videoThumbnailUrl ?? p.satelliteImageUrl ?? undefined}
        autoPlay
        muted
        loop
        playsInline
        className={styles.mediaFill}
      />
    );
  }

  if (p.satelliteImageUrl) {
    return <img src={p.satelliteImageUrl} alt={`${p.address} aerial`} className={styles.mediaFill} />;
  }

  return <div className={styles.mediaFallback} />;
}

function RoofVisualization({ p, progress }: { p: ProposalModel; progress: number }) {
  const panels = Array.from({ length: ROWS * COLS });

  return (
    <div className={styles.roofPlane}>
      {p.satelliteImageUrl ? <img src={p.satelliteImageUrl} alt={`${p.address} satellite`} className={styles.roofImage} /> : null}
      <div className={styles.roofGrid} />
      {p.panelSvgUrl ? (
        <img
          src={p.panelSvgUrl}
          alt="Solar panel layout"
          className={styles.panelOverlay}
          style={{ opacity: smooth((progress - 0.1) / 0.78) }}
        />
      ) : (
        <div className={styles.panelGrid} style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)` }}>
          {panels.map((_, i) => {
            const row = Math.floor(i / COLS);
            const col = i % COLS;
            const diag = (row + col) / MAX_DIAG;
            const local = smooth((progress * 1.14 - diag) / 0.1);
            return <span key={i} style={{ opacity: 0.96 * local, transform: `scale(${lerp(0.42, 1, local)})` }} />;
          })}
        </div>
      )}
      <span className={`${styles.roofCorner} ${styles.roofCornerTl}`} />
      <span className={`${styles.roofCorner} ${styles.roofCornerTr}`} />
      <span className={`${styles.roofCorner} ${styles.roofCornerBl}`} />
      <span className={`${styles.roofCorner} ${styles.roofCornerBr}`} />
      <span className={styles.roofDimTop}>mapped roof plane</span>
      <span className={styles.roofDimRight}>{fmtInt(p.sqft)} sqft</span>
    </div>
  );
}

function CashCurve({ p }: { p: ProposalModel }) {
  const width = 760;
  const height = 320;
  const padL = 8;
  const padR = 8;
  const padT = 26;
  const padB = 38;
  const years = 25;
  const cost = Math.max(1, p.systemCost - p.incentiveAmount);
  const endNet = Math.max(p.savings25yr, p.yearlySavings * years - cost);
  const slope = (endNet + cost) / years;
  const cash = (year: number) => -cost + slope * year;
  const minY = -cost;
  const maxY = endNet;
  const x = (year: number) => padL + (year / years) * (width - padL - padR);
  const y = (value: number) => padT + (1 - (value - minY) / (maxY - minY)) * (height - padT - padB);
  const zeroY = y(0);
  const paybackX = x(p.paybackYears);
  const points = Array.from({ length: years + 1 }, (_, year) => `${year ? "L" : "M"}${x(year).toFixed(1)} ${y(cash(year)).toFixed(1)}`).join(" ");
  const area = `${points} L ${x(years).toFixed(1)} ${zeroY.toFixed(1)} L ${x(0).toFixed(1)} ${zeroY.toFixed(1)} Z`;

  return (
    <>
      <div className={styles.curveCardHead}>
        <span>Cumulative cash position</span>
        <span>+{fmtMoneyM(endNet)}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className={styles.curveSvg} preserveAspectRatio="none" aria-label="25-year cumulative cash position chart">
        <defs>
          <linearGradient id="proposalCurveFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.26" />
            <stop offset="100%" stopColor="var(--gold)" stopOpacity="0.015" />
          </linearGradient>
        </defs>
        <line x1={padL} y1={zeroY} x2={width - padR} y2={zeroY} className={styles.zeroLine} />
        <text x={padL} y={zeroY - 9} className={styles.curveText}>
          break-even
        </text>
        <path d={area} fill="url(#proposalCurveFill)" />
        <path d={points} className={styles.curveLine} />
        <line x1={paybackX} y1={padT} x2={paybackX} y2={height - padB} className={styles.paybackLine} />
        <circle cx={paybackX} cy={zeroY} r="5" className={styles.paybackDot} />
        <text x={paybackX} y={height - padB + 22} className={styles.curveText} textAnchor="middle">
          payback · {p.paybackYears.toFixed(1)} yr
        </text>
        <text x={padL} y={zeroY + 20} className={styles.curveText}>
          -{fmtMoneyM(cost)} net cost
        </text>
      </svg>
      <p className={styles.curveNote}>
        <b>Net after 25 years:</b> {fmtMoneyM(endNet)} on a roof that is already inside the capital planning window.
      </p>
    </>
  );
}

function SceneRail({ active }: { active: number }) {
  return (
    <nav className={styles.sceneRail} aria-label="Proposal sections">
      {SCENES.map((label, index) => (
        <a key={label} href={`#scene-${index}`} className={index === active ? styles.activeScene : ""}>
          <span>{label}</span>
          <i />
        </a>
      ))}
    </nav>
  );
}

function BigStat({
  id,
  kicker,
  value,
  format,
  suffix,
  sub,
}: {
  id: string;
  sceneIndex?: boolean;
  kicker: string;
  value: number;
  format: (value: number) => string;
  suffix: string;
  sub: string;
}) {
  return (
    <section id={id} className={`${styles.scene} ${styles.statScene}`} data-proposal-scene>
      <div className={styles.wrap}>
        <Reveal className={`${styles.kicker} ${styles.centerKicker}`}>
          <span />
          {kicker}
        </Reveal>
        <div className={styles.statNumber}>
          <ScrollNumber value={value} format={format} />
        </div>
        <Reveal className={styles.statSuffix}>{suffix}</Reveal>
        <Reveal as="p" className={styles.statSub}>
          {sub}
        </Reveal>
      </div>
    </section>
  );
}

function Reveal({
  as,
  className,
  children,
  distance = 44,
}: {
  as?: "div" | "h2" | "p";
  className?: string;
  children: ReactNode;
  distance?: number;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -10% 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const props = {
    className: `${styles.reveal} ${seen ? styles.revealIn : ""}${className ? ` ${className}` : ""}`,
    style: { ["--reveal-distance" as string]: `${distance}px` },
  };

  if (as === "h2") {
    return (
      <h2 ref={ref as RefObject<HTMLHeadingElement | null>} {...props}>
        {children}
      </h2>
    );
  }

  if (as === "p") {
    return (
      <p ref={ref as RefObject<HTMLParagraphElement | null>} {...props}>
        {children}
      </p>
    );
  }

  return (
    <div ref={ref as RefObject<HTMLDivElement | null>} {...props}>
      {children}
    </div>
  );
}

function ScrollNumber({
  value,
  format = fmtInt,
}: {
  value: number;
  format?: (value: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node || !seen) return;

    const duration = 1300;
    const start = performance.now();
    let raf = 0;

    const step = (now: number) => {
      const progress = smooth((now - start) / duration);
      node.textContent = format(value * progress);
      if (progress < 1) {
        raf = requestAnimationFrame(step);
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [format, seen, value]);

  return <span ref={ref}>{format(seen ? value : 0)}</span>;
}

function ResultMetric({ value, format, label }: { value: number; format: (value: number) => string; label: string }) {
  return (
    <div>
      <div className={styles.resultValue}>
        <ScrollNumber value={value} format={format} />
      </div>
      <div className={styles.resultLabel}>{label}</div>
    </div>
  );
}

function MetaCell({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div className={styles.metaCell}>
      <div>
        {value}
        {unit ? <small> {unit}</small> : null}
      </div>
      <span>{label}</span>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function LineItem({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className={styles.lineItem}>
      <span>{label}</span>
      <b className={hot ? styles.hotValue : ""}>{value}</b>
    </div>
  );
}

function Equation({
  value,
  label,
  format = fmtInt,
}: {
  value: number;
  label: string;
  format?: (value: number) => string;
}) {
  return (
    <Reveal className={styles.equation} distance={26}>
      <span>
        <ScrollNumber value={value} format={format} />
      </span>
      <p>{label}</p>
    </Reveal>
  );
}

function Signature({ label, name, role, contact }: { label: string; name: string; role: string; contact: string }) {
  return (
    <div className={styles.signature}>
      <span>{label}</span>
      <b>{name}</b>
      <p>{role}</p>
      <i>{contact}</i>
    </div>
  );
}

function toProposalModel(prospect: Prospect): ProposalModel {
  const currentYear = new Date().getFullYear();
  const sqft = prospect.sqft ?? 142_500;
  const roofAge = prospect.roof_age ?? (prospect.year_built ? currentYear - prospect.year_built : 22);
  const usableRoofPct = 0.74;
  const panelCount = prospect.panel_count ?? Math.max(720, Math.round((sqft * usableRoofPct) / 37));
  const systemKw = prospect.system_kw ?? Math.round(panelCount * 0.4);
  const yearlyKwh = prospect.yearly_kwh ?? Math.round(systemKw * 1287);
  const yearlySavings = prospect.yearly_savings ?? Math.round(yearlyKwh * 0.147);
  const systemCost = prospect.system_cost ?? Math.round(systemKw * 1800);
  const incentiveAmount = prospect.incentive_amount ?? Math.round(systemCost * 0.3);
  const savings25yr = prospect.savings_25yr ?? Math.round(yearlySavings * 25 * 1.03);
  const netCost = Math.max(systemCost - incentiveAmount, yearlySavings * 4.8);
  const paybackYears = clamp(netCost / Math.max(yearlySavings, 1), 4.2, 8.9);
  const roofScore = clampInt(94 - roofAge * 3.2, 18, 58);
  const replaceWindow = roofAge >= 22 ? "0-2 yrs" : roofAge >= 18 ? "2-3 yrs" : "3-5 yrs";
  const roofCondition =
    roofScore <= 28
      ? "End of service life - membrane fatigue"
      : roofScore <= 40
        ? "Aging - seam lift and surface wear"
        : "Fair - monitor before renewal";

  return {
    id: prospect.id,
    company: prospect.company_name,
    owner: prospect.owner_name ?? "the ownership team",
    ownerTitle: prospect.owner_title ?? "Property owner",
    address: prospect.address,
    city: prospect.city,
    sqft,
    yearBuilt: prospect.year_built,
    roofAge,
    roofScore,
    roofCondition,
    roofType: prospect.industry ? `Commercial ${prospect.industry.toLowerCase()} roof` : "Low-slope commercial membrane",
    replaceWindow,
    panelCount,
    systemKw,
    yearlyKwh,
    yearlySavings,
    savings25yr,
    systemCost,
    incentiveAmount,
    paybackYears,
    usableRoofPct,
    offsetPct: 0.82,
    co2Tonnes: Math.round((yearlyKwh / 1000) * 0.356),
    lat: prospect.lat,
    lng: prospect.lng,
    videoUrl: prospect.video_url,
    videoThumbnailUrl: prospect.video_thumbnail_url,
    satelliteImageUrl: prospect.satellite_image_url,
    panelSvgUrl: prospect.panel_svg_url,
    mailto: `mailto:${prospect.owner_email ?? ""}?subject=${encodeURIComponent(`Solar proposal - ${prospect.address}`)}`,
  };
}

function splitAddress(address: string) {
  const parts = address.trim().split(/\s+/);
  return {
    number: parts[0] ?? address,
    street: parts.slice(1).join(" ") || address,
  };
}

function firstName(name: string) {
  return name.split(/\s+/)[0] || "there";
}

function formatCoord(value: number | null, axis: "lat" | "lng") {
  if (value == null) return axis === "lat" ? "43.6532 N" : "79.6711 W";
  const hemisphere = axis === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  return `${Math.abs(value).toFixed(4)} ${hemisphere}`;
}

function fmtInt(value: number) {
  return Math.round(value).toLocaleString("en-CA");
}

function fmtMoney(value: number) {
  return `$${Math.round(value).toLocaleString("en-CA")}`;
}

function fmtMoneyK(value: number) {
  return `$${Math.round(value / 1000).toLocaleString("en-CA")}K`;
}

function fmtMoneyM(value: number) {
  return `$${(value / 1_000_000).toFixed(2)}M`;
}

function fmtMWh(value: number) {
  return `${fmtInt(Math.round(value / 1000))} MWh`;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function clampInt(value: number, min: number, max: number) {
  return Math.round(clamp(value, min, max));
}

function smooth(value: number) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
