"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { buildProposalPath } from "@/lib/proposals";
import type { Prospect, ProspectStage } from "@/lib/types";

type StageKey = "sourced" | "qualified" | "rendered" | "published" | "sent" | "replied" | "booked";

// the console only lists published proposals (listProposals), so the funnel
// starts at Published — earlier stages live in the prospect CRM
const STAGE_FLOW: { key: StageKey; label: string; stages: ProspectStage[] }[] = [
  { key: "published", label: "Published", stages: ["microsite_live"] },
  { key: "sent", label: "Sent", stages: ["emailed", "followed_up"] },
  { key: "replied", label: "Replied", stages: ["replied"] },
  { key: "booked", label: "Booked", stages: ["booked"] },
];

const STAGE_META: Record<StageKey, { label: string; className: string }> = {
  sourced: { label: "Sourced", className: "border-white/12 text-stone-500" },
  qualified: { label: "Qualified", className: "border-[#c08a4b]/40 text-[#c08a4b]" },
  rendered: { label: "Rendered", className: "border-[#d8a866]/45 text-[#d8a866]" },
  published: { label: "Published", className: "border-[#c08a4b]/60 bg-[#c08a4b]/10 text-[#d8a866]" },
  sent: { label: "Sent", className: "border-[#c08a4b]/60 bg-[#c08a4b]/10 text-[#c08a4b]" },
  replied: { label: "Replied", className: "border-[#86a06f]/50 bg-[#86a06f]/10 text-[#a4ba8d]" },
  booked: { label: "Booked", className: "border-[#c08a4b] bg-[#c08a4b] text-[#131316]" },
};

const ACTIVITY_KINDS = {
  render: { tag: "RENDER", className: "border-[#c08a4b]/45 text-[#d8a866]" },
  publish: { tag: "PUBLISH", className: "border-[#c08a4b]/55 text-[#d8a866]" },
  panel: { tag: "LAYOUT", className: "border-[#c08a4b]/40 text-[#c08a4b]" },
  send: { tag: "SEND", className: "border-[#c08a4b]/55 text-[#c08a4b]" },
  qualify: { tag: "QUALIFY", className: "border-white/12 text-stone-500" },
  reply: { tag: "REPLY", className: "border-[#86a06f]/50 text-[#a4ba8d]" },
  source: { tag: "SOURCE", className: "border-white/12 text-stone-500" },
  incentive: { tag: "INCENTIVE", className: "border-[#c08a4b]/55 text-[#c08a4b]" },
} as const;

type ActivityKind = keyof typeof ACTIVITY_KINDS;

type ProspectHistoryItem = {
  time: string;
  kind: ActivityKind;
  text: string;
};

type OperatorMetric = {
  label: string;
  value: number;
  prefix?: string;
  unit?: string;
  decimals?: number;
};

const CAD = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

const NUMBER = new Intl.NumberFormat("en-CA");

export function AdminConsole({ prospects }: { prospects: Prospect[] }) {
  const [selectedId, setSelectedId] = useState(prospects[0]?.id ?? "");
  const [stageFilter, setStageFilter] = useState<StageKey | null>(null);

  const selected = prospects.find((prospect) => prospect.id === selectedId) ?? prospects[0] ?? null;

  const pipeline = useMemo(
    () =>
      STAGE_FLOW.map((item) => ({
        ...item,
        count: prospects.filter((prospect) => item.stages.includes(prospect.stage)).length,
      })),
    [prospects]
  );

  const flyoverCount = prospects.filter((prospect) => Boolean(prospect.video_url)).length;
  const awaitingOutreach = prospects.filter((prospect) => prospect.stage === "microsite_live").length;
  const bookedCount = prospects.filter((prospect) => prospect.stage === "booked").length;
  const incentiveTotal = prospects.reduce((sum, prospect) => sum + (prospect.incentive_amount ?? 0), 0);

  const shownProspects = stageFilter
    ? prospects.filter((prospect) => stagesFor(stageFilter).includes(prospect.stage))
    : prospects;

  function pickStage(key: StageKey) {
    const next = stageFilter === key ? null : key;
    setStageFilter(next);
    const first = next ? prospects.find((prospect) => stagesFor(next).includes(prospect.stage)) : prospects[0];
    if (first) setSelectedId(first.id);
  }

  function focusPreview(id: string) {
    setSelectedId(id);
  }

  return (
    <div className="min-h-screen bg-[#131316] text-[#ece9e3] selection:bg-[#c08a4b]/30">
      <div className="mx-auto max-w-[1660px] px-5 pb-20 pt-6 sm:px-8">
        <header className="flex flex-col gap-5 border-b border-white/[0.07] pb-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <ClawMark />
            <div>
              <div className="text-lg font-semibold tracking-[0.34em]">
                OPEN<span className="text-[#c08a4b]">CLAW</span>
              </div>
              <div className="mt-1 text-[10.5px] uppercase tracking-[0.28em] text-stone-500">
                Proposal console · final products
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-stone-500 sm:gap-4">
            <div className="flex items-center gap-3 text-stone-300">
              <LiveDot />
              Workshop running
            </div>
            <div>{formatConsoleDate(new Date())}</div>
            <Link
              href="/admin/prospects"
              className="border border-white/12 px-3 py-2 text-stone-300 transition hover:bg-[#212128]"
            >
              Prospect CRM
            </Link>
            <Link
              href="/admin/prospects/new"
              className="border border-[#c08a4b]/50 px-3 py-2 text-[#d8a866] transition hover:bg-[#c08a4b]/10"
            >
              Add Prospect
            </Link>
          </div>
        </header>

        <OperatorMenu
          metrics={[
            { label: "Proposal pages live", value: prospects.length },
            { label: "Flyovers ready", value: flyoverCount },
            { label: "Awaiting outreach", value: awaitingOutreach },
            { label: "Calls booked", value: bookedCount },
            {
              label: "Incentive dollars flagged",
              value: incentiveTotal / 1_000_000,
              prefix: "$",
              unit: "M",
              decimals: 2,
            },
          ]}
          pipeline={pipeline}
          activeStage={stageFilter}
          onPickStage={pickStage}
        />

        <main className="mt-[26px] grid items-start gap-[30px] xl:grid-cols-[392px_minmax(0,1fr)]">
          <aside className="xl:sticky xl:top-[18px]">
            <ProposalList
              prospects={shownProspects}
              totalCount={prospects.length}
              selectedId={selected?.id ?? ""}
              filter={stageFilter}
              onClearFilter={() => setStageFilter(null)}
              onSelect={focusPreview}
            />
          </aside>
          <div className="min-w-0">
            {selected ? <ProspectPreview prospect={selected} /> : <EmptyConsole />}
          </div>
        </main>
      </div>
    </div>
  );
}

function ProspectPreview({ prospect }: { prospect: Prospect }) {
  const model = getProspectModel(prospect);
  const stage = stageFor(prospect.stage);

  return (
    <section className="border border-white/[0.07] bg-gradient-to-b from-[#1a1a1f] to-[#131316] px-5 pb-[30px] pt-7 sm:px-[30px]">
      <div className="mb-6 border-b border-white/[0.07] pb-[22px]">
        <div className="mb-[14px] flex flex-wrap items-center gap-[14px]">
          <StagePill stage={stage} label={labelForStage(prospect.stage)} />
          <span className="text-xs text-stone-400">{lastTouch(prospect)}</span>
          {prospect.microsite_url && (
            <Link
              href={buildProposalPath(prospect.slug)}
              className="ml-auto text-[11px] uppercase tracking-[0.14em] text-[#d8a866] hover:text-[#d8a866]"
            >
              View page
            </Link>
          )}
          <Link
            href={`/admin/prospects/${prospect.id}`}
            className="text-[11px] uppercase tracking-[0.14em] text-stone-400 hover:text-stone-100"
          >
            Open record
          </Link>
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-[30px]">
          <div className="min-w-0">
            <h1 className="font-serif text-[34px] font-semibold leading-none tracking-normal text-[#ece9e3] sm:text-[36px]">
              {prospect.address || prospect.company_name}
            </h1>
            <p className="mt-[11px] text-[12.5px] tracking-[0.01em] text-stone-400">
              {formatProspectSubline(prospect, model)}
            </p>
          </div>
          <div className="text-left lg:text-right">
            <div className="font-serif text-[26px] leading-none text-[#c08a4b]">
              <CountUp value={model.co2Tonnes} />
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-stone-500">t CO2 / yr avoided</div>
          </div>
        </div>
      </div>

      <div className="mb-[14px] flex items-center justify-between gap-4 border border-white/[0.07] bg-[#1a1a1f] px-[18px] py-[15px]">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-[14px] gap-y-1">
          <span className="font-serif text-[19px] font-semibold leading-none text-[#ece9e3]">
            {prospect.owner_name ?? "Owner research pending"}
          </span>
          <span className="truncate text-[12.5px] text-stone-400">
            {prospect.owner_title ?? "Facilities contact"} · {prospect.company_name}
          </span>
        </div>
        {prospect.owner_name && (prospect.owner_email || prospect.owner_mobile) ? (
          <span className="shrink-0 border border-[#86a06f]/45 px-2 py-1 text-[8.5px] uppercase tracking-[0.14em] text-[#a4ba8d]">
            OWNER VERIFIED
          </span>
        ) : (
          <span className="shrink-0 border border-white/12 px-2 py-1 text-[8.5px] uppercase tracking-[0.14em] text-stone-500">
            OWNER PENDING
          </span>
        )}
      </div>

      <FlyoverPanel prospect={prospect} />

      <div className="mt-[26px]">
        <Section label="Activity history">
          <ProspectHistory prospect={prospect} />
        </Section>
      </div>

      <div className="mt-[26px] grid gap-[30px] lg:grid-cols-2">
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

function FlyoverPanel({ prospect }: { prospect: Prospect }) {
  const ready = Boolean(prospect.video_url);

  return (
    <div className="relative aspect-[2.75/1] overflow-hidden border border-white/12 bg-[#070809]">
      {prospect.video_thumbnail_url || prospect.satellite_image_url ? (
        <Image
          src={prospect.video_thumbnail_url ?? prospect.satellite_image_url ?? ""}
          alt=""
          fill
          unoptimized
          sizes="(min-width: 1280px) calc(100vw - 500px), 100vw"
          className="absolute inset-0 h-full w-full object-cover opacity-60"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(192,138,75,0.12),transparent_30%),linear-gradient(135deg,#141414,#050505)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-[#070809]/60 via-transparent to-[#070809]/80" />
      {ready ? (
        <video
          key={prospect.video_url}
          src={prospect.video_url ?? undefined}
          poster={prospect.video_thumbnail_url ?? prospect.satellite_image_url ?? undefined}
          controls
          preload="metadata"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      <div className="pointer-events-none absolute left-4 right-4 top-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em]">
        <span className="text-stone-100/85">CINEMATIC FLYOVER</span>
        <span className={`border px-2 py-1 ${ready ? "border-[#c08a4b]/50 text-[#d8a866]" : "border-white/12 text-stone-500"}`}>
          {ready ? "READY" : "NOT RENDERED"}
        </span>
      </div>
      {!ready ? (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[11px] uppercase tracking-[0.16em] text-stone-500">
          Flyover queued for render
        </div>
      ) : null}
    </div>
  );
}

function SpecsGrid({ prospect, model }: { prospect: Prospect; model: ProspectModel }) {
  const specs = [
    ["Gross floor area", model.sqftLabel],
    ["Year built", prospect.year_built?.toString() ?? "Pending"],
    ["Roof age", model.roofAgeLabel],
    ["Roof assembly", model.roofType],
    ["Industry", prospect.industry ?? "Commercial"],
    ["Modules placed", model.panelsLabel],
    ["Usable roof", model.usableRoofPctLabel],
    ["Record ID", prospect.slug || prospect.id.slice(0, 8)],
  ];

  return (
    <div className="grid bg-white/[0.07] sm:grid-cols-2">
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
    ["Blended rate", "$0.130 /kWh (modelled)"],
  ];

  return (
    <div className="p-5">
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
        <span className="font-serif text-3xl font-semibold text-[#c08a4b]">
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

function ProposalList({
  prospects,
  totalCount,
  selectedId,
  filter,
  onClearFilter,
  onSelect,
}: {
  prospects: Prospect[];
  totalCount: number;
  selectedId: string;
  filter: StageKey | null;
  onClearFilter: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="flex max-h-[calc(100vh-34px)] min-h-0 flex-col border border-white/[0.07] bg-[#1a1a1f]">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/[0.07] px-[15px] py-[13px]">
        <h2 className="text-xs uppercase tracking-[0.16em] text-[#ece9e3]">Proposal roster</h2>
        {filter ? (
          <button
            type="button"
            onClick={onClearFilter}
            className="border border-[#c08a4b]/45 px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-[#c08a4b] transition hover:bg-[#c08a4b]/10"
          >
            {STAGE_META[filter].label} x
          </button>
        ) : (
          <span className="text-[9.5px] uppercase tracking-[0.14em] text-stone-500">{totalCount} proposals live</span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {prospects.map((prospect) => {
          const model = getProspectModel(prospect);
          const stage = stageFor(prospect.stage);
          return (
            <div
              key={prospect.id}
              className={`relative block w-full border-b border-white/[0.07] px-4 py-[13px] text-left transition last:border-b-0 hover:bg-[#212128] ${
                prospect.id === selectedId ? "bg-[#212128] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-[#c08a4b]" : ""
              }`}
            >
              <button type="button" onClick={() => onSelect(prospect.id)} className="block w-full text-left">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[#ece9e3]">
                    {prospect.address || prospect.company_name}
                  </span>
                  <StagePill stage={stage} label={labelForStage(prospect.stage)} />
                </div>
                <div className="mt-1 truncate text-[11px] text-stone-600">
                  {prospect.city || "Ontario"} · {prospect.owner_name ?? "Owner pending"}
                </div>
                <div className="mt-[9px] flex items-baseline gap-[13px] font-mono text-[11px] text-stone-400">
                  <span>{model.roofAgeShort}</span>
                  <span>{model.systemLabel}</span>
                  <span className="ml-auto text-[#d8a866]">{formatMoney(model.annualSavings)}/yr</span>
                </div>
              </button>
              <div className="mt-3 flex flex-wrap gap-2">
                {prospect.microsite_url ? (
                  <Link
                    href={buildProposalPath(prospect.slug)}
                    className="inline-flex border border-[#c08a4b]/45 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[#d8a866] transition hover:bg-[#c08a4b]/10"
                  >
                    View page
                  </Link>
                ) : null}
                <Link
                  href={`/admin/prospects/${prospect.id}`}
                  className="inline-flex border border-white/12 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-stone-300 transition hover:bg-[#212128]"
                >
                  View info
                </Link>
              </div>
            </div>
          );
        })}
        {prospects.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-stone-500">
            No published proposals yet.{" "}
            <Link href="/admin/prospects" className="text-[#c08a4b] underline underline-offset-4">
              Open the prospect CRM
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ProspectHistory({ prospect }: { prospect: Prospect }) {
  const items = buildProspectHistory(prospect);

  return (
    <div className="py-1">
      {items.map((item, index) => {
        const meta = ACTIVITY_KINDS[item.kind];
        return (
          <div className="grid grid-cols-[74px_22px_minmax(0,1fr)] px-5 py-3" key={`${item.time}-${item.text}`}>
            <div className="pt-0.5 font-mono text-[10.5px] text-stone-600">{item.time}</div>
            <div className="relative self-stretch">
              {index < items.length - 1 ? <span className="absolute left-[3px] top-[9px] bottom-[-12px] w-px bg-white/12" /> : null}
              <span
                className={`absolute left-0 top-[5px] h-[7px] w-[7px] rounded-full ${
                  index === 0 ? "bg-[#c08a4b] shadow-[0_0_0_4px_rgba(192,138,75,0.14)]" : "bg-white/12"
                }`}
              />
            </div>
            <div className="min-w-0 text-[13px] leading-6">
              <span className={`mr-2 inline-block border px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em] ${meta.className}`}>
                {meta.tag}
              </span>
              <span className="text-stone-400">{item.text}</span>
            </div>
          </div>
        );
      })}
    </div>
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

function OperatorMenu({
  metrics,
  pipeline,
  activeStage,
  onPickStage,
}: {
  metrics: OperatorMetric[];
  pipeline: Array<{ key: StageKey; label: string; count: number }>;
  activeStage: StageKey | null;
  onPickStage: (key: StageKey) => void;
}) {
  return (
    <section className="border-b border-white/[0.07]">
      <div className="flex flex-wrap items-stretch border-b border-white/[0.07]">
        <div className="flex min-w-0 flex-1 flex-wrap">
          {metrics.map((metric) => (
            <div
              className="flex items-baseline gap-2 border-r border-white/[0.07] px-[22px] py-[14px] first:pl-0"
              key={metric.label}
            >
              <div className="font-mono text-[21px] font-semibold leading-none text-[#ece9e3]">
                {metric.prefix}
                <CountUp
                  value={metric.value}
                  decimals={metric.decimals}
                  format={(n) => (metric.decimals ? n.toFixed(metric.decimals) : formatNumber(n))}
                />
                {metric.unit ? <span className="ml-1 text-sm text-[#c08a4b]">{metric.unit}</span> : null}
              </div>
              <div className="truncate text-[11.5px] text-stone-400">{metric.label}</div>
            </div>
          ))}
        </div>
        <span className="ml-auto flex items-center pr-0 text-[10px] uppercase tracking-[0.22em] text-stone-600">Live</span>
      </div>
      <div className="flex flex-wrap items-stretch">
        <span className="flex items-center border-r border-white/[0.07] pr-[18px] text-[10px] uppercase tracking-[0.2em] text-stone-600">
          Pipeline
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap">
          {pipeline.map((item) => {
            const active = activeStage === item.key;
            return (
              <button
                type="button"
                onClick={() => onPickStage(item.key)}
                className={`relative flex items-baseline gap-[7px] border-r border-white/[0.07] px-[18px] py-3 text-left transition ${
                  active ? "bg-[#212128] shadow-[inset_0_-2px_0_#c08a4b]" : "hover:bg-[#1a1a1f]"
                }`}
                key={item.key}
              >
                <div className={`font-mono text-base font-semibold leading-none ${active ? "text-[#c08a4b]" : "text-[#ece9e3]"}`}>
                  <CountUp value={item.count} />
                </div>
                <div className={`text-[11px] uppercase tracking-[0.12em] ${active ? "text-[#d8a866]" : "text-stone-600"}`}>{item.label}</div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="border border-white/[0.07] bg-[#1a1a1f]">
      <div className="flex items-center gap-4 border-b border-white/[0.07] px-4 py-[13px] text-[10.5px] uppercase tracking-[0.26em] text-stone-500">
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

function LedgerMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-[#1a1a1f] p-4">
      <div className="font-serif text-2xl font-medium">{value}</div>
      <div className="mt-2 text-[9.5px] uppercase tracking-[0.14em] text-stone-500">{label}</div>
    </div>
  );
}

function ClawMark() {
  return (
    <svg className="h-[30px] w-[30px] shrink-0" viewBox="0 0 30 30" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="28" height="28" stroke="#c08a4b" strokeWidth="1" opacity="0.5" />
      <path d="M15 5L15 25M8 9L8 21M22 9L22 21" stroke="#c08a4b" strokeWidth="1.4" strokeLinecap="square" />
      <circle cx="15" cy="15" r="3.4" fill="#c08a4b" />
    </svg>
  );
}

function LiveDot() {
  return (
    <span className="relative inline-block h-2 w-2 rounded-full bg-[#c08a4b] after:absolute after:inset-[-4px] after:rounded-full after:border after:border-[#c08a4b] after:opacity-60 after:content-[''] after:animate-[pulse_2.4s_ease-out_infinite]" />
  );
}

function EmptyConsole() {
  return (
    <div className="border border-white/[0.07] bg-[#1a1a1f] px-6 py-16 text-center text-stone-500">
      No proposals are live yet.{" "}
      <Link href="/admin/prospects" className="text-[#c08a4b] underline underline-offset-4">
        Publish one from the prospect CRM
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
        ? "border-[#c08a4b]/45 text-[#d8a866]"
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
    offsetLabel: systemKw ? "82% (modelled)" : "Pending",
    paybackLabel:
      prospect.system_cost && annualSavings
        ? `${(Math.max(prospect.system_cost - incentive, 0) / annualSavings).toFixed(1)} yr`
        : "Pending",
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
  if (stage === "microsite_live") return "published";
  if (["satellite_done", "solar_done", "video_done"].includes(stage)) return "rendered";
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

// checkpoints derived from real record evidence only — no invented events or
// timestamps, so an operator (or agent) can trust each line as actual state
function buildProspectHistory(prospect: Prospect): ProspectHistoryItem[] {
  const model = getProspectModel(prospect);
  const events: ProspectHistoryItem[] = [
    {
      time: shortDate(prospect.created_at),
      kind: "source",
      text: `Sourced - ${prospect.city || "Ontario"} · ${model.sqftLabel}`,
    },
  ];

  if (prospect.lat != null && prospect.lng != null) {
    events.push({ time: "—", kind: "qualify", text: "Address verified and geocoded" });
  }
  if (prospect.satellite_image_url) {
    events.push({ time: "—", kind: "render", text: "Satellite imagery captured" });
  }
  if (prospect.panel_count) {
    events.push({ time: "—", kind: "panel", text: `Solar layout solved - ${model.panelsLabel}, ${model.systemLabel}` });
  }
  if (prospect.incentive_amount) {
    events.push({ time: "—", kind: "incentive", text: `Incentive stack flagged - ${formatMoneyCompact(model.incentive)}` });
  }
  if (prospect.video_url) {
    events.push({ time: "—", kind: "render", text: "Cinematic flyover attached" });
  }
  if (prospect.microsite_url) {
    events.push({ time: "—", kind: "publish", text: `Proposal page published - ${buildProposalPath(prospect.slug)}` });
  }
  if (prospect.email_sent_at) {
    events.push({
      time: shortDate(prospect.email_sent_at),
      kind: "send",
      text: `Proposal emailed to ${prospect.owner_name ?? prospect.company_name}`,
    });
  }
  if (prospect.reply_classification) {
    events.push({ time: "—", kind: "reply", text: `Owner replied - ${prospect.reply_classification.replace(/_/g, " ")}` });
  }
  if (prospect.stage === "booked") {
    events.push({ time: "—", kind: "reply", text: "Discovery call booked" });
  }

  return events.reverse();
}

function lastTouch(prospect: Prospect) {
  if (prospect.stage === "booked") return "Discovery call booked";
  if (prospect.stage === "replied") return "Owner replied";
  if (prospect.email_sent_at) return `Proposal sent ${shortDate(prospect.email_sent_at)}`;
  if (prospect.microsite_url) return "Proposal page live";
  if (prospect.video_url) return "Flyover render ready";
  if (prospect.panel_count) return "Solar layout modeled";
  return "Awaiting next agent step";
}

function formatConsoleDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).formatToParts(date);

  const take = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value.toUpperCase() ?? "";

  return `${take("weekday")} · ${take("month")} ${take("day")}, ${take("year")} · ${take("hour")}:${take("minute")} ${take("timeZoneName")}`;
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

function formatProspectSubline(prospect: Prospect, model: ProspectModel) {
  const place = prospect.city ? `${prospect.city}, ON` : "Ontario";
  const buildingType =
    prospect.industry?.toLowerCase().includes("warehouse")
      ? "single-storey warehouse"
      : prospect.industry?.toLowerCase().includes("industrial")
        ? "industrial roof"
        : "commercial roof";

  return `${place} · ${model.sqftLabel} ${buildingType}`;
}
