"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type HTMLAttributes,
  type ReactNode,
} from "react";

type SubmitState = "idle" | "submitting" | "success" | "error";
type Interest = "solar" | "heat" | "ev";

type PlaceSuggestion = {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string;
};

type SelectedPlace = {
  placeId: string;
  formattedAddress: string;
  streetAddress: string;
  city: string;
  province: string;
  lat: number;
  lng: number;
};

type LeadForm = {
  contact_name: string;
  owner_email: string;
  owner_mobile: string;
  address: string;
  city: string;
  property_type: string;
  current_heating_system: string;
  current_cooling: string;
  ductwork: string;
  home_size: string;
  main_goal: string[];
  timeline: string;
  gas_bill_range: string;
  hydro_bill_range: string;
  rebate_financing_interest: string;
  furnace_ac_age: string;
  comfort_issue: string;
  electrical_panel: string;
  ownership_status: string;
  decision_maker: string;
  solar_status: string;
  ev_charger_count: string;
};

const INTERESTS: Array<{ id: Interest; label: string }> = [
  { id: "solar", label: "Solar" },
  { id: "heat", label: "Heat pump" },
  { id: "ev", label: "EV charger" },
];

const PROPERTY_TYPES = ["Detached house", "Semi-detached", "Townhouse", "Condo", "Commercial / multi-unit"];
const HEATING_SYSTEMS = ["Gas furnace", "Electric baseboards", "Oil furnace", "Propane", "Boiler / radiators", "Existing heat pump", "Not sure"];
const COOLING_SYSTEMS = ["Central AC", "Ductless mini-split", "Window AC", "No AC", "Not sure"];
const DUCTWORK_OPTIONS = ["I have existing ducts", "No ducts", "Not sure"];
const HOME_SIZES = ["Under 1,000 sq ft", "1,000-1,500 sq ft", "1,500-2,000 sq ft", "2,000-3,000 sq ft", "3,000+ sq ft"];
const MAIN_GOALS = [
  "Lower monthly bills",
  "Add AC",
  "Replace old furnace/AC",
  "Reduce gas use",
  "Improve comfort",
  "Add heating/cooling to specific rooms",
  "Pair with solar",
];
const TIMELINES = ["ASAP", "Within 1 month", "1-3 months", "Just researching"];
const BILL_RANGES = ["<$150", "$150-$250", "$250-$400", "$400+"];
const REBATE_OPTIONS = ["Interested in rebates", "Interested in financing", "Want both", "Not sure"];
const EQUIPMENT_AGES = ["Under 5 years", "5-10 years", "10-15 years", "15+ years", "Not sure"];
const COMFORT_ISSUES = ["No major issues", "One or two rooms", "Several rooms", "Whole home", "Not sure"];
const PANEL_OPTIONS = ["100A", "200A", "Not sure"];
const OWNERSHIP_OPTIONS = ["Own", "Rent"];
const DECISION_OPTIONS = ["Yes", "No", "Decision shared"];
const SOLAR_STATUS_OPTIONS = ["Already have solar", "Planning to install solar", "No solar yet", "Not sure"];

const INITIAL_FORM: LeadForm = {
  contact_name: "",
  owner_email: "",
  owner_mobile: "",
  address: "",
  city: "",
  property_type: "",
  current_heating_system: "",
  current_cooling: "",
  ductwork: "",
  home_size: "",
  main_goal: [],
  timeline: "",
  gas_bill_range: "",
  hydro_bill_range: "",
  rebate_financing_interest: "",
  furnace_ac_age: "",
  comfort_issue: "",
  electrical_panel: "",
  ownership_status: "",
  decision_maker: "",
  solar_status: "",
  ev_charger_count: "",
};

const STEPS = [
  "Property",
  "Systems",
  "Goals",
  "Timing",
  "Contact",
];

export default function ResidentialLandingPage() {
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<LeadForm>(INITIAL_FORM);
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);
  const [placesSessionToken, setPlacesSessionToken] = useState("");
  const [interests, setInterests] = useState<Record<Interest, boolean>>({
    solar: true,
    heat: false,
    ev: false,
  });
  const [submittedSelection, setSubmittedSelection] = useState<string[]>([]);

  const isSuccess = state === "success";
  const selectedInterests = useMemo(
    () => INTERESTS.filter((item) => interests[item.id]).map((item) => item.label),
    [interests]
  );

  function updateField<K extends keyof LeadForm>(key: K, value: LeadForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectPlace(place: SelectedPlace | null, sessionToken: string) {
    setSelectedPlace(place);
    setPlacesSessionToken(sessionToken);
    setForm((current) => ({
      ...current,
      address: place?.streetAddress ?? current.address,
      city: place?.city ?? "",
    }));
  }

  function toggleInterest(interest: Interest) {
    setInterests((current) => {
      const next = { ...current, [interest]: !current[interest] };
      if (!next.ev) {
        setForm((fields) => ({ ...fields, ev_charger_count: "" }));
      }
      return next;
    });
  }

  function toggleGoal(goal: string) {
    setForm((current) => ({
      ...current,
      main_goal: current.main_goal.includes(goal)
        ? current.main_goal.filter((item) => item !== goal)
        : [...current.main_goal, goal],
    }));
  }

  function validateCurrentStep(nextStep = step) {
    if (nextStep === 0) {
      if (!selectedPlace) return "Select your property from the address suggestions.";
      if (!form.property_type) return "Choose a property type.";
      if (!form.home_size) return "Choose your home size.";
    }
    if (nextStep === 1) {
      if (!form.current_heating_system) return "Choose your current heating system.";
      if (!form.current_cooling) return "Choose your current cooling setup.";
      if (!form.ductwork) return "Choose your ductwork status.";
    }
    if (nextStep === 2) {
      if (!selectedInterests.length) return "Select at least one upgrade.";
      if (interests.ev && !form.ev_charger_count) return "Select how many EVs you have or plan to buy.";
      if (!form.main_goal.length) return "Select at least one main goal.";
      if (!form.gas_bill_range || !form.hydro_bill_range) return "Choose your gas and hydro bill ranges.";
    }
    if (nextStep === 3) {
      if (!form.timeline) return "Choose a timeline.";
      if (!form.rebate_financing_interest) return "Choose your rebate or financing interest.";
      if (!form.furnace_ac_age) return "Choose the age of your furnace or AC.";
      if (!form.comfort_issue) return "Choose whether any rooms are too hot or cold.";
      if (!form.electrical_panel) return "Choose your electrical panel size.";
      if (!form.ownership_status) return "Choose whether you own or rent.";
      if (!form.decision_maker) return "Choose whether you are the decision-maker.";
      if (!form.solar_status) return "Choose your solar status.";
    }
    if (nextStep === 4) {
      if (!form.contact_name.trim()) return "Enter your name.";
      if (!isValidEmail(form.owner_email)) return "Enter a valid email address.";
      if (!isValidPhone(form.owner_mobile)) return "Enter a valid phone number.";
    }
    return "";
  }

  function goNext() {
    const error = validateCurrentStep();
    if (error) {
      setMessage(error);
      setState("error");
      return;
    }
    setMessage("");
    setState("idle");
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  function goBack() {
    setMessage("");
    setState("idle");
    setStep((current) => Math.max(current - 1, 0));
  }

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const error = validateCurrentStep(4);
    if (error) {
      setMessage(error);
      setState("error");
      return;
    }
    if (!formRef.current?.reportValidity()) return;

    const formData = new FormData(event.currentTarget);
    const selection = selectedInterests;
    const payload = {
      proposal_type: "residential",
      contact_name: form.contact_name.trim(),
      owner_email: form.owner_email.trim(),
      owner_mobile: form.owner_mobile.trim(),
      google_place_id: selectedPlace?.placeId ?? "",
      places_session_token: placesSessionToken,
      address: selectedPlace?.streetAddress ?? form.address,
      city: selectedPlace?.city ?? form.city,
      property_type: form.property_type,
      current_heating_system: form.current_heating_system,
      current_cooling: form.current_cooling,
      ductwork: form.ductwork,
      home_size: form.home_size,
      main_goal: form.main_goal,
      timeline: form.timeline,
      gas_bill_range: form.gas_bill_range,
      hydro_bill_range: form.hydro_bill_range,
      rebate_financing_interest: form.rebate_financing_interest,
      furnace_ac_age: form.furnace_ac_age,
      comfort_issue: form.comfort_issue,
      electrical_panel: form.electrical_panel,
      ownership_status: form.ownership_status,
      decision_maker: form.decision_maker,
      solar_status: form.solar_status,
      interested_solar: interests.solar,
      interested_heat_pump: interests.heat,
      interested_ev: interests.ev,
      include_solar: interests.solar,
      include_heat_pump: interests.heat,
      include_ev: interests.ev,
      ev_charger_count: form.ev_charger_count,
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

    setSubmittedSelection(selection);
    setForm(INITIAL_FORM);
    setSelectedPlace(null);
    setPlacesSessionToken("");
    setInterests({ solar: true, heat: false, ev: false });
    setStep(0);
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
        <Link href="/" aria-label="Visit AmberField Energy" className="flex min-w-0 items-center">
          <img
            src="/assets/amberfield-logo-light.svg"
            alt="AmberField Energy"
            className="h-12 w-auto max-w-[260px] object-contain sm:h-16 sm:max-w-[340px]"
          />
        </Link>
        <Link
          href="/"
          className="inline-flex shrink-0 items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-white/65 transition hover:text-[#d29a55]"
        >
          <ArrowLeftIcon />
          <span className="hidden sm:inline">Visit our site</span>
        </Link>
      </header>

      <section className="relative z-10 mx-auto grid min-h-[calc(100vh-108px)] max-w-[1240px] items-center gap-10 px-5 pb-14 pt-3 sm:px-11 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div className="max-w-[36rem]">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.3em] text-[#d29a55]">
            Your property. Your power.
          </p>
          <h1 className="font-serif text-[clamp(42px,5.4vw,76px)] font-light leading-[0.98] tracking-normal text-balance">
            Get your home&apos;s <em className="text-[#d29a55]">energy plan</em>.
          </h1>
          <p className="mt-6 max-w-[36ch] text-[clamp(16px,1.7vw,19px)] leading-normal text-white/75">
            Answer a few focused questions. We&apos;ll model your property, your utility profile, and your upgrade options.
          </p>
          <div className="mt-8 border border-white/15 bg-[#211f1b]/60 p-5 backdrop-blur">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d29a55]">What you&apos;ll receive</div>
            <ul className="mt-4 flex flex-col gap-3.5 text-sm text-white/80">
              <ProofPoint>An email with a link to your private solar proposal page</ProofPoint>
              <ProofPoint>Estimated solar production, savings, and next steps for your roof</ProofPoint>
              <ProofPoint>Heat pump and EV charger notes when those upgrades fit your goals</ProofPoint>
            </ul>
          </div>
        </div>

        <div className="border border-white/15 bg-[#211f1b]/75 p-5 shadow-[0_40px_90px_-40px_rgba(0,0,0,0.75)] backdrop-blur-xl sm:p-8">
          <form ref={formRef} onSubmit={submitLead} className={isSuccess ? "hidden" : "block"}>
            <div className="mb-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-serif text-3xl font-light tracking-normal">Get an estimate</h2>
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#d29a55]">
                  Step {step + 1} of {STEPS.length}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-5 gap-1">
                {STEPS.map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      if (index <= step) setStep(index);
                    }}
                    className={`h-1.5 transition ${index <= step ? "bg-[#d29a55]" : "bg-white/15"}`}
                    aria-label={label}
                  />
                ))}
              </div>
              <p className="mt-4 text-sm leading-6 text-white/60">{stepIntro(step)}</p>
            </div>

            {step === 0 ? (
              <div className="space-y-5">
                <AddressAutocomplete
                  query={form.address}
                  selectedPlace={selectedPlace}
                  onQueryChange={(value) => {
                    updateField("address", value);
                    setSelectedPlace(null);
                    updateField("city", "");
                  }}
                  onSelect={selectPlace}
                />
                {form.city ? <ReadOnly label="City" value={`${form.city}, ON`} /> : null}
                <ChoiceGroup label="Property type" value={form.property_type} options={PROPERTY_TYPES} onChange={(value) => updateField("property_type", value)} />
                <ChoiceGroup label="Home size" value={form.home_size} options={HOME_SIZES} onChange={(value) => updateField("home_size", value)} />
              </div>
            ) : null}

            {step === 1 ? (
              <div className="space-y-5">
                <ChoiceGroup label="Current heating system" value={form.current_heating_system} options={HEATING_SYSTEMS} onChange={(value) => updateField("current_heating_system", value)} />
                <ChoiceGroup label="Current cooling" value={form.current_cooling} options={COOLING_SYSTEMS} onChange={(value) => updateField("current_cooling", value)} />
                <ChoiceGroup label="Ductwork" value={form.ductwork} options={DUCTWORK_OPTIONS} onChange={(value) => updateField("ductwork", value)} />
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-5">
                <div>
                  <Label>I&apos;m interested in</Label>
                  <div className="flex flex-wrap gap-2">
                    {INTERESTS.map((interest) => (
                      <ToggleChip
                        key={interest.id}
                        active={interests[interest.id]}
                        onClick={() => toggleInterest(interest.id)}
                      >
                        {interest.label}
                      </ToggleChip>
                    ))}
                  </div>
                </div>
                {interests.ev ? (
                  <SelectField
                    label="How many EVs do you have or plan to buy?"
                    value={form.ev_charger_count}
                    options={["1", "2", "3", "4+"]}
                    onChange={(value) => updateField("ev_charger_count", value)}
                    required
                  />
                ) : null}
                <div>
                  <Label>Main goal</Label>
                  <div className="flex flex-wrap gap-2">
                    {MAIN_GOALS.map((goal) => (
                      <ToggleChip key={goal} active={form.main_goal.includes(goal)} onClick={() => toggleGoal(goal)}>
                        {goal}
                      </ToggleChip>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField label="Average gas bill" value={form.gas_bill_range} options={BILL_RANGES} onChange={(value) => updateField("gas_bill_range", value)} required />
                  <SelectField label="Average hydro bill" value={form.hydro_bill_range} options={BILL_RANGES} onChange={(value) => updateField("hydro_bill_range", value)} required />
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-5">
                <ChoiceGroup label="Timeline" value={form.timeline} options={TIMELINES} onChange={(value) => updateField("timeline", value)} />
                <ChoiceGroup label="Rebates / financing interest" value={form.rebate_financing_interest} options={REBATE_OPTIONS} onChange={(value) => updateField("rebate_financing_interest", value)} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField label="Furnace / AC age" value={form.furnace_ac_age} options={EQUIPMENT_AGES} onChange={(value) => updateField("furnace_ac_age", value)} required />
                  <SelectField label="Rooms too hot or cold?" value={form.comfort_issue} options={COMFORT_ISSUES} onChange={(value) => updateField("comfort_issue", value)} required />
                  <SelectField label="Electrical panel" value={form.electrical_panel} options={PANEL_OPTIONS} onChange={(value) => updateField("electrical_panel", value)} required />
                  <SelectField label="Own or rent?" value={form.ownership_status} options={OWNERSHIP_OPTIONS} onChange={(value) => updateField("ownership_status", value)} required />
                  <SelectField label="Are you the decision-maker?" value={form.decision_maker} options={DECISION_OPTIONS} onChange={(value) => updateField("decision_maker", value)} required />
                  <SelectField label="Solar status" value={form.solar_status} options={SOLAR_STATUS_OPTIONS} onChange={(value) => updateField("solar_status", value)} required />
                </div>
              </div>
            ) : null}

            {step === 4 ? (
              <div className="space-y-4">
                <Field label="Full name" value={form.contact_name} onChange={(value) => updateField("contact_name", value)} autoComplete="name" placeholder="Your name" required />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Email" value={form.owner_email} onChange={(value) => updateField("owner_email", value)} type="email" autoComplete="email" placeholder="you@email.com" required />
                  <Field label="Phone" value={form.owner_mobile} onChange={(value) => updateField("owner_mobile", value)} type="tel" autoComplete="tel" inputMode="tel" pattern="[0-9+().\\-\\s]{10,}" title="Enter a valid phone number." placeholder="(555) 000-0000" required />
                </div>
                <div className="border border-white/15 bg-white/[0.04] p-4 text-sm leading-6 text-white/70">
                  After submission, AmberField will email you a link to your private proposal microsite once your solar model is ready.
                </div>
              </div>
            ) : null}

            <input name="website" tabIndex={-1} autoComplete="off" className="hidden" />

            {message ? (
              <p className={`mt-5 border px-3 py-2 text-xs leading-5 ${state === "error" ? "border-[#e28761]/40 bg-[#e28761]/10 text-[#ffc0a8]" : "border-[#86a06f]/40 bg-[#86a06f]/10 text-[#b8d39a]"}`}>
                {message}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={goBack}
                  className="flex-1 border border-white/20 px-5 py-4 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Back
                </button>
              ) : null}
              {step < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={goNext}
                  className="flex-[2] bg-[#d29a55] px-5 py-4 text-base font-semibold text-[#1c1a17] transition hover:-translate-y-0.5 hover:bg-[#b9783f] hover:text-white"
                >
                  Continue
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={state === "submitting"}
                  className="flex-[2] bg-[#d29a55] px-5 py-4 text-base font-semibold text-[#1c1a17] transition hover:-translate-y-0.5 hover:bg-[#b9783f] hover:text-white disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {state === "submitting" ? "Submitting..." : "Get my proposal link"}
                </button>
              )}
            </div>
            <div className="mt-3 text-center text-[11px] text-white/40">
              We&apos;ll never sell your details. Estimates are free.
            </div>
          </form>

          <div
            className={`min-h-[480px] flex-col items-center justify-center gap-4 text-center ${
              isSuccess ? "flex" : "hidden"
            }`}
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full border border-[#d29a55]">
              <CheckIcon className="h-7 w-7 text-[#d29a55]" />
            </span>
            <h2 className="font-serif text-3xl font-light tracking-normal">Thanks, you&apos;re in.</h2>
            <p className="max-w-[34ch] text-sm leading-6 text-white/65">
              We&apos;re modeling your home now. Watch your inbox for a link to your solar proposal page.
            </p>
            <p className="text-xs text-white/45">
              Selected: {submittedSelection.length ? submittedSelection.join(", ") : "Residential energy review"}
            </p>
            <button
              type="button"
              onClick={() => {
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

function AddressAutocomplete({
  query,
  selectedPlace,
  onQueryChange,
  onSelect,
}: {
  query: string;
  selectedPlace: SelectedPlace | null;
  onQueryChange: (value: string) => void;
  onSelect: (place: SelectedPlace | null, sessionToken: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const sessionTokenRef = useRef("");
  const getSessionToken = useCallback(() => {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    return sessionTokenRef.current;
  }, []);

  useEffect(() => {
    if (selectedPlace || query.trim().length < 3) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      const sessionToken = getSessionToken();

      try {
        const res = await fetch("/api/public/places/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: query, sessionToken }),
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Address lookup failed");
        setSuggestions(json.suggestions ?? []);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Address lookup failed");
          setSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 260);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [getSessionToken, query, selectedPlace]);

  async function selectSuggestion(suggestion: PlaceSuggestion) {
    setLoading(true);
    setError("");
    const sessionToken = getSessionToken();

    try {
      const res = await fetch("/api/public/places/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: suggestion.placeId, sessionToken }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Address verification failed");
      onQueryChange(json.place.formattedAddress);
      setSuggestions([]);
      onSelect(json.place, sessionToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Address verification failed");
      onSelect(null, sessionToken);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <Label>Property address</Label>
      <input
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value);
          onSelect(null, getSessionToken());
          setError("");
          setSuggestions([]);
        }}
        placeholder="Start typing your property address"
        autoComplete="off"
        required
        className="w-full border-0 border-b border-white/25 bg-transparent px-0 py-2 text-base text-white outline-none transition placeholder:text-white/30 focus:border-[#d29a55]"
      />

      {suggestions.length ? (
        <div className="absolute left-0 right-0 top-[70px] z-20 max-h-72 overflow-y-auto border border-[#d29a55]/40 bg-[#181512] shadow-2xl">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.placeId}
              type="button"
              onClick={() => selectSuggestion(suggestion)}
              className="block w-full border-b border-white/[0.06] px-3 py-3 text-left transition last:border-b-0 hover:bg-white/[0.06]"
            >
              <span className="block text-sm text-white">{suggestion.mainText || suggestion.text}</span>
              {suggestion.secondaryText ? (
                <span className="mt-1 block text-xs text-white/45">{suggestion.secondaryText}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/45">
        {loading ? <span>Checking Google Places...</span> : null}
        {selectedPlace ? (
          <>
            <span className="border border-[#9fb27b]/40 bg-[#9fb27b]/10 px-2 py-1 text-[#b8d39a]">Verified address</span>
            <span>
              {selectedPlace.city}, {selectedPlace.province}
            </span>
          </>
        ) : (
          <span>Choose a Google Places result so we can model the correct roof.</span>
        )}
      </div>

      {error ? <p className="mt-2 text-xs text-[#ffc0a8]">{error}</p> : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  autoComplete,
  inputMode,
  placeholder,
  pattern,
  title,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
  pattern?: string;
  title?: string;
}) {
  return (
    <label className="block min-w-0">
      <Label required={required}>{label}</Label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
        pattern={pattern}
        title={title}
        className="w-full border-0 border-b border-white/25 bg-transparent px-0 py-2 text-base text-white outline-none transition placeholder:text-white/30 focus:border-[#d29a55]"
      />
    </label>
  );
}

function ChoiceGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label required>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <ToggleChip key={option} active={value === option} onClick={() => onChange(option)}>
            {option}
          </ToggleChip>
        ))}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  required,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <Label required={required}>{label}</Label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="w-full border border-white/20 bg-[#171410] px-3 py-3 text-sm text-white outline-none transition focus:border-[#d29a55]"
      >
        <option value="">Select one</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
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

function Label({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-white/60">
      {children} {required ? <span className="text-[#ffc0a8]">*</span> : null}
    </span>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/15 bg-white/[0.04] px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-white/45">{label}</div>
      <div className="mt-1 text-sm text-white">{value}</div>
    </div>
  );
}

function ProofPoint({ children }: { children: ReactNode }) {
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

function stepIntro(step: number) {
  if (step === 0) return "Start with the property so we can model the correct roof and utility context.";
  if (step === 1) return "These answers help us decide whether central or ductless heat pump options make sense.";
  if (step === 2) return "Tell us which upgrades matter and what you want the project to solve.";
  if (step === 3) return "A few qualifying details help us prioritize rebates, financing, and electrical readiness.";
  return "Last step. We need this so your proposal page can be sent to the right inbox.";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value.trim());
}

function isValidPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}
