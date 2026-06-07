"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Prospect } from "@/lib/types";

const PIPELINE_STEPS = [
  { key: "geocode", label: "Geocode + Qualify", stage: "geocoded" },
  { key: "satellite", label: "Satellite Image", stage: "satellite_done" },
  { key: "solar", label: "Solar Analysis", stage: "solar_done" },
  { key: "video", label: "Generate Video", stage: "video_done" },
  { key: "microsite", label: "Publish Microsite", stage: "microsite_live" },
  { key: "email", label: "Send Email", stage: "emailed" },
];

const STAGE_ORDER = PIPELINE_STEPS.map((s) => s.stage);

function isCompleted(prospect: Prospect, stage: string): boolean {
  const idx = STAGE_ORDER.indexOf(stage);
  const currentIdx = STAGE_ORDER.indexOf(prospect.stage);
  return currentIdx >= idx && currentIdx !== -1;
}

export function PipelineActions({ prospect }: { prospect: Prospect }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  async function runStep(step: string) {
    setLoading(step);
    setError("");

    let endpoint = "/api/pipeline/run";
    const body: Record<string, string> = { id: prospect.id };

    if (step === "solar") {
      endpoint = "/api/pipeline/solar";
    } else if (step === "microsite") {
      endpoint = "/api/pipeline/microsite";
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json();
      setError(err.error ?? "Pipeline step failed");
    } else {
      router.refresh();
    }
    setLoading(null);
  }

  async function runAll() {
    setLoading("all");
    setError("");
    const res = await fetch("/api/pipeline/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: prospect.id }),
    });
    const json = await res.json();
    if (!json.success) {
      setError(json.error ?? "Pipeline failed");
    } else {
      router.refresh();
    }
    setLoading(null);
  }

  return (
    <section className="border border-white/[0.07] bg-[#1a1a1f]">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-4">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-[#ece9e3]">Pipeline</div>
          <div className="mt-1 text-[10.5px] text-stone-500">Agent steps</div>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-500">{prospect.stage}</div>
      </div>

      <div>
        {PIPELINE_STEPS.map((step) => {
          const done = isCompleted(prospect, step.stage);
          const isLoading = loading === step.key;
          return (
            <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-4 py-3 last:border-b-0" key={step.key}>
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    done ? "border-[#86a06f] bg-[#86a06f]" : "border-white/20"
                  }`}
                >
                  {done ? <span className="h-1.5 w-1.5 rounded-full bg-[#131316]" /> : null}
                </span>
                <span className={`truncate text-sm ${done ? "text-stone-500" : "text-stone-200"}`}>{step.label}</span>
              </div>
              {!done ? (
                <button
                  onClick={() => runStep(step.key)}
                  disabled={Boolean(loading)}
                  className="shrink-0 border border-[#c08a4b]/45 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-[#d8a866] transition hover:bg-[#c08a4b]/10 disabled:cursor-wait disabled:opacity-40"
                >
                  {isLoading ? "Running" : "Run"}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? <p className="mx-4 mt-4 border border-[#c8704a]/40 bg-[#c8704a]/10 px-3 py-2 text-xs text-[#c8704a]">{error}</p> : null}

      <div className="p-4">
        <button
          onClick={runAll}
          disabled={Boolean(loading)}
          className="w-full border border-[#c08a4b] bg-[#c08a4b] px-4 py-3 text-sm font-semibold text-[#131316] transition hover:bg-[#d8a866] disabled:cursor-wait disabled:opacity-60"
        >
          {loading === "all" ? "Running pipeline..." : "Run Full Pipeline"}
        </button>
        {prospect.slug ? <p className="mt-3 text-center font-mono text-xs text-stone-600">{prospect.slug}</p> : null}
      </div>
    </section>
  );
}
