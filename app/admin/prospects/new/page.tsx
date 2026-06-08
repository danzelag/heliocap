"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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

type SolarPreview = {
  target: {
    imageUrl: string;
    source: string;
    warning: string;
  };
  solar: {
    ok: boolean;
    error?: string;
    panelCount?: number;
    systemKw?: number;
    yearlyKwh?: number;
    yearlySavings?: number;
    annualFluxUrl?: string | null;
    dataLayerWarning?: string | null;
    heatmapSvg?: string;
  };
};

export default function NewProspectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedPlace) {
      setError("Select a real address from Google Places before saving.");
      return;
    }

    setLoading(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const data = {
      company_name: form.get("company_name"),
      google_place_id: form.get("google_place_id"),
      places_session_token: form.get("places_session_token"),
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
              <Readout label="Mode" value="Places" />
            </div>
          </aside>

          <form onSubmit={handleSubmit} className="border border-white/[0.07] bg-gradient-to-b from-[#1a1a1f] to-[#131316] p-5 sm:p-7">
            <Section title="Building">
              <Field label="Company Name" name="company_name" required />
              <AddressAutocomplete selectedPlace={selectedPlace} onSelect={setSelectedPlace} />
              {selectedPlace ? <TargetVerification key={selectedPlace.placeId} place={selectedPlace} /> : null}
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
              disabled={loading || !selectedPlace}
              className="mt-7 w-full border border-[#c08a4b] bg-[#c08a4b] px-4 py-3 text-sm font-semibold text-[#131316] transition hover:bg-[#d8a866] disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? "Saving prospect..." : selectedPlace ? "Save Prospect" : "Select a verified address"}
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}

function TargetVerification({ place }: { place: SelectedPlace }) {
  const [preview, setPreview] = useState<SolarPreview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/solar/preview?lat=${place.lat}&lng=${place.lng}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Solar preview failed");
        setPreview(json);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setPreview({
            target: {
              imageUrl: `/api/maps/static?lat=${place.lat}&lng=${place.lng}&zoom=18&size=960x540&maptype=satellite`,
              source: "google_maps_satellite_fallback",
              warning: "Google Earth target unavailable. Showing Google Maps satellite fallback.",
            },
            solar: {
              ok: false,
              error: error instanceof Error ? error.message : "Solar preview failed",
            },
          });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [place]);

  const heatmapSrc = preview?.solar.heatmapSvg
    ? `data:image/svg+xml;utf8,${encodeURIComponent(preview.solar.heatmapSvg)}`
    : null;
  const targetImage = preview?.target.imageUrl ?? `/api/maps/static?lat=${place.lat}&lng=${place.lng}&zoom=18&size=960x540&maptype=satellite`;

  return (
    <div className="border border-white/[0.07] bg-[#101014]">
      <div className="grid gap-px bg-white/[0.07] xl:grid-cols-2">
        <div className="bg-[#17171b] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#d8a866]">Solar target</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500">
              {place.lat.toFixed(4)} N · {Math.abs(place.lng).toFixed(4)} W
            </div>
          </div>
          <div className="relative aspect-video overflow-hidden border border-white/[0.08] bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={targetImage} alt={`${place.streetAddress} target`} className="h-full w-full object-cover opacity-90" />
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] bg-[length:40px_40px]" />
            <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 border border-[#d8a866]">
              <span className="absolute -left-1 -top-1 h-3 w-3 border-l border-t border-[#d8a866]" />
              <span className="absolute -right-1 -top-1 h-3 w-3 border-r border-t border-[#d8a866]" />
              <span className="absolute -bottom-1 -left-1 h-3 w-3 border-b border-l border-[#d8a866]" />
              <span className="absolute -bottom-1 -right-1 h-3 w-3 border-b border-r border-[#d8a866]" />
            </div>
            <div className="absolute bottom-3 left-3 border border-[#d8a866]/40 bg-black/70 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#d8a866]">
              Maps satellite fallback
            </div>
          </div>
          <p className="mt-3 border border-[#c08a4b]/25 bg-[#c08a4b]/10 px-3 py-2 text-xs leading-5 text-[#d8a866]">
            {preview?.target.warning ?? "Google Earth target loading. If Earth capture is unavailable, Maps satellite fallback is shown."}
          </p>
        </div>

        <div className="bg-[#17171b] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#d8a866]">Solar heat map</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500">
              {loading ? "Solar API · loading" : preview?.solar.ok ? "Solar API · verified" : "Solar API · pending"}
            </div>
          </div>
          <div className="relative aspect-video overflow-hidden border border-white/[0.08] bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={targetImage} alt={`${place.streetAddress} solar base`} className="h-full w-full object-cover opacity-45 grayscale" />
            {heatmapSrc ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={heatmapSrc} alt="Solar API heat map overlay" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-stone-500">
                {loading ? "Generating solar heat map..." : preview?.solar.error ?? "Solar heat map will appear after address verification."}
              </div>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 border border-white/[0.07] bg-white/[0.07] sm:grid-cols-4">
            <Readout label="Panels" value={preview?.solar.panelCount ? preview.solar.panelCount.toLocaleString() : "Pending"} />
            <Readout label="System" value={preview?.solar.systemKw ? `${preview.solar.systemKw.toLocaleString()} kW` : "Pending"} />
            <Readout label="Annual" value={preview?.solar.yearlyKwh ? `${Math.round(preview.solar.yearlyKwh / 1000).toLocaleString()} MWh` : "Pending"} />
            <Readout label="Savings" value={preview?.solar.yearlySavings ? `$${preview.solar.yearlySavings.toLocaleString()}` : "Pending"} />
          </div>

          {preview?.solar.dataLayerWarning ? (
            <p className="mt-3 text-xs text-stone-500">{preview.solar.dataLayerWarning}</p>
          ) : preview?.solar.annualFluxUrl ? (
            <p className="mt-3 text-xs text-stone-500">
              Annual flux GeoTIFF located. Browser preview uses panel-energy heat map overlay.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AddressAutocomplete({
  selectedPlace,
  onSelect,
}: {
  selectedPlace: SelectedPlace | null;
  onSelect: (place: SelectedPlace | null) => void;
}) {
  const [query, setQuery] = useState(selectedPlace?.formattedAddress ?? "");
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
    if (selectedPlace || query.trim().length < 3) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      const sessionToken = getSessionToken();

      try {
        const res = await fetch("/api/places/autocomplete", {
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
      const res = await fetch("/api/places/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: suggestion.placeId, sessionToken }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Address verification failed");
      setQuery(json.place.formattedAddress);
      setSuggestions([]);
      onSelect(json.place);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Address verification failed");
      onSelect(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <label className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-stone-500">
        Verified Property Address <span className="text-[#c8704a]">*</span>
      </label>
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          onSelect(null);
          setError("");
          setSuggestions([]);
        }}
        placeholder="Start typing the commercial property address"
        autoComplete="off"
        className="w-full border border-white/12 bg-[#131316] px-3 py-2.5 text-sm text-[#ece9e3] outline-none transition placeholder:text-stone-700 focus:border-[#c08a4b]/70 focus:bg-[#17171b]"
      />
      <input type="hidden" name="google_place_id" value={selectedPlace?.placeId ?? ""} />

      {suggestions.length ? (
        <div className="absolute left-0 right-0 top-[72px] z-20 max-h-72 overflow-y-auto border border-[#c08a4b]/35 bg-[#18181d] shadow-2xl">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.placeId}
              type="button"
              onClick={() => selectSuggestion(suggestion)}
              className="block w-full border-b border-white/[0.06] px-3 py-3 text-left transition last:border-b-0 hover:bg-white/[0.06]"
            >
              <span className="block text-sm text-[#ece9e3]">{suggestion.mainText || suggestion.text}</span>
              {suggestion.secondaryText ? (
                <span className="mt-1 block text-xs text-stone-500">{suggestion.secondaryText}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-500">
        {loading ? <span>Checking Google Places...</span> : null}
        {selectedPlace ? (
          <>
            <span className="border border-[#7f9264]/40 bg-[#7f9264]/10 px-2 py-1 text-[#9fb27b]">
              Google verified
            </span>
            <span>{selectedPlace.streetAddress}</span>
            <span>·</span>
            <span>
              {selectedPlace.city}, {selectedPlace.province}
            </span>
          </>
        ) : (
          <span>Choose a Google Places result to unlock saving.</span>
        )}
      </div>

      {error ? <p className="mt-2 text-xs text-[#c8704a]">{error}</p> : null}
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
