import Link from "next/link";
import { listProspects } from "@/lib/supabase";
import type { Prospect, ProspectStage } from "@/lib/types";

const STAGE_COLORS: Record<ProspectStage, string> = {
  sourced: "bg-gray-100 text-gray-700",
  geocoded: "bg-blue-100 text-blue-700",
  qualified: "bg-indigo-100 text-indigo-700",
  skipped: "bg-gray-100 text-gray-400",
  satellite_done: "bg-purple-100 text-purple-700",
  solar_done: "bg-yellow-100 text-yellow-700",
  video_done: "bg-orange-100 text-orange-700",
  microsite_live: "bg-cyan-100 text-cyan-700",
  emailed: "bg-teal-100 text-teal-700",
  followed_up: "bg-lime-100 text-lime-700",
  replied: "bg-emerald-100 text-emerald-700",
  booked: "bg-green-100 text-green-700",
  dead: "bg-red-100 text-red-400",
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const prospects = await listProspects(undefined, 100);

  const byStage = prospects.reduce<Record<string, number>>((acc, p) => {
    acc[p.stage] = (acc[p.stage] ?? 0) + 1;
    return acc;
  }, {});

  const pipeline = prospects.filter((p) => !["skipped", "dead"].includes(p.stage));
  const totalSavings = pipeline.reduce((s, p) => s + (p.savings_25yr ?? 0), 0);
  const booked = prospects.filter((p) => p.stage === "booked").length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">O</span>
          </div>
          <span className="font-semibold text-gray-900">OpenClaw</span>
        </div>
        <Link
          href="/admin/prospects/new"
          className="bg-black text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800 transition"
        >
          + Add Prospect
        </Link>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Prospects" value={prospects.length} />
          <StatCard label="In Pipeline" value={pipeline.length} />
          <StatCard
            label="25yr Savings Pipeline"
            value={`$${(totalSavings / 1_000_000).toFixed(1)}M`}
          />
          <StatCard label="Meetings Booked" value={booked} />
        </div>

        {/* stage breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Pipeline by Stage
          </h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(byStage).map(([stage, count]) => (
              <span
                key={stage}
                className={`px-3 py-1 rounded-full text-xs font-medium ${STAGE_COLORS[stage as ProspectStage] ?? "bg-gray-100 text-gray-600"}`}
              >
                {stage} · {count}
              </span>
            ))}
          </div>
        </div>

        {/* prospect table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">Company</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">City</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">Sqft</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">Stage</th>
                <th className="text-right px-5 py-3 text-gray-500 font-medium">25yr Savings</th>
                <th className="text-right px-5 py-3 text-gray-500 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {prospects.map((p) => (
                <ProspectRow key={p.id} p={p} />
              ))}
              {prospects.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-gray-400">
                    No prospects yet.{" "}
                    <Link href="/admin/prospects/new" className="text-blue-600 underline">
                      Add one
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

function ProspectRow({ p }: { p: Prospect }) {
  return (
    <tr className="hover:bg-gray-50 transition">
      <td className="px-5 py-3 font-medium text-gray-900">
        <Link href={`/admin/prospects/${p.id}`} className="hover:underline">
          {p.company_name}
        </Link>
      </td>
      <td className="px-5 py-3 text-gray-600">{p.city}</td>
      <td className="px-5 py-3 text-gray-600">
        {p.sqft ? `${p.sqft.toLocaleString()} ft²` : "—"}
      </td>
      <td className="px-5 py-3">
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_COLORS[p.stage]}`}
        >
          {p.stage}
        </span>
      </td>
      <td className="px-5 py-3 text-right text-gray-900">
        {p.savings_25yr ? `$${Math.round(p.savings_25yr).toLocaleString()}` : "—"}
      </td>
      <td className="px-5 py-3 text-right">
        {p.microsite_url ? (
          <a
            href={p.microsite_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline text-xs"
          >
            View Site
          </a>
        ) : (
          <RunPipelineButton id={p.id} />
        )}
      </td>
    </tr>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function RunPipelineButton({ id }: { id: string }) {
  return (
    <form
      action={async () => {
        "use server";
        await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL}/api/pipeline/run`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          }
        );
      }}
    >
      <button
        type="submit"
        className="text-xs text-indigo-600 hover:underline bg-transparent border-none cursor-pointer"
      >
        Run Pipeline
      </button>
    </form>
  );
}
