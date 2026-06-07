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
  return currentIdx >= idx;
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
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Pipeline
      </h3>

      <div className="space-y-2 mb-4">
        {PIPELINE_STEPS.map((step) => {
          const done = isCompleted(prospect, step.stage);
          const isLoading = loading === step.key;
          return (
            <div key={step.key} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${done ? "bg-green-500 border-green-500" : "border-gray-300"}`}
                >
                  {done && (
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
                <span className={`text-sm ${done ? "text-gray-500 line-through" : "text-gray-900"}`}>
                  {step.label}
                </span>
              </div>
              {!done && (
                <button
                  onClick={() => runStep(step.key)}
                  disabled={!!loading}
                  className="text-xs text-indigo-600 hover:underline disabled:opacity-40"
                >
                  {isLoading ? "Running..." : "Run"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p className="text-red-600 text-xs bg-red-50 rounded px-3 py-2 mb-3">{error}</p>
      )}

      <button
        onClick={runAll}
        disabled={!!loading}
        className="w-full bg-black text-white text-sm py-2.5 rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
      >
        {loading === "all" ? "Running Pipeline..." : "Run Full Pipeline"}
      </button>

      {prospect.slug && (
        <p className="text-xs text-gray-400 mt-3 text-center font-mono">{prospect.slug}</p>
      )}
    </div>
  );
}
