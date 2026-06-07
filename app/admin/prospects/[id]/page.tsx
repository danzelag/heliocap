import Link from "next/link";
import { notFound } from "next/navigation";
import { getProspect } from "@/lib/supabase";
import type { Prospect, ProspectStage } from "@/lib/types";
import { PipelineActions } from "./PipelineActions";

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
                Prospect record · GTA West
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/admin"
              className="border border-white/12 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-stone-400 transition hover:border-[#c08a4b]/50 hover:text-[#d8a866]"
            >
              Back to console
            </Link>
            <StagePill stage={stage} label={labelForStage(prospect.stage)} />
          </div>
        </header>

        <main className="grid items-start gap-8 pt-8 xl:grid-cols-[minmax(0,1fr)_390px]">
          <section className="min-w-0 border border-white/[0.07] bg-gradient-to-b from-[#1a1a1f] to-[#131316] px-5 pb-[30px] pt-7 sm:px-[30px]">
            <div className="mb-6 border-b border-white/[0.07] pb-[22px]">
              <div className="mb-[14px] flex flex-wrap items-center gap-[14px]">
                <StagePill stage={stage} label={labelForStage(prospect.stage)} />
                <span className="text-xs text-stone-400">{lastTouch(prospect)}</span>
                {prospect.microsite_url ? (
                  <a
                    href={prospect.microsite_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-[11px] uppercase tracking-[0.14em] text-[#d8a866] hover:text-[#d8a866]"
                  >
                    View microsite
                  </a>
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

            <div className="grid gap-[26px] lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <SatellitePanel prospect={prospect} model={model} />
              </div>
              <div className="flex min-w-0 flex-col gap-6">
                <Section label="Owner & contact">
                  <OwnerCard prospect={prospect} />
                </Section>
                <Section label="Roof condition">
                  <RoofAnalysis model={model} />
                </Section>
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

          <aside className="space-y-5 xl:sticky xl:top-5">
            <SelectedVideoPanel prospect={prospect} />
            <PipelineActions prospect={prospect} />
          </aside>
        </main>
      </div>
    </div>
  );
}

function SatellitePanel({ prospect, model }: { prospect: Prospect; model: ProspectModel }) {
  const cells = Array.from({ length: 187 });
  const hasRenderedLayout = Boolean(prospect.panel_svg_url);

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
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,8,9,0.16)_0%,transparent_22%,transparent_68%,rgba(7,8,9,0.38)_100%)]" />
      {hasRenderedLayout ? (
        <img
          src={prospect.panel_svg_url ?? ""}
          alt="Solar panel layout overlay"
          className="absolute inset-0 h-full w-full object-cover opacity-[0.92] mix-blend-screen"
        />
      ) : (
        <div className="absolute left-[23%] top-[26%] h-[46%] w-[54%]">
          <div
            className="grid h-full w-full gap-0.5"
            style={{
              gridTemplateColumns: "repeat(17, minmax(0, 1fr))",
              gridTemplateRows: "repeat(11, minmax(0, 1fr))",
            }}
          >
            {cells.map((_, index) => (
              <span
                className="border border-[#c08a4b]/45 bg-gradient-to-br from-[#162132] to-[#0e1420] opacity-90 shadow-inner"
                key={index}
              />
            ))}
          </div>
          <Corner position="left-[-2px] top-[-2px] border-r-0 border-b-0" />
          <Corner position="right-[-2px] top-[-2px] border-l-0 border-b-0" />
          <Corner position="left-[-2px] bottom-[-2px] border-r-0 border-t-0" />
          <Corner position="right-[-2px] bottom-[-2px] border-l-0 border-t-0" />
        </div>
      )}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:40px_40px]" />
      <div className="absolute left-3 right-3 top-3 flex justify-between font-mono text-[10px] uppercase tracking-[0.1em] text-stone-200/75">
        <span className="text-[#d8a866]">SATELLITE · 0.15 m/px</span>
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

function SelectedVideoPanel({ prospect }: { prospect: Prospect }) {
  const ready = Boolean(prospect.video_url);

  return (
    <section className="border border-white/[0.07] bg-[#1a1a1f]">
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-4 py-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.16em] text-[#ece9e3]">Proposal video</div>
          <div className="mt-2 truncate text-sm font-medium text-stone-200">{prospect.address || prospect.company_name}</div>
          <div className="mt-1 truncate text-[10.5px] text-stone-500">{prospect.company_name}</div>
        </div>
        <span className={`shrink-0 border px-2 py-1 text-[9.5px] uppercase tracking-[0.14em] ${ready ? "border-[#c08a4b]/50 text-[#d8a866]" : "border-white/12 text-stone-500"}`}>
          {ready ? "Ready" : "Queued"}
        </span>
      </div>
      <div className="p-4">
        <div className="relative aspect-video overflow-hidden border border-white/12 bg-[#070809]">
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
          {ready ? (
            <video
              key={prospect.video_url}
              src={prospect.video_url ?? undefined}
              poster={prospect.video_thumbnail_url ?? prospect.satellite_image_url ?? undefined}
              controls
              preload="metadata"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[11px] uppercase tracking-[0.16em] text-stone-500">
              Video render queued
            </div>
          )}
          <div className="pointer-events-none absolute left-4 right-4 top-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em]">
            <span className="text-stone-100/85">CINEMATIC FLYOVER</span>
            <span className={`border px-2 py-1 ${ready ? "border-[#c08a4b]/50 text-[#d8a866]" : "border-white/12 text-stone-500"}`}>
              {ready ? "READY" : "NOT RENDERED"}
            </span>
          </div>
        </div>
      </div>
    </section>
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
        <span className="shrink-0 border border-[#86a06f]/45 px-2 py-1 text-[8.5px] uppercase tracking-[0.14em] text-[#a4ba8d]">
          OWNER VERIFIED
        </span>
      </div>
      <div className="grid sm:grid-cols-2">
        <Contact label="Direct" value={prospect.owner_mobile ?? "Pending"} />
        <Contact label="Email" value={prospect.owner_email ?? "Pending"} />
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
        <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-[#9a6c38] to-[#c8704a]" style={{ width: `${100 - model.roofScore}%` }} />
        <span className="absolute right-0 top-2 text-[9.5px] uppercase tracking-[0.1em] text-stone-500">Degradation {100 - model.roofScore}%</span>
      </div>
      <div className="mt-8 divide-y divide-white/[0.07]">
        <Line label="Roof age" value={model.roofAgeLabel} />
        <Line label="Observed" value={model.roofCondition} />
        <Line label="Replacement window" value={model.replacementWindow} hot />
      </div>
      <p className="mt-4 border-l-2 border-[#9a6c38] pl-3 text-xs leading-6 text-stone-500">
        Re-roof + solar in a single mobilization, with structural and membrane replacement reviewed alongside array install.
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

function Line({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
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
  return <span className={`absolute h-4 w-4 border border-[#c08a4b] ${position}`} />;
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
    usableRoofLabel: usableRoof ? `${formatNumber(usableRoof)} sqft` : "Pending",
    usableRoofPctLabel: usableRoofPct ? `${Math.round(usableRoofPct * 100)}%` : "Pending",
    panelsLabel: panels ? `${formatNumber(panels)} modules` : "Pending",
    systemLabel: systemKw ? `${formatNumber(systemKw)} kW` : "Pending",
    annualKwhLabel: annualKwh ? `${formatNumber(annualKwh)} kWh` : "Pending",
    annualSavings,
    lifetimeSavings,
    incentive,
    roofAgeLabel: roofAge == null ? "Pending" : `${roofAge} yrs / 25 typical`,
    roofScore,
    urgency,
    urgencyClass,
    roofCondition: roofAge == null ? "Awaiting roof record" : roofAge >= 22 ? "End of service life" : roofAge >= 17 ? "Aging membrane" : "Fair condition",
    replacementWindow: roofAge == null ? "Pending" : roofAge >= 22 ? "0-2 yrs" : roofAge >= 17 ? "1-3 yrs" : "5-7 yrs",
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

function coordinateLabel(prospect: Prospect) {
  if (prospect.lat && prospect.lng) {
    return `${Math.abs(prospect.lat).toFixed(4)} deg N · ${Math.abs(prospect.lng).toFixed(4)} deg W`;
  }
  return "43.6532 deg N · 79.6711 deg W";
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
