"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

type SubmitState = "idle" | "submitting" | "success" | "error";
type Interest = "solar" | "heat" | "ev";

const INTERESTS: Array<{ id: Interest; label: string }> = [
  { id: "solar", label: "Solar" },
  { id: "heat", label: "Heat pump" },
  { id: "ev", label: "EV charger" },
];

export default function ResidentialLandingPage() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");
  const [interests, setInterests] = useState<Record<Interest, boolean>>({
    solar: true,
    heat: false,
    ev: false,
  });
  const [insuranceConsent, setInsuranceConsent] = useState(false);

  const isSuccess = state === "success";
  const selectedInterests = useMemo(
    () => INTERESTS.filter((item) => interests[item.id]).map((item) => item.label),
    [interests]
  );

  function toggleInterest(interest: Interest) {
    setInterests((current) => ({ ...current, [interest]: !current[interest] }));
  }

  async function submitLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const formData = new FormData(form);
    const bill = stringValue(formData.get("monthly_energy_bill")).replace(/[^\d.]/g, "");
    const payload = {
      proposal_type: "residential",
      contact_name: stringValue(formData.get("contact_name")),
      address: stringValue(formData.get("address")),
      city: stringValue(formData.get("city")),
      owner_email: stringValue(formData.get("owner_email")),
      owner_mobile: stringValue(formData.get("owner_mobile")),
      monthly_energy_bill: bill,
      interested_solar: interests.solar,
      interested_heat_pump: interests.heat,
      interested_ev: interests.ev,
      include_solar: interests.solar,
      include_heat_pump: interests.heat,
      include_ev: interests.ev,
      insurance_quote_consent: insuranceConsent,
      website: formData.get("website"),
    };

    setState("submitting");
    setMessage("");

    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setState("error");
      setMessage(data.error ?? "Something went wrong. Please try again.");
      return;
    }

    form.reset();
    setInterests({ solar: true, heat: false, ev: false });
    setInsuranceConsent(false);
    setState("success");
    setMessage("");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#1c1a17] text-[#f4efe5]">
      <div className="fixed inset-0 z-0 overflow-hidden bg-[#1c1a17]">
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_75%_18%,rgba(199,137,66,0.48),transparent_60%),linear-gradient(180deg,#684f37,#211c18)]" />
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src="/assets/cinematic-home.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(22,20,17,0.92)_0%,rgba(22,20,17,0.72)_40%,rgba(22,20,17,0.34)_72%,rgba(22,20,17,0.62)_100%)] max-[880px]:bg-[linear-gradient(180deg,rgba(22,20,17,0.76),rgba(22,20,17,0.94))]" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-11 sm:py-6">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src="/assets/amberfield-logo-light.svg"
            alt="AmberField Energy"
            className="h-[30px] w-auto max-w-[210px] object-contain"
          />
        </div>
        <Link
          href="/admin"
          className="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-white/65 transition hover:text-[#d29a55]"
        >
          <ArrowLeftIcon />
          <span className="hidden sm:inline">Command center</span>
        </Link>
      </header>

      <section className="relative z-10 mx-auto grid min-h-[calc(100vh-84px)] max-w-[1240px] items-center gap-10 px-5 pb-14 pt-3 sm:px-11 lg:grid-cols-2 lg:gap-16">
        <div className="max-w-[35rem]">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.3em] text-[#d29a55]">
            Your property. Your power.
          </p>
          <h1 className="font-serif text-[clamp(42px,5.4vw,76px)] font-light leading-[0.98] tracking-normal text-balance">
            See your home&apos;s <em className="text-[#d29a55]">numbers</em> in 24 hours.
          </h1>
          <p className="mt-6 max-w-[34ch] text-[clamp(16px,1.7vw,19px)] leading-normal text-white/75">
            One short form. We&apos;ll model your roof, your bill, and your rates, then send a free, personalized residential estimate.
          </p>
          <ul className="mt-8 hidden flex-col gap-3.5 text-sm text-white/80 md:flex">
            <ProofPoint>A real estimate built on your property and bill</ProofPoint>
            <ProofPoint>One advisor, not a call-centre script</ProofPoint>
            <ProofPoint>No cost, no obligation, no pressure</ProofPoint>
          </ul>
        </div>

        <div className="border border-white/15 bg-[#211f1b]/70 p-6 shadow-[0_40px_90px_-40px_rgba(0,0,0,0.75)] backdrop-blur-xl sm:p-9">
          <form ref={formRef} onSubmit={submitLead} className={isSuccess ? "hidden" : "block"}>
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <h2 className="font-serif text-3xl font-light tracking-normal">Get my free estimate</h2>
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#d29a55]">2 min</span>
            </div>
            <p className="mb-6 text-sm leading-6 text-white/60">
              Tell us a little about your home and what you&apos;re interested in.
            </p>

            <Field label="Full name" name="contact_name" autoComplete="name" placeholder="Your name" required />
            <Field label="Home address" name="address" autoComplete="street-address" placeholder="Street address" required />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="City" name="city" autoComplete="address-level2" placeholder="Toronto" required />
              <Field
                label="Average monthly energy bill"
                name="monthly_energy_bill"
                inputMode="numeric"
                placeholder="$240"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" name="owner_email" type="email" autoComplete="email" placeholder="you@email.com" required />
              <Field label="Phone" name="owner_mobile" type="tel" autoComplete="tel" placeholder="(555) 000-0000" required />
            </div>

            <div className="mt-5">
              <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-white/60">
                I&apos;m interested in
              </div>
              <div className="flex flex-wrap gap-2">
                {INTERESTS.map((interest) => (
                  <InterestChip
                    key={interest.id}
                    active={interests[interest.id]}
                    onClick={() => toggleInterest(interest.id)}
                  >
                    {interest.label}
                  </InterestChip>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setInsuranceConsent((current) => !current)}
              className="mt-6 flex w-full items-start gap-3 text-left"
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border transition ${
                  insuranceConsent ? "border-[#d29a55] bg-[#d29a55]" : "border-white/30"
                }`}
                aria-hidden="true"
              >
                {insuranceConsent ? <CheckIcon className="h-3 w-3 text-white" /> : null}
              </span>
              <span className="text-xs leading-5 text-white/60">
                I consent to being contacted about a home insurance quote.
              </span>
            </button>

            <input name="website" tabIndex={-1} autoComplete="off" className="hidden" />

            {message ? (
              <p className="mt-5 border border-[#e28761]/40 bg-[#e28761]/10 px-3 py-2 text-xs leading-5 text-[#ffc0a8]">
                {message}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={state === "submitting"}
              className="mt-6 w-full bg-[#d29a55] px-5 py-4 text-base font-semibold text-[#1c1a17] transition hover:-translate-y-0.5 hover:bg-[#b9783f] hover:text-white disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {state === "submitting" ? "Submitting..." : "Get my free estimate"}
            </button>
            <div className="mt-3 text-center text-[11px] text-white/40">
              We&apos;ll never share your details. Estimates are free.
            </div>
          </form>

          <div
            className={`min-h-[420px] flex-col items-center justify-center gap-4 text-center ${
              isSuccess ? "flex" : "hidden"
            }`}
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full border border-[#d29a55]">
              <CheckIcon className="h-7 w-7 text-[#d29a55]" />
            </span>
            <h2 className="font-serif text-3xl font-light tracking-normal">Thanks, you&apos;re in.</h2>
            <p className="max-w-[30ch] text-sm leading-6 text-white/65">
              We&apos;re modeling your home now. Your personalized residential estimate arrives within one business day.
            </p>
            <p className="text-xs text-white/45">
              Selected: {selectedInterests.length ? selectedInterests.join(", ") : "Residential energy review"}
            </p>
            <button
              type="button"
              onClick={() => {
                formRef.current?.reset();
                setState("idle");
                setMessage("");
              }}
              className="mt-2 text-sm font-medium text-[#d29a55] transition hover:text-white"
            >
              Submit another home
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  autoComplete,
  inputMode,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
}) {
  return (
    <label className="mb-4 block min-w-0">
      <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-white/60">
        {label}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
        className="w-full border-0 border-b border-white/25 bg-transparent px-0 py-2 text-base text-white outline-none transition placeholder:text-white/30 focus:border-[#d29a55]"
      />
    </label>
  );
}

function InterestChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 border px-4 py-2.5 text-sm transition ${
        active
          ? "border-[#d29a55] bg-[#d29a55]/15 text-white"
          : "border-white/25 text-white/80 hover:border-[#d29a55]"
      }`}
    >
      <span
        className={`flex h-4 w-4 items-center justify-center rounded border transition ${
          active ? "border-[#d29a55] bg-[#d29a55]" : "border-white/35"
        }`}
        aria-hidden="true"
      >
        {active ? <CheckIcon className="h-2.5 w-2.5 text-white" /> : null}
      </span>
      {children}
    </button>
  );
}

function ProofPoint({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#d29a55]" />
      <span>{children}</span>
    </li>
  );
}

function CheckIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
      <path d="M5 12l5 5 9-11" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}
