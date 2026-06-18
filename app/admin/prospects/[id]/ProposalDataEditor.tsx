"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { buildProposalPath } from "@/lib/proposals";
import type { Prospect } from "@/lib/types";
import { ProspectMapCapturePanel } from "./ProspectMapCapturePanel";
import { ProposalVideoPanel } from "./ProposalVideoPanel";

type SaveState = "idle" | "saving" | "publishing";

export function ProposalDataEditor({ prospect }: { prospect: Prospect }) {
  const router = useRouter();
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isResidential = prospect.proposal_type === "residential";
  const displayName = prospect.company_name ?? prospect.contact_name ?? prospect.owner_name ?? prospect.address;
  const validation = useMemo(() => validateForPublish(prospect), [prospect]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const updates = {
      company_name: isResidential ? null : nullable(form.get("company_name")),
      contact_name: nullable(form.get("contact_name")),
      address: stringValue(form.get("address")),
      city: stringValue(form.get("city")) || "Ontario",
      industry: nullable(form.get("industry")),
      sqft: numberValue(form.get("sqft")),
      year_built: numberValue(form.get("year_built")),
      owner_name: nullable(form.get("owner_name")),
      owner_title: nullable(form.get("owner_title")),
      owner_email: nullable(form.get("owner_email")),
      owner_mobile: nullable(form.get("owner_mobile")),
      include_solar: form.get("include_solar") === "on",
      include_ev: form.get("include_ev") === "on",
      include_heat_pump: isResidential ? form.get("include_heat_pump") === "on" : false,
      monthly_energy_bill: numberValue(form.get("monthly_energy_bill")),
      interested_solar: isResidential ? form.get("include_solar") === "on" : null,
      interested_heat_pump: isResidential ? form.get("include_heat_pump") === "on" : null,
      interested_ev: isResidential ? form.get("include_ev") === "on" : null,
      heat_pump_annual_savings: isResidential ? numberValue(form.get("heat_pump_annual_savings")) : null,
      ev_charger_count: numberValue(form.get("ev_charger_count")),
      ev_charger_annual_value: numberValue(form.get("ev_charger_annual_value")),
      ev_charger_notes: nullable(form.get("ev_charger_notes")),
      panel_count: numberValue(form.get("panel_count")),
      system_kw: numberValue(form.get("system_kw")),
      yearly_kwh: numberValue(form.get("yearly_kwh")),
      yearly_savings: numberValue(form.get("yearly_savings")),
      savings_25yr: numberValue(form.get("savings_25yr")),
      system_cost: numberValue(form.get("system_cost")),
      incentive_amount: numberValue(form.get("incentive_amount")),
    };

    if (!updates.address) {
      setError("Address is required.");
      return;
    }
    if (!isResidential && !updates.company_name) {
      setError("Company name is required for commercial proposals.");
      return;
    }
    if (isResidential && !updates.contact_name) {
      setError("Homeowner name is required for residential proposals.");
      return;
    }

    setState("saving");
    setError("");
    setMessage("");

    const res = await fetch(`/api/prospects/${prospect.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error ?? "Save failed.");
      setState("idle");
      return;
    }

    setMessage("Proposal data saved.");
    setState("idle");
    router.refresh();
  }

  async function publish() {
    const blockers = validateForPublish(prospect);
    if (blockers.length) {
      setError(blockers.join(" "));
      return;
    }

    setState("publishing");
    setError("");
    setMessage("");

    const res = await fetch("/api/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [prospect.id] }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error ?? "Microsite generation failed.");
      setState("idle");
      return;
    }

    setMessage("Microsite generated.");
    setState("idle");
    router.refresh();
  }

  return (
    <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_380px]">
      <form onSubmit={save} className="space-y-7">
        <Section title="Proposal identity">
          <div className="grid gap-4 sm:grid-cols-2">
            {isResidential ? (
              <Field label="Homeowner Name" name="contact_name" defaultValue={prospect.contact_name ?? prospect.owner_name ?? ""} required />
            ) : (
              <Field label="Company Name" name="company_name" defaultValue={prospect.company_name ?? ""} required />
            )}
            <Field label="City" name="city" defaultValue={prospect.city} required />
          </div>
          <Field label="Address" name="address" defaultValue={prospect.address} required />
          {!isResidential ? <Field label="Industry" name="industry" defaultValue={prospect.industry ?? ""} /> : null}
        </Section>

        <Section title={isResidential ? "Homeowner contact" : "Owner contact"}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={isResidential ? "Contact Name" : "Owner Name"} name="owner_name" defaultValue={prospect.owner_name ?? ""} />
            <Field label="Title" name="owner_title" defaultValue={prospect.owner_title ?? ""} disabled={isResidential} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" name="owner_email" type="email" defaultValue={prospect.owner_email ?? ""} />
            <Field label="Mobile" name="owner_mobile" type="tel" defaultValue={prospect.owner_mobile ?? ""} />
          </div>
        </Section>

        <Section title="Included products">
          <Checkbox label="Solar" name="include_solar" defaultChecked={prospect.include_solar} />
          {isResidential ? <Checkbox label="Heat pump" name="include_heat_pump" defaultChecked={prospect.include_heat_pump} /> : null}
          <Checkbox label={isResidential ? "EV charger add-on" : "EV chargers"} name="include_ev" defaultChecked={prospect.include_ev} />
        </Section>

        {isResidential ? (
          <Section title="Residential inputs">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Monthly energy bill" name="monthly_energy_bill" type="number" defaultValue={num(prospect.monthly_energy_bill)} />
              <Field label="Heat pump annual savings" name="heat_pump_annual_savings" type="number" defaultValue={num(prospect.heat_pump_annual_savings)} />
            </div>
            <div className="border border-white/[0.07] bg-[#131316] px-3 py-3 text-xs text-stone-400">
              Insurance consent: {prospect.insurance_quote_consent ? "Captured" : "Not captured"}
            </div>
          </Section>
        ) : null}

        <Section title={isResidential ? "EV add-on values" : "EV charger values"}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="EV charger count" name="ev_charger_count" type="number" defaultValue={num(prospect.ev_charger_count)} />
            <Field label="EV annual value" name="ev_charger_annual_value" type="number" defaultValue={num(prospect.ev_charger_annual_value)} />
          </div>
          <Field label="EV notes" name="ev_charger_notes" defaultValue={prospect.ev_charger_notes ?? ""} />
        </Section>

        <Section title="Solar economics">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Panel count" name="panel_count" type="number" defaultValue={num(prospect.panel_count)} />
            <Field label="System kW" name="system_kw" type="number" step="0.1" defaultValue={num(prospect.system_kw)} />
            <Field label="Yearly kWh" name="yearly_kwh" type="number" defaultValue={num(prospect.yearly_kwh)} />
            <Field label="Yearly savings" name="yearly_savings" type="number" defaultValue={num(prospect.yearly_savings)} />
            <Field label="25-year savings" name="savings_25yr" type="number" defaultValue={num(prospect.savings_25yr)} />
            <Field label="System cost" name="system_cost" type="number" defaultValue={num(prospect.system_cost)} />
            <Field label="Incentive amount" name="incentive_amount" type="number" defaultValue={num(prospect.incentive_amount)} />
            {!isResidential ? (
              <>
                <Field label="Building sqft" name="sqft" type="number" defaultValue={num(prospect.sqft)} />
                <Field label="Year built" name="year_built" type="number" defaultValue={num(prospect.year_built)} />
              </>
            ) : null}
          </div>
        </Section>

        {message ? <p className="border border-[#86a06f]/35 bg-[#86a06f]/10 px-4 py-3 text-sm text-[#a4ba8d]">{message}</p> : null}
        {error ? <p className="border border-[#c8704a]/35 bg-[#c8704a]/10 px-4 py-3 text-sm text-[#d99a82]">{error}</p> : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={state !== "idle"}
            className="border border-white/12 px-4 py-3 text-[11px] uppercase tracking-[0.14em] text-stone-200 transition hover:bg-[#212128] disabled:cursor-wait disabled:opacity-40"
          >
            {state === "saving" ? "Saving..." : "Save proposal data"}
          </button>
          <button
            type="button"
            onClick={() => void publish()}
            disabled={state !== "idle"}
            className="border border-[#c08a4b] bg-[#c08a4b] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#131316] transition hover:bg-[#d8a866] disabled:cursor-wait disabled:opacity-50"
          >
            {state === "publishing" ? "Generating..." : "Generate microsite"}
          </button>
          {prospect.microsite_url ? (
            <Link
              href={buildProposalPath(prospect.slug)}
              className="border border-[#c08a4b]/45 px-4 py-3 text-[11px] uppercase tracking-[0.14em] text-[#d8a866] transition hover:bg-[#c08a4b]/10"
            >
              View microsite
            </Link>
          ) : null}
        </div>
      </form>

      <aside className="space-y-5 lg:sticky lg:top-5">
        <div className="border border-white/[0.07] bg-[#1a1a1f] p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-stone-500">Record</div>
          <div className="mt-2 font-serif text-2xl font-semibold">{displayName}</div>
          <div className="mt-2 text-sm leading-6 text-stone-400">{prospect.address}</div>
          {validation.length ? (
            <div className="mt-4 border border-[#c8704a]/35 bg-[#c8704a]/10 px-3 py-2 text-xs leading-5 text-[#d99a82]">
              {validation.join(" ")}
            </div>
          ) : (
            <div className="mt-4 border border-[#86a06f]/35 bg-[#86a06f]/10 px-3 py-2 text-xs text-[#a4ba8d]">
              Ready to generate.
            </div>
          )}
        </div>
        <ProspectMapCapturePanel prospect={prospect} />
        <ProposalVideoPanel prospect={prospect} product="solar" />
        {!isResidential && prospect.include_ev ? <ProposalVideoPanel prospect={prospect} product="ev" /> : null}
      </aside>
    </div>
  );
}

function validateForPublish(prospect: Prospect) {
  const errors: string[] = [];
  if (!prospect.address) errors.push("Address is required.");
  if (prospect.proposal_type === "commercial" && !prospect.company_name) errors.push("Company name is required.");
  if (prospect.proposal_type === "residential" && !prospect.contact_name && !prospect.owner_name) {
    errors.push("Homeowner name is required.");
  }
  if (prospect.include_solar && !prospect.video_url) errors.push("Solar video is required.");
  if (prospect.proposal_type === "commercial" && prospect.include_ev && !prospect.ev_video_url) {
    errors.push("EV video is required for included commercial EV chargers.");
  }
  return errors;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-white/[0.07] bg-[#1a1a1f] p-5">
      <div className="mb-4 flex items-center gap-4 text-[10.5px] uppercase tracking-[0.26em] text-stone-500">
        <span>{title}</span>
        <span className="h-px flex-1 bg-white/[0.07]" />
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  disabled,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  disabled?: boolean;
  step?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-stone-500">
        {label} {required ? <span className="text-[#c8704a]">*</span> : null}
      </label>
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        defaultValue={defaultValue}
        disabled={disabled}
        className="w-full border border-white/12 bg-[#131316] px-3 py-2.5 text-sm text-[#ece9e3] outline-none transition placeholder:text-stone-700 focus:border-[#c08a4b]/70 focus:bg-[#17171b] disabled:opacity-40"
      />
    </div>
  );
}

function Checkbox({ label, name, defaultChecked }: { label: string; name: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-start gap-3 border border-white/[0.07] bg-[#131316] px-3 py-3 text-sm text-stone-300">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 border-white/15 bg-[#1a1a1f] accent-[#c08a4b]"
      />
      <span>{label}</span>
    </label>
  );
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function nullable(value: FormDataEntryValue | null) {
  const next = stringValue(value);
  return next || null;
}

function numberValue(value: FormDataEntryValue | null) {
  const next = stringValue(value);
  if (!next) return null;
  const parsed = Number(next);
  return Number.isFinite(parsed) ? parsed : null;
}

function num(value: number | null) {
  return value == null ? "" : String(value);
}
