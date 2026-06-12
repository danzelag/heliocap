import Link from "next/link";
import { notFound } from "next/navigation";
import { getProspect } from "@/lib/supabase";
import { buildProposalPath } from "@/lib/proposals";
import type { Prospect, ProspectStage } from "@/lib/types";
import { ProposalVideoPanel } from "./ProposalVideoPanel";
import { ProspectSolarWorkspace } from "./ProspectSolarWorkspace";

const CAD = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

const NUMBER = new Intl.NumberFormat("en-CA");

export default async function ProspectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const prospect = await getProspect(id);
  if (!prospect) notFound();

  const model = getProspectModel(prospect);
  const stage = stageFor(prospect.stage);

  return (
    <div className="min-h-screen bg-[#131316] text-[#ece9e3] selection:bg-[#c08a4b]/30">
      <div className="mx-auto max-w-[1500px] px-5 pb-20 pt-6 sm:px-8">
        <header className="flex flex-col gap-5 border-b border-white/[0.07] pb-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <ClawMark />
            <div>
              <div className="text-lg font-semibold tracking-[0.34em]">
                OPEN<span className="text-[#c08a4b]">CLAW</span>
              </div>
              <div className="mt-1 text-[10.5px] uppercase tracking-[0.28em] text-stone-500">
                Prospect record · CRM workspace
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/admin/prospects"
              className="border border-white/12 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-stone-400 transition hover:border-[#c08a4b]/50 hover:text-[#d8a866]"
            >
              Back to CRM
            </Link>
            <StagePill stage={stage} label={labelForStage(prospect.stage)} />
          </div>
        </header>

        <main className="pt-8">
          <section className="border border-white/[0.07] bg-gradient-to-b from-[#1a1a1f] to-[#131316] px-5 pb-[30px] pt-7 sm:px-[30px]">
            <div className="mb-6 border-b border-white/[0.07] pb-[22px]">
              <div className="mb-[14px] flex flex-wrap items-center gap-[14px]">
                <StagePill stage={stage} label={labelForStage(prospect.stage)} />
                <span className="text-xs text-stone-400">{lastTouch(prospect)}</span>
                {prospect.microsite_url ? (
                  <Link
                    href={buildProposalPath(prospect.slug)}
                    className="ml-auto text-[11px] uppercase tracking-[0.14em] text-[#d8a866] hover:text-[#d8a866]"
                  >
                    View proposal page
                  </Link>
                ) : null}
              </div>
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-[30px]">
                <div className="min-w-0">
                  <h1 className="font-serif text-[34px] font-semibold leading-none tracking-normal text-[#ece9e3] sm:text-[40px]">
                    {prospect.address || prospect.company_name}
                  </h1>
                  <p className="mt-[11px] text-[12.5px] tracking-[0.01em] text-stone-400">
                    {formatProspectSubline(prospect, model)}
                  </p>
                </div>
                <div className="text-left lg:text-right">
                  <div className="font-serif text-[30px] leading-none text-[#c08a4b]">{model.co2Tonnes}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-stone-500">t CO2 / yr avoided</div>
                </div>
              </div>
            </div>

            <ProspectSolarWorkspace prospect={prospect} model={model} />

            <div className="mt-7 grid gap-7 border-t border-white/[0.07] pt-7 lg:grid-cols-2">
              <Section label="Owner & contact">
                <OwnerCard prospect={prospect} />
              </Section>
              <Section label="Building specification">
                <SpecsGrid prospect={prospect} model={model} />
              </Section>
              <Section label="Savings & incentive math">
                <SavingsLedger model={model} />
              </Section>
              <Section label="Proposal video">
                <ProposalVideoPanel prospect={prospect} />
              </Section>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function OwnerCard({ prospect }: { prospect: Prospect }) {
  return (
    <div className="border border-white/[0.07] bg-[#1a1a1f]">
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] p-4">
        <div className="min-w-0">
          <div className="font-serif text-[19px] font-semibold leading-[1.1]">{prospect.owner_name ?? "Owner research pending"}</div>
          <div className="mt-1 text-xs text-stone-400">
            {prospect.owner_title ?? "Facilities contact"} · {prospect.company_name}
          </div>
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
      <div className="grid sm:grid-cols-2">
        <Contact label="Direct" value={prospect.owner_mobile ?? "Pending"} />
        <Contact label="Email" value={prospect.owner_email ?? "Pending"} />
      </div>
    </div>
  );
}

function SpecsGrid({ prospect, model }: { prospect: Prospect; model: ProspectModel }) {
  const specs = [
    ["Gross floor area", model.sqftLabel],
    ["Year built", prospect.year_built?.toString() ?? "Pending"],
    ["Roof age", prospect.roof_age != null ? `${prospect.roof_age} yrs` : "Pending"],
    ["Roof assembly", model.roofType],
    ["Industry", prospect.industry ?? "Commercial"],
    ["Modules placed", model.panelsLabel],
    ["Usable roof", model.usableRoofPctLabel],
    ["Record ID", prospect.slug || prospect.id.slice(0, 8)],
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
    ["Annual generation", model.annualKwhLabel],
    ["Year 1 savings", formatMoney(model.annualSavings)],
    ["25-year net", formatMoney(model.lifetimeSavings)],
    ["Incentive credit", formatMoney(model.incentive)],
  ];

  return (
    <div className="border border-white/[0.07] bg-[#1a1a1f] p-5">
      {rows.map(([label, value]) => (
        <div className="flex items-baseline gap-2 py-2 text-sm" key={label}>
          <span className="shrink-0 text-stone-400">{label}</span>
          <span className="mb-1 flex-1 border-b border-dotted border-white/15" />
          <span className="shrink-0 font-mono text-xs">{value}</span>
        </div>
      ))}
      <div className="mt-4 flex items-center justify-between border-t border-white/12 pt-4">
        <span className="text-xs uppercase tracking-[0.1em] text-stone-400">Annual energy savings</span>
        <span className="font-serif text-3xl font-semibold text-[#c08a4b]">{formatMoney(model.annualSavings)}</span>
      </div>
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
  return <span className={`inline-flex border px-2.5 py-1 text-[9.5px] uppercase tracking-[0.14em] ${STAGE_META[stage].className}`}>{label}</span>;
}

function Contact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-b border-white/[0.07] p-4 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <span className="text-[9px] uppercase tracking-[0.16em] text-stone-500">{label}</span>
      <span className="overflow-hidden text-ellipsis font-mono text-xs">{value}</span>
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

type StageKey = "sourced" | "qualified" | "rendered" | "sent" | "replied" | "booked";

const STAGE_META: Record<StageKey, { label: string; className: string }> = {
  sourced: { label: "Sourced", className: "border-white/12 text-stone-500" },
  qualified: { label: "Qualified", className: "border-[#c08a4b]/40 text-[#c08a4b]" },
  rendered: { label: "Rendered", className: "border-[#d8a866]/45 text-[#d8a866]" },
  sent: { label: "Sent", className: "border-[#c08a4b]/60 bg-[#c08a4b]/10 text-[#c08a4b]" },
  replied: { label: "Replied", className: "border-[#86a06f]/50 bg-[#86a06f]/10 text-[#a4ba8d]" },
  booked: { label: "Booked", className: "border-[#c08a4b] bg-[#c08a4b] text-[#131316]" },
};

type ProspectModel = ReturnType<typeof getProspectModel>;

function getProspectModel(prospect: Prospect) {
  const sqft = prospect.sqft ?? 0;
  const usableRoofPct = sqft ? 0.74 : 0;
  const usableRoof = Math.round(sqft * usableRoofPct);
  const panels = prospect.panel_count ?? (usableRoof ? Math.max(0, Math.round(usableRoof / 52)) : 0);
  const systemKw = prospect.system_kw ?? (panels ? Math.round(panels * 0.41) : 0);
  const annualKwh = prospect.yearly_kwh ?? (systemKw ? Math.round(systemKw * 1280) : 0);
  const annualSavings = prospect.yearly_savings ?? (annualKwh ? Math.round(annualKwh * 0.147) : 0);
  const lifetimeSavings = prospect.savings_25yr ?? Math.round(annualSavings * 21.5);
  const incentive = prospect.incentive_amount ?? (systemKw ? Math.round(systemKw * 390) : 0);

  return {
    sqftLabel: sqft ? `${formatNumber(sqft)} sqft` : "Pending",
    usableRoofLabel: usableRoof ? `${formatNumber(usableRoof)} sqft` : "Pending",
    usableRoofPctLabel: usableRoofPct ? `${Math.round(usableRoofPct * 100)}%` : "Pending",
    panelsLabel: panels ? `${formatNumber(panels)} modules` : "Pending",
    systemLabel: systemKw ? `${formatNumber(systemKw)} kW` : "Pending",
    annualKwhLabel: annualKwh ? `${formatNumber(annualKwh)} kWh` : "Pending",
    annualSavings,
    lifetimeSavings,
    incentive,
    roofType: prospect.year_built && prospect.year_built < 1998 ? "Built-up gravel" : "Modified bitumen",
    azimuth: prospect.lng && prospect.lng < -79.65 ? "182 deg S" : "176 deg S",
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

function labelForStage(stage: ProspectStage) {
  if (stage === "dead") return "Dead";
  if (stage === "skipped") return "Skipped";
  return STAGE_META[stageFor(stage)].label;
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

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(new Date(value));
}

function formatNumber(value: number) {
  return NUMBER.format(Math.round(value));
}

function formatMoney(value: number) {
  return CAD.format(Math.round(value));
}
