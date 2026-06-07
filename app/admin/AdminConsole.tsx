"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Prospect, ProspectStage } from "@/lib/types";

type StageKey = "sourced" | "qualified" | "rendered" | "sent" | "replied" | "booked";

const STAGE_FLOW: { key: StageKey; label: string; stages: ProspectStage[] }[] = [
  { key: "sourced", label: "Sourced", stages: ["sourced", "geocoded"] },
  { key: "qualified", label: "Qualified", stages: ["qualified"] },
  { key: "rendered", label: "Rendered", stages: ["satellite_done", "solar_done", "video_done", "microsite_live"] },
  { key: "sent", label: "Sent", stages: ["emailed", "followed_up"] },
  { key: "replied", label: "Replied", stages: ["replied"] },
  { key: "booked", label: "Booked", stages: ["booked"] },
];

const STAGE_META: Record<StageKey, { label: string; className: string }> = {
  sourced: { label: "Sourced", className: "border-white/12 text-stone-500" },
  qualified: { label: "Qualified", className: "border-[#9fb0bd]/40 text-[#9fb0bd]" },
  rendered: { label: "Rendered", className: "border-[#c2d0db]/45 text-[#c2d0db]" },
  sent: { label: "Sent", className: "border-[#9fb0bd]/60 bg-[#9fb0bd]/10 text-[#9fb0bd]" },
  replied: { label: "Replied", className: "border-[#86a06f]/50 bg-[#86a06f]/10 text-[#a4ba8d]" },
  booked: { label: "Booked", className: "border-[#9fb0bd] bg-[#9fb0bd] text-[#131316]" },
};

const ACTIVITY_KINDS = {
  render: { tag: "RENDER", className: "border-[#9fb0bd]/45 text-[#c2d0db]" },
  panel: { tag: "LAYOUT", className: "border-[#9fb0bd]/40 text-[#9fb0bd]" },
  send: { tag: "SEND", className: "border-[#9fb0bd]/55 text-[#9fb0bd]" },
  qualify: { tag: "QUALIFY", className: "border-white/12 text-stone-500" },
  reply: { tag: "REPLY", className: "border-[#86a06f]/50 text-[#a4ba8d]" },
  source: { tag: "SOURCE", className: "border-white/12 text-stone-500" },
  incentive: { tag: "INCENTIVE", className: "border-[#9fb0bd]/55 text-[#9fb0bd]" },
} as const;

type ActivityKind = keyof typeof ACTIVITY_KINDS;

type ActivityItem = {
  id: string;
  time: string;
  kind: ActivityKind;
  text: string;
};

const CAD = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

const NUMBER = new Intl.NumberFormat("en-CA");

export function AdminConsole({ prospects }: { prospects: Prospect[] }) {
  const router = useRouter();
  const previewRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState(prospects[0]?.id ?? "");
  const [stageFilter, setStageFilter] = useState<StageKey | null>(null);
  const [isPending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);

  const selected = prospects.find((prospect) => prospect.id === selectedId) ?? prospects[0] ?? null;

  const pipeline = useMemo(
    () =>
      STAGE_FLOW.map((item) => ({
        ...item,
        count: prospects.filter((prospect) => item.stages.includes(prospect.stage)).length,
      })),
    [prospects]
  );

  const activeProspects = prospects.filter((prospect) => !["skipped", "dead"].includes(prospect.stage));
  const renderedCount = prospects.filter((prospect) =>
    ["satellite_done", "solar_done", "video_done", "microsite_live"].includes(prospect.stage)
  ).length;
  const bookedCount = prospects.filter((prospect) => prospect.stage === "booked").length;
  const incentiveTotal = activeProspects.reduce((sum, prospect) => sum + (prospect.incentive_amount ?? 0), 0);
  const savingsTotal = activeProspects.reduce((sum, prospect) => sum + (prospect.savings_25yr ?? 0), 0);

  const shownProspects = stageFilter
    ? prospects.filter((prospect) => stagesFor(stageFilter).includes(prospect.stage))
    : prospects;

  async function runPipeline() {
    if (!selected) return;
    setRunning(true);
    try {
      await fetch("/api/pipeline/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id }),
      });
      startTransition(() => router.refresh());
    } finally {
      setRunning(false);
    }
  }

  function pickStage(key: StageKey) {
    const next = stageFilter === key ? null : key;
    setStageFilter(next);
    const first = next ? prospects.find((prospect) => stagesFor(next).includes(prospect.stage)) : prospects[0];
    if (first) setSelectedId(first.id);
  }

  function focusPreview(id: string) {
    setSelectedId(id);
    window.requestAnimationFrame(() => {
      previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="min-h-screen bg-[#131316] text-[#ece9e3] selection:bg-[#9fb0bd]/30">
      <div className="mx-auto max-w-[1660px] px-5 pb-20 pt-6 sm:px-8">
        <header className="flex flex-col gap-5 border-b border-white/[0.07] pb-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <ClawMark />
            <div>
              <div className="text-lg font-semibold tracking-[0.34em]">
                OPEN<span className="text-[#9fb0bd]">CLAW</span>
              </div>
              <div className="mt-1 text-[10.5px] uppercase tracking-[0.28em] text-stone-500">
                Autonomous solar prospecting · Ontario commercial
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[11px] uppercase tracking-[0.16em] text-stone-500 sm:gap-7">
            <div className="flex items-center gap-3 text-stone-300">
              <LiveDot />
              Workshop running
            </div>
            <div>{formatConsoleDate(new Date())}</div>
            <Link
              href="/admin/prospects/new"
              className="border border-[#9fb0bd]/50 px-3 py-2 text-[#c2d0db] transition hover:bg-[#9fb0bd]/10"
            >
              Add prospect
            </Link>
          </div>
        </header>

        <section className="grid border-b border-white/[0.07] sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Processed today" sub="Prospects scanned" value={prospects.length} />
          <MetricCard label="Flyovers generated" sub="Preview assets" value={renderedCount} />
          <MetricCard label="Calls booked" sub="Owner meetings" value={bookedCount} />
          <MetricCard
            label="Incentives flagged"
            sub={`${formatMoneyCompact(savingsTotal)} 25-yr net`}
            value={incentiveTotal / 1_000_000}
            prefix="$"
            unit="M"
            decimals={2}
          />
        </section>

        <section className="flex snap-x gap-0 overflow-x-auto border-b border-white/[0.07] py-6">
          {pipeline.map((item, index) => (
            <div className="flex shrink-0 items-center" key={item.key}>
              <button
                type="button"
                onClick={() => pickStage(item.key)}
                className="group relative flex min-w-[130px] flex-col items-start gap-2 pr-7 text-left opacity-90 transition hover:opacity-100"
              >
                <span
                  className={`font-serif text-3xl leading-none transition group-hover:text-[#c2d0db] ${
                    stageFilter === item.key ? "text-[#9fb0bd]" : "text-[#ece9e3]"
                  }`}
                >
                  <CountUp value={item.count} />
                </span>
                <span className="text-[11px] uppercase tracking-[0.18em] text-stone-500">{item.label}</span>
                <span
                  className={`absolute -bottom-[27px] left-0 h-[7px] w-[7px] rounded-full transition ${
                    stageFilter === item.key ? "bg-[#9fb0bd] shadow-[0_0_0_4px_rgba(159,176,189,0.15)]" : "bg-white/15"
                  }`}
                />
              </button>
              {index < pipeline.length - 1 && (
                <div className="mb-2 pr-7 text-stone-600" aria-hidden="true">
                  <svg width="34" height="10" viewBox="0 0 34 10" fill="none">
                    <path d="M0 5H30M26 1L31 5L26 9" stroke="currentColor" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </section>

        <main className="mt-8 grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <div ref={previewRef}>
              {selected ? (
                <ProspectPreview
                  prospect={selected}
                  isRunning={running || isPending}
                  onRunPipeline={runPipeline}
                />
              ) : (
                <EmptyConsole />
              )}
            </div>

            <ProspectTable
              prospects={shownProspects}
              selectedId={selected?.id ?? ""}
              filter={stageFilter}
              onClearFilter={() => setStageFilter(null)}
              onSelect={focusPreview}
            />
          </div>
          <aside className="xl:sticky xl:top-5">
            <ActivityFeed key={`${selected?.id ?? "empty"}-${prospects.length}`} prospects={prospects} selected={selected} />
          </aside>
        </main>
      </div>
    </div>
  );
}

function ProspectPreview({
  prospect,
  isRunning,
  onRunPipeline,
}: {
  prospect: Prospect;
  isRunning: boolean;
  onRunPipeline: () => void;
}) {
  const model = getProspectModel(prospect);
  const stage = stageFor(prospect.stage);

  return (
    <section className="border border-white/[0.07] bg-gradient-to-b from-[#1a1a1f] to-[#131316] p-5 sm:p-7">
      <div className="border-b border-white/[0.07] pb-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <StagePill stage={stage} label={labelForStage(prospect.stage)} />
          <span className="text-xs text-stone-400">{lastTouch(prospect)}</span>
          {prospect.microsite_url && (
            <a
              href={prospect.microsite_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-[11px] uppercase tracking-[0.14em] text-[#c2d0db] hover:text-[#c2d0db]"
            >
              View microsite
            </a>
          )}
          <Link
            href={`/admin/prospects/${prospect.id}`}
            className="text-[11px] uppercase tracking-[0.14em] text-stone-400 hover:text-stone-100"
          >
            Open record
          </Link>
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <h1 className="font-serif text-3xl font-semibold leading-none tracking-normal text-[#ece9e3] sm:text-4xl">
              {prospect.address || prospect.company_name}
            </h1>
            <p className="mt-3 text-sm text-stone-400">
              {prospect.company_name} · {prospect.city || "Ontario"} · {model.sqftLabel} commercial roof
            </p>
          </div>
          <div className="text-left lg:text-right">
            <div className="font-serif text-3xl text-[#9fb0bd]">
              <CountUp value={model.co2Tonnes} />
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-stone-500">t CO2 / yr avoided</div>
          </div>
        </div>
      </div>

      <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1.32fr)_minmax(300px,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <SatellitePanel key={prospect.id} prospect={prospect} model={model} />
          <FlyoverPanel prospect={prospect} />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Section label="Owner & contact">
            <OwnerCard prospect={prospect} />
          </Section>
          <Section label="Roof condition">
            <RoofAnalysis model={model} />
          </Section>
          <button
            type="button"
            onClick={onRunPipeline}
            disabled={isRunning}
            className="border border-[#9fb0bd] bg-[#9fb0bd] px-4 py-3 text-sm font-semibold text-[#131316] transition hover:bg-[#c2d0db] disabled:cursor-wait disabled:opacity-60"
          >
            {isRunning ? "Running pipeline..." : "Run full pipeline"}
          </button>
        </div>
      </div>

      <div className="mt-7 grid gap-7 border-t border-white/[0.07] pt-7 lg:grid-cols-2">
        <Section label="Building specification">
          <SpecsGrid prospect={prospect} model={model} />
        </Section>
        <Section label="Savings & incentive math">
          <SavingsLedger model={model} />
        </Section>
      </div>
    </section>
  );
}

function SatellitePanel({ prospect, model }: { prospect: Prospect; model: ProspectModel }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setOn(true), 90);
    return () => window.clearTimeout(id);
  }, [prospect.id]);

  const cells = Array.from({ length: 160 });

  return (
    <div className="relative aspect-[16/10] overflow-hidden border border-white/12 bg-[#080a0d]">
      {prospect.satellite_image_url ? (
        <img
          src={prospect.satellite_image_url}
          alt={`Satellite view of ${prospect.address}`}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_25%,rgba(192,138,75,0.16),transparent_28%),linear-gradient(135deg,#101318,#070809)]" />
      )}
      {prospect.panel_svg_url && (
        <img
          src={prospect.panel_svg_url}
          alt="Solar panel layout overlay"
          className="absolute inset-0 h-full w-full object-cover opacity-80"
        />
      )}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:40px_40px]" />
      <div className="absolute left-[23%] top-[26%] h-[46%] w-[54%]">
        <div
          className="grid h-full w-full gap-0.5"
          style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))", gridTemplateRows: "repeat(10, minmax(0, 1fr))" }}
        >
          {cells.map((_, index) => (
            <span
              key={index}
              className={`border border-[#9fb0bd]/45 bg-gradient-to-br from-[#162132] to-[#0e1420] shadow-inner transition duration-300 ${
                on ? "scale-100 opacity-90" : "scale-50 opacity-0"
              }`}
              style={{ transitionDelay: `${Math.min(index * 7, 720)}ms` }}
            />
          ))}
        </div>
        <Corner position="left-[-2px] top-[-2px] border-r-0 border-b-0" />
        <Corner position="right-[-2px] top-[-2px] border-l-0 border-b-0" />
        <Corner position="left-[-2px] bottom-[-2px] border-r-0 border-t-0" />
        <Corner position="right-[-2px] bottom-[-2px] border-l-0 border-t-0" />
      </div>
      <div className="absolute left-3 right-3 top-3 flex justify-between font-mono text-[10px] uppercase tracking-[0.1em] text-stone-200/75">
        <span className="text-[#c2d0db]">Satellite · 0.15 m/px</span>
        <span>{coordinateLabel(prospect)}</span>
      </div>
      <div className="absolute bottom-3 left-3 flex flex-wrap gap-5 border border-white/[0.08] bg-[#080a0d]/70 px-3 py-2 backdrop-blur-sm">
        <Readout label="Array" value={model.panelsLabel} />
        <Readout label="Usable roof" value={model.usableRoofPctLabel} />
        <Readout label="Azimuth" value={model.azimuth} />
        <Readout label="Shading" value={model.shading} />
      </div>
    </div>
  );
}

function FlyoverPanel({ prospect }: { prospect: Prospect }) {
  const ready = Boolean(prospect.video_url);

  return (
    <div className="relative aspect-[16/7.4] overflow-hidden border border-white/12 bg-[#070809]">
      {prospect.video_thumbnail_url || prospect.satellite_image_url ? (
        <img
          src={prospect.video_thumbnail_url ?? prospect.satellite_image_url ?? ""}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-60"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(192,138,75,0.12),transparent_30%),linear-gradient(135deg,#141414,#050505)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-[#070809]/60 via-transparent to-[#070809]/80" />
      <div className="absolute left-4 right-4 top-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em]">
        <span>Cinematic flyover</span>
        <span className={`border px-2 py-1 ${ready ? "border-[#9fb0bd]/50 text-[#c2d0db]" : "border-white/12 text-stone-500"}`}>
          {ready ? "Ready" : "Queued"}
        </span>
      </div>
      {ready ? (
        <>
          <a
            href={prospect.video_url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute left-1/2 top-[46%] flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-stone-200/60 bg-[#080a0d]/50 transition hover:scale-105 hover:border-[#9fb0bd] hover:bg-[#9fb0bd]/15"
            aria-label="Open flyover video"
          >
            <span className="ml-1 h-0 w-0 border-y-[10px] border-l-[16px] border-y-transparent border-l-stone-100" />
          </a>
          <div className="absolute bottom-3 left-4 right-4 flex items-center gap-3">
            <span className="font-mono text-[10px] text-stone-300">0:00</span>
            <span className="h-px flex-1 bg-white/20">
              <span className="block h-px w-2/3 bg-[#9fb0bd]" />
            </span>
            <span className="font-mono text-[10px] text-stone-300">0:48</span>
          </div>
        </>
      ) : (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[11px] uppercase tracking-[0.16em] text-stone-500">
          Flyover queued for render
        </div>
      )}
    </div>
  );
}

function OwnerCard({ prospect }: { prospect: Prospect }) {
  return (
    <div className="border border-white/[0.07] bg-[#1a1a1f]">
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] p-4">
        <div className="min-w-0">
          <div className="font-serif text-xl font-semibold">{prospect.owner_name ?? "Owner research pending"}</div>
          <div className="mt-1 text-xs text-stone-400">
            {prospect.owner_title ?? "Facilities contact"} · {prospect.company_name}
          </div>
        </div>
        <span className="shrink-0 border border-[#86a06f]/45 px-2 py-1 text-[8.5px] uppercase tracking-[0.14em] text-[#a4ba8d]">
          {prospect.enrichment_confidence ? `${Math.round(prospect.enrichment_confidence * 100)}% verified` : "Review"}
        </span>
      </div>
      <div className="grid sm:grid-cols-2">
        <ContactLink label="Direct" value={prospect.owner_mobile ?? "Pending"} href={prospect.owner_mobile ? `tel:${prospect.owner_mobile.replace(/[^\d+]/g, "")}` : undefined} />
        <ContactLink label="Email" value={prospect.owner_email ?? "Pending"} href={prospect.owner_email ? `mailto:${prospect.owner_email}` : undefined} />
      </div>
    </div>
  );
}

function RoofAnalysis({ model }: { model: ProspectModel }) {
  return (
    <div className="border border-white/[0.07] bg-[#1a1a1f] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-serif text-4xl font-semibold">
            {model.roofScore}
            <span className="text-base font-normal text-stone-500">/100</span>
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-stone-500">Condition index</div>
        </div>
        <span className={`border px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] ${model.urgencyClass}`}>
          {model.urgency}
        </span>
      </div>
      <div className="relative mt-4 h-1.5 bg-white/[0.07]">
        <div
          className="absolute left-0 top-0 h-full bg-gradient-to-r from-[#6c7c89] to-[#c8704a]"
          style={{ width: `${100 - model.roofScore}%` }}
        />
        <span className="absolute right-0 top-2 text-[9.5px] uppercase tracking-[0.1em] text-stone-500">
          Degradation {100 - model.roofScore}%
        </span>
      </div>
      <div className="mt-8 divide-y divide-white/[0.07]">
        <RoofLine label="Roof age" value={model.roofAgeLabel} />
        <RoofLine label="Observed" value={model.roofCondition} />
        <RoofLine label="Replacement window" value={model.replacementWindow} hot />
      </div>
      <p className="mt-4 border-l-2 border-[#6c7c89] pl-3 text-xs leading-6 text-stone-500">
        Re-roof plus solar in a single mobilization, with membrane replacement and array install reviewed as one scope.
      </p>
    </div>
  );
}

function SpecsGrid({ prospect, model }: { prospect: Prospect; model: ProspectModel }) {
  const specs = [
    ["Gross floor area", model.sqftLabel],
    ["Year built", prospect.year_built?.toString() ?? "Pending"],
    ["Stories", "1"],
    ["Roof assembly", model.roofType],
    ["Roof slope", "Low-slope"],
    ["Array azimuth", model.azimuth],
    ["Usable roof", model.usableRoofPctLabel],
    ["Parcel ID", prospect.slug || prospect.id.slice(0, 8)],
  ];

  return (
    <div className="grid border border-white/[0.07] bg-white/[0.07] sm:grid-cols-2">
      {specs.map(([label, value]) => (
        <div className="bg-[#1a1a1f] p-4" key={label}>
          <div className="text-[10px] uppercase tracking-[0.12em] text-stone-500">{label}</div>
          <div className="mt-1 text-sm font-medium">{value}</div>
        </div>
      ))}
    </div>
  );
}

function SavingsLedger({ model }: { model: ProspectModel }) {
  const rows = [
    ["Usable roof area", model.usableRoofLabel],
    ["Modules", model.panelsLabel],
    ["System size (DC)", model.systemLabel],
    ["Specific yield", model.yieldLabel],
    ["Annual generation", model.annualKwhLabel],
    ["Grid offset", model.offsetLabel],
    ["Blended rate", "$0.147 /kWh"],
  ];

  return (
    <div className="border border-white/[0.07] bg-[#1a1a1f] p-5">
      <div>
        {rows.map(([label, value]) => (
          <div className="flex items-baseline gap-2 py-2 text-sm" key={label}>
            <span className="shrink-0 text-stone-400">{label}</span>
            <span className="mb-1 flex-1 border-b border-dotted border-white/15" />
            <span className="shrink-0 font-mono text-xs">{value}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-white/12 pt-4">
        <span className="text-xs uppercase tracking-[0.1em] text-stone-400">Annual energy savings</span>
        <span className="font-serif text-3xl font-semibold text-[#9fb0bd]">
          <CountUp value={model.annualSavings} format={formatMoney} />
        </span>
      </div>
      <div className="mt-5 grid border border-white/[0.07] bg-white/[0.07] sm:grid-cols-3">
        <LedgerMetric value={formatMoneyCompact(model.incentive)} label="Incentive stack" />
        <LedgerMetric value={model.paybackLabel} label="Simple payback" />
        <LedgerMetric value={formatMoneyCompact(model.lifetimeSavings)} label="25-yr net" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {["Save on Energy Retrofit", "Federal Clean Tech ITC", model.systemKw ? "Commercial net metering" : "Awaiting solar model"].map((program) => (
          <span className="border border-white/12 px-2.5 py-1.5 text-[10.5px] text-stone-400" key={program}>
            {program}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProspectTable({
  prospects,
  selectedId,
  filter,
  onClearFilter,
  onSelect,
}: {
  prospects: Prospect[];
  selectedId: string;
  filter: StageKey | null;
  onClearFilter: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="mt-8">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-2xl font-semibold">Prospect roster</h2>
        {filter ? (
          <button
            type="button"
            onClick={onClearFilter}
            className="border border-[#9fb0bd]/45 px-3 py-1.5 text-[11px] uppercase tracking-[0.1em] text-[#9fb0bd] transition hover:bg-[#9fb0bd]/10"
          >
            {STAGE_META[filter].label} · clear
          </button>
        ) : (
          <span className="text-[11px] uppercase tracking-[0.16em] text-stone-500">{prospects.length} active · Ontario</span>
        )}
      </div>

      <div className="overflow-x-auto border border-white/[0.07]">
        <div className="min-w-[860px]">
          <div className="grid grid-cols-[2.2fr_1.8fr_1.1fr_1.15fr_1.1fr_0.9fr] gap-4 border-b border-white/[0.07] px-5 py-3 text-[9.5px] uppercase tracking-[0.16em] text-stone-500">
            <div>Property</div>
            <div>Owner</div>
            <div>Roof age</div>
            <div>System</div>
            <div className="text-right">Net / yr</div>
            <div>Stage</div>
          </div>
          {prospects.map((prospect) => {
            const model = getProspectModel(prospect);
            const stage = stageFor(prospect.stage);
            return (
              <button
                type="button"
                key={prospect.id}
                onClick={() => onSelect(prospect.id)}
                className={`grid w-full grid-cols-[2.2fr_1.8fr_1.1fr_1.15fr_1.1fr_0.9fr] items-center gap-4 border-b border-white/[0.07] px-5 py-4 text-left transition last:border-b-0 hover:bg-[#1a1a1f] ${
                  prospect.id === selectedId ? "bg-[#212128] shadow-[inset_2px_0_0_#9fb0bd]" : ""
                }`}
              >
                <Cell primary={prospect.address || prospect.company_name} secondary={`${prospect.city || "Ontario"} · ${model.sqftLabel}`} />
                <Cell primary={prospect.owner_name ?? "Owner pending"} secondary={prospect.company_name} />
                <Cell primary={model.roofAgeShort} secondary={model.roofTypeShort} mono />
                <Cell primary={model.systemLabel} secondary={model.panelsLabel} mono />
                <Cell primary={formatMoney(model.annualSavings)} secondary={model.paybackLabel} mono align="right" accent />
                <div>
                  <StagePill stage={stage} label={labelForStage(prospect.stage)} />
                </div>
              </button>
            );
          })}
          {prospects.length === 0 && (
            <div className="px-5 py-12 text-center text-sm text-stone-500">
              No prospects in this view.{" "}
              <Link href="/admin/prospects/new" className="text-[#9fb0bd] underline underline-offset-4">
                Add one
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ActivityFeed({ prospects, selected }: { prospects: Prospect[]; selected: Prospect | null }) {
  const initial = useMemo(() => buildActivity(prospects, selected), [prospects, selected]);
  const [items, setItems] = useState(initial);

  useEffect(() => {
    if (!selected) return;
    const stream = activityStream(selected);
    let index = 0;
    const id = window.setInterval(() => {
      const next = stream[index % stream.length];
      index += 1;
      setItems((current) => [
        { ...next, id: `${Date.now()}-${index}`, time: "now" },
        ...current.map((item) => ({ ...item, time: bumpTime(item.time) })),
      ].slice(0, 9));
    }, 5200);
    return () => window.clearInterval(id);
  }, [selected]);

  return (
    <section className="border border-white/[0.07] bg-[#1a1a1f]">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-4">
        <div className="flex items-center gap-3 text-xs uppercase tracking-[0.16em]">
          <LiveDot />
          Live activity
        </div>
        <div className="text-[9.5px] uppercase tracking-[0.14em] text-stone-500">agent · running</div>
      </div>
      <div className="max-h-[calc(100vh-120px)] overflow-auto">
        {items.map((item, index) => {
          const meta = ACTIVITY_KINDS[item.kind];
          return (
            <div className="flex gap-3 border-b border-white/[0.07] px-4 py-3 last:border-b-0" key={item.id}>
              <div className="w-8 shrink-0 pt-0.5 font-mono text-[10px] text-stone-600">{index === 0 ? item.time : item.time}</div>
              <div className="text-xs leading-6">
                <span className={`mr-2 inline-block border px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em] ${meta.className}`}>
                  {meta.tag}
                </span>
                <span className="text-stone-400">{item.text}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CountUp({
  value,
  format = formatNumber,
  decimals = 0,
}: {
  value: number;
  format?: (value: number) => string;
  decimals?: number;
}) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const start = 0;
    const duration = 900;
    const started = Date.now();
    const id = window.setInterval(() => {
      const progress = Math.min(1, (Date.now() - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(start + (value - start) * eased);
      if (progress >= 1) window.clearInterval(id);
    }, 16);
    return () => window.clearInterval(id);
  }, [value]);

  const rounded = decimals ? Number(current.toFixed(decimals)) : Math.round(current);
  return <>{format(rounded)}</>;
}

function MetricCard({
  value,
  label,
  sub,
  prefix = "",
  unit = "",
  decimals = 0,
}: {
  value: number;
  label: string;
  sub: string;
  prefix?: string;
  unit?: string;
  decimals?: number;
}) {
  return (
    <div className="border-b border-r border-white/[0.07] border-b-transparent px-0 py-6 sm:px-7 first:sm:pl-0">
      <div className="font-serif text-[42px] font-medium leading-none text-[#ece9e3]">
        {prefix}
        <CountUp value={value} decimals={decimals} format={(n) => (decimals ? n.toFixed(decimals) : formatNumber(n))} />
        {unit && <span className="ml-1 text-2xl text-[#9fb0bd]">{unit}</span>}
      </div>
      <div className="mt-3 text-xs tracking-wide text-stone-400">{label}</div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-stone-600">{sub}</div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-4 text-[10.5px] uppercase tracking-[0.26em] text-stone-500">
        <span>{label}</span>
        <span className="h-px flex-1 bg-white/[0.07]" />
      </div>
      {children}
    </section>
  );
}

function StagePill({ stage, label }: { stage: StageKey; label: string }) {
  return (
    <span className={`inline-flex border px-2.5 py-1 text-[9.5px] uppercase tracking-[0.14em] ${STAGE_META[stage].className}`}>
      {label}
    </span>
  );
}

function ContactLink({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = (
    <>
      <span className="text-[9px] uppercase tracking-[0.16em] text-stone-500">{label}</span>
      <span className="overflow-hidden text-ellipsis font-mono text-xs">{value}</span>
    </>
  );

  if (!href) {
    return <div className="flex min-w-0 flex-col gap-1 border-b border-white/[0.07] p-4 sm:border-b-0 sm:border-r">{content}</div>;
  }

  return (
    <a className="flex min-w-0 flex-col gap-1 border-b border-white/[0.07] p-4 transition hover:bg-[#212128] sm:border-b-0 sm:border-r" href={href}>
      {content}
    </a>
  );
}

function Cell({
  primary,
  secondary,
  mono,
  accent,
  align,
}: {
  primary: string;
  secondary: string;
  mono?: boolean;
  accent?: boolean;
  align?: "right";
}) {
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : ""}`}>
      <div className={`truncate text-sm ${mono ? "font-mono text-xs" : ""} ${accent ? "text-[#c2d0db]" : "text-[#ece9e3]"}`}>
        {primary}
      </div>
      <div className="mt-1 truncate text-[10.5px] text-stone-600">{secondary}</div>
    </div>
  );
}

function LedgerMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-[#1a1a1f] p-4">
      <div className="font-serif text-2xl font-medium">{value}</div>
      <div className="mt-2 text-[9.5px] uppercase tracking-[0.14em] text-stone-500">{label}</div>
    </div>
  );
}

function RoofLine({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <span className="text-stone-400">{label}</span>
      <b className={`text-right font-medium ${hot ? "text-[#c8704a]" : ""}`}>{value}</b>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[8.5px] uppercase tracking-[0.16em] text-stone-500">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}

function Corner({ position }: { position: string }) {
  return <span className={`absolute h-4 w-4 border border-[#9fb0bd] ${position}`} />;
}

function ClawMark() {
  return (
    <svg className="h-[30px] w-[30px] shrink-0" viewBox="0 0 30 30" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="28" height="28" stroke="#9fb0bd" strokeWidth="1" opacity="0.5" />
      <path d="M15 5L15 25M8 9L8 21M22 9L22 21" stroke="#9fb0bd" strokeWidth="1.4" strokeLinecap="square" />
      <circle cx="15" cy="15" r="3.4" fill="#9fb0bd" />
    </svg>
  );
}

function LiveDot() {
  return (
    <span className="relative inline-block h-2 w-2 rounded-full bg-[#9fb0bd] after:absolute after:inset-[-4px] after:rounded-full after:border after:border-[#9fb0bd] after:opacity-60 after:content-[''] after:animate-[pulse_2.4s_ease-out_infinite]" />
  );
}

function EmptyConsole() {
  return (
    <div className="border border-white/[0.07] bg-[#1a1a1f] px-6 py-16 text-center text-stone-500">
      No prospects yet.{" "}
      <Link href="/admin/prospects/new" className="text-[#9fb0bd] underline underline-offset-4">
        Add the first prospect
      </Link>
      .
    </div>
  );
}

type ProspectModel = ReturnType<typeof getProspectModel>;

function getProspectModel(prospect: Prospect) {
  const roofAge = prospect.roof_age ?? (prospect.year_built ? new Date().getFullYear() - prospect.year_built : null);
  const sqft = prospect.sqft ?? 0;
  const usableRoofPct = sqft ? 0.74 : 0;
  const usableRoof = Math.round(sqft * usableRoofPct);
  const panels = prospect.panel_count ?? (usableRoof ? Math.max(0, Math.round(usableRoof / 52)) : 0);
  const systemKw = prospect.system_kw ?? (panels ? Math.round(panels * 0.41) : 0);
  const annualKwh = prospect.yearly_kwh ?? (systemKw ? Math.round(systemKw * 1280) : 0);
  const annualSavings = prospect.yearly_savings ?? (annualKwh ? Math.round(annualKwh * 0.147) : 0);
  const lifetimeSavings = prospect.savings_25yr ?? Math.round(annualSavings * 21.5);
  const incentive = prospect.incentive_amount ?? (systemKw ? Math.round(systemKw * 390) : 0);
  const roofScore = roofAge == null ? 62 : Math.max(18, Math.min(88, 92 - roofAge * 3));
  const urgency = roofScore <= 28 ? "Critical" : roofScore <= 40 ? "Elevated" : "Moderate";
  const urgencyClass =
    roofScore <= 28
      ? "border-[#c8704a]/50 bg-[#c8704a]/10 text-[#c8704a]"
      : roofScore <= 40
        ? "border-[#9fb0bd]/45 text-[#c2d0db]"
        : "border-white/12 text-stone-400";

  return {
    sqftLabel: sqft ? `${formatNumber(sqft)} sqft` : "Pending",
    usableRoof,
    usableRoofLabel: usableRoof ? `${formatNumber(usableRoof)} sqft` : "Pending",
    usableRoofPctLabel: usableRoofPct ? `${Math.round(usableRoofPct * 100)}%` : "Pending",
    panels,
    panelsLabel: panels ? `${formatNumber(panels)} modules` : "Pending",
    systemKw,
    systemLabel: systemKw ? `${formatNumber(systemKw)} kW` : "Pending",
    annualKwh,
    annualKwhLabel: annualKwh ? `${formatNumber(annualKwh)} kWh` : "Pending",
    annualSavings,
    lifetimeSavings,
    incentive,
    yieldLabel: systemKw && annualKwh ? `${formatNumber(Math.round(annualKwh / systemKw))} kWh/kW` : "Pending",
    offsetLabel: systemKw ? "82%" : "Pending",
    paybackLabel: annualSavings ? `${Math.max(4.8, Math.min(8.6, lifetimeSavings / Math.max(annualSavings, 1) / 4.3)).toFixed(1)} yr` : "Pending",
    roofAgeLabel: roofAge == null ? "Pending" : `${roofAge} yrs / 25 typical`,
    roofAgeShort: roofAge == null ? "Pending" : `${roofAge} yrs`,
    roofScore,
    urgency,
    urgencyClass,
    roofCondition: roofAge == null ? "Awaiting roof record" : roofAge >= 22 ? "End of service life" : roofAge >= 17 ? "Aging membrane" : "Fair condition",
    replacementWindow: roofAge == null ? "Pending" : roofAge >= 22 ? "0-2 yrs" : roofAge >= 17 ? "1-3 yrs" : "5-7 yrs",
    roofType: prospect.year_built && prospect.year_built < 1998 ? "Built-up gravel" : "Modified bitumen",
    roofTypeShort: prospect.year_built && prospect.year_built < 1998 ? "BUR gravel" : "Mod-bitumen",
    azimuth: prospect.lng && prospect.lng < -79.65 ? "182° S" : "176° S",
    shading: "Negligible",
    co2Tonnes: annualKwh ? Math.round(annualKwh * 0.000356) : 0,
  };
}

function stageFor(stage: ProspectStage): StageKey {
  if (stage === "booked") return "booked";
  if (stage === "replied") return "replied";
  if (stage === "emailed" || stage === "followed_up") return "sent";
  if (["satellite_done", "solar_done", "video_done", "microsite_live"].includes(stage)) return "rendered";
  if (stage === "qualified") return "qualified";
  return "sourced";
}

function stagesFor(stage: StageKey): ProspectStage[] {
  return STAGE_FLOW.find((item) => item.key === stage)?.stages ?? [];
}

function labelForStage(stage: ProspectStage) {
  if (stage === "dead") return "Dead";
  if (stage === "skipped") return "Skipped";
  return STAGE_META[stageFor(stage)].label;
}

function buildActivity(prospects: Prospect[], selected: Prospect | null): ActivityItem[] {
  const rows = prospects.slice(0, 6);
  const fallback = selected ? [selected] : rows;
  const source = rows.length ? rows : fallback;

  return source.slice(0, 6).map((prospect, index) => ({
    id: `${prospect.id}-${index}`,
    time: `${index + 1}m`,
    kind: activityKindFor(prospect.stage),
    text: activityText(prospect),
  }));
}

function activityStream(prospect: Prospect): ActivityItem[] {
  return [
    { id: "a", time: "now", kind: "panel", text: `Panel layout refreshed for ${prospect.address || prospect.company_name}.` },
    { id: "b", time: "now", kind: "render", text: `Flyover render checked for ${prospect.company_name}.` },
    { id: "c", time: "now", kind: "incentive", text: `Incentive stack recalculated for ${prospect.city || "Ontario"} prospect.` },
  ];
}

function activityKindFor(stage: ProspectStage): ActivityKind {
  if (stage === "replied" || stage === "booked") return "reply";
  if (stage === "emailed" || stage === "followed_up") return "send";
  if (["satellite_done", "solar_done", "video_done", "microsite_live"].includes(stage)) return "render";
  if (stage === "qualified") return "qualify";
  return "source";
}

function activityText(prospect: Prospect) {
  const target = prospect.address || prospect.company_name;
  if (prospect.stage === "booked") return `Discovery call booked with ${prospect.owner_name ?? prospect.company_name}.`;
  if (prospect.stage === "replied") return `Owner reply captured for ${target}.`;
  if (prospect.stage === "emailed" || prospect.stage === "followed_up") return `Personalized proposal sent to ${prospect.owner_email ?? prospect.company_name}.`;
  if (["satellite_done", "solar_done", "video_done", "microsite_live"].includes(prospect.stage)) return `Rendering package ready for ${target}.`;
  if (prospect.stage === "qualified") return `Roof age and owner match qualified for ${target}.`;
  return `Assessor record sourced for ${target}.`;
}

function lastTouch(prospect: Prospect) {
  if (prospect.stage === "booked") return "Discovery call booked";
  if (prospect.stage === "replied") return "Owner replied";
  if (prospect.email_sent_at) return `Proposal sent ${shortDate(prospect.email_sent_at)}`;
  if (prospect.microsite_url) return "Microsite live";
  if (prospect.video_url) return "Flyover render ready";
  if (prospect.panel_count) return "Solar layout modeled";
  return "Awaiting next agent step";
}

function coordinateLabel(prospect: Prospect) {
  if (prospect.lat && prospect.lng) {
    return `${Math.abs(prospect.lat).toFixed(4)}° N · ${Math.abs(prospect.lng).toFixed(4)}° W`;
  }
  return "43.6532° N · 79.6711° W";
}

function bumpTime(time: string) {
  if (time === "now") return "1m";
  const minutes = Number.parseInt(time, 10);
  return Number.isFinite(minutes) ? `${minutes + 1}m` : time;
}

function formatConsoleDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(new Date(value));
}

function formatNumber(value: number) {
  return NUMBER.format(Math.round(value));
}

function formatMoney(value: number) {
  return CAD.format(Math.round(value));
}

function formatMoneyCompact(value: number) {
  if (!value) return "$0";
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return formatMoney(value);
}
