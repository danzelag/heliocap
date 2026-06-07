"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewProspectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const data = {
      company_name: form.get("company_name"),
      address: form.get("address"),
      city: form.get("city"),
      sqft: form.get("sqft") ? parseInt(form.get("sqft") as string) : null,
      year_built: form.get("year_built") ? parseInt(form.get("year_built") as string) : null,
      industry: form.get("industry") || null,
      owner_name: form.get("owner_name") || null,
      owner_title: form.get("owner_title") || null,
      owner_email: form.get("owner_email") || null,
      owner_mobile: form.get("owner_mobile") || null,
    };

    const res = await fetch("/api/prospects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      setError(err.error ?? "Failed to create prospect");
      setLoading(false);
      return;
    }

    const prospect = await res.json();
    router.push(`/admin/prospects/${prospect.id}`);
  }

  return (
    <div className="min-h-screen bg-[#131316] text-[#ece9e3] selection:bg-[#c08a4b]/30">
      <div className="mx-auto max-w-[1180px] px-5 pb-20 pt-6 sm:px-8">
        <header className="flex flex-col gap-5 border-b border-white/[0.07] pb-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <ClawMark />
            <div>
              <div className="text-lg font-semibold tracking-[0.34em]">
                OPEN<span className="text-[#c08a4b]">CLAW</span>
              </div>
              <div className="mt-1 text-[10.5px] uppercase tracking-[0.28em] text-stone-500">
                Prospect intake · GTA West
              </div>
            </div>
          </div>
          <Link
            href="/admin/prospects"
            className="w-fit border border-white/12 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-stone-400 transition hover:border-[#c08a4b]/50 hover:text-[#d8a866]"
          >
            Back to CRM
          </Link>
        </header>

        <main className="grid gap-8 pt-8 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="border border-white/[0.07] bg-[#1a1a1f] p-5 lg:sticky lg:top-6 lg:self-start">
            <div className="font-serif text-3xl font-semibold leading-none">Add prospect</div>
            <p className="mt-4 text-sm leading-6 text-stone-400">
              Intake a commercial roof, owner contact, and building profile for the OpenClaw pipeline.
            </p>
            <div className="mt-6 grid grid-cols-2 border border-white/[0.07] bg-white/[0.07]">
              <Readout label="Region" value="GTA West" />
              <Readout label="Mode" value="Manual" />
            </div>
          </aside>

          <form onSubmit={handleSubmit} className="border border-white/[0.07] bg-gradient-to-b from-[#1a1a1f] to-[#131316] p-5 sm:p-7">
            <Section title="Building">
              <Field label="Company Name" name="company_name" required />
              <Field label="Street Address" name="address" required />
              <Field label="City (Ontario)" name="city" required defaultValue="Brampton" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Building Sqft" name="sqft" type="number" />
                <Field label="Year Built" name="year_built" type="number" />
              </div>
              <Field label="Industry" name="industry" placeholder="Warehouse, manufacturing, cold storage" />
            </Section>

            <Section title="Owner Contact">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Owner Name" name="owner_name" />
                <Field label="Title" name="owner_title" placeholder="President, CEO, Facilities Director" />
              </div>
              <Field label="Email" name="owner_email" type="email" />
              <Field label="Mobile" name="owner_mobile" type="tel" />
            </Section>

            {error ? (
              <p className="border border-[#c8704a]/40 bg-[#c8704a]/10 px-4 py-3 text-sm text-[#c8704a]">{error}</p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="mt-7 w-full border border-[#c08a4b] bg-[#c08a4b] px-4 py-3 text-sm font-semibold text-[#131316] transition hover:bg-[#d8a866] disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? "Saving prospect..." : "Save Prospect"}
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-white/[0.07] py-6 first:pt-0 last:border-b-0">
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
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-stone-500">
        {label} {required ? <span className="text-[#c8704a]">*</span> : null}
      </label>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="w-full border border-white/12 bg-[#131316] px-3 py-2.5 text-sm text-[#ece9e3] outline-none transition placeholder:text-stone-700 focus:border-[#c08a4b]/70 focus:bg-[#17171b]"
      />
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#1a1a1f] p-3">
      <div className="text-[9px] uppercase tracking-[0.16em] text-stone-500">{label}</div>
      <div className="mt-1 font-mono text-xs text-[#ece9e3]">{value}</div>
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
