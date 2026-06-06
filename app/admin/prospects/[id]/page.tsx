import { notFound } from "next/navigation";
import Link from "next/link";
import { getProspect } from "@/lib/supabase";
import type { Prospect } from "@/lib/types";
import { PipelineActions } from "./PipelineActions";

export default async function ProspectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const prospect = await getProspect(id);
  if (!prospect) notFound();

  const roofAge = prospect.year_built
    ? new Date().getFullYear() - prospect.year_built
    : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-gray-500 hover:text-gray-900 text-sm">
          ← Dashboard
        </Link>
        <span className="text-gray-300">|</span>
        <h1 className="font-semibold text-gray-900">{prospect.company_name}</h1>
        <span className="ml-auto text-xs px-2 py-1 bg-gray-100 rounded-full text-gray-600">
          {prospect.stage}
        </span>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-3 gap-6">
        {/* left col — building + contact */}
        <div className="col-span-2 space-y-6">
          {/* satellite image */}
          {prospect.satellite_image_url && (
            <div className="rounded-xl overflow-hidden border border-gray-200 relative">
              <img
                src={prospect.satellite_image_url}
                alt={`Satellite view of ${prospect.address}`}
                className="w-full"
              />
              {prospect.panel_svg_url && (
                <img
                  src={prospect.panel_svg_url}
                  alt="Solar panel overlay"
                  className="absolute inset-0 w-full h-full"
                />
              )}
            </div>
          )}

          <Card title="Building">
            <Row label="Address" value={`${prospect.address}, ${prospect.city}`} />
            <Row label="Sqft" value={prospect.sqft ? `${prospect.sqft.toLocaleString()} ft²` : "—"} />
            <Row label="Year Built" value={prospect.year_built?.toString() ?? "—"} />
            <Row label="Roof Age" value={roofAge ? `${roofAge} years` : "—"} />
            <Row label="Industry" value={prospect.industry ?? "—"} />
            {prospect.lat && (
              <Row label="Coordinates" value={`${prospect.lat.toFixed(5)}, ${prospect.lng?.toFixed(5)}`} />
            )}
          </Card>

          <Card title="Owner Contact">
            <Row label="Name" value={prospect.owner_name ?? "—"} />
            <Row label="Title" value={prospect.owner_title ?? "—"} />
            <Row label="Email" value={prospect.owner_email ?? "—"} />
            <Row label="Mobile" value={prospect.owner_mobile ?? "—"} />
          </Card>

          {prospect.panel_count && (
            <Card title="Solar System">
              <Row label="Panels" value={`${prospect.panel_count} panels`} />
              <Row label="System Size" value={`${prospect.system_kw} kW`} />
              <Row
                label="Yearly Output"
                value={`${prospect.yearly_kwh?.toLocaleString()} kWh`}
              />
              <Row
                label="Year 1 Savings"
                value={`$${prospect.yearly_savings?.toLocaleString()}`}
              />
              <Row
                label="25-Year Savings"
                value={`$${prospect.savings_25yr?.toLocaleString()}`}
                highlight
              />
              <Row
                label="System Cost"
                value={`$${prospect.system_cost?.toLocaleString()}`}
              />
              <Row
                label="Incentive Credit"
                value={`$${prospect.incentive_amount?.toLocaleString()}`}
                highlight
              />
            </Card>
          )}
        </div>

        {/* right col — pipeline */}
        <div className="space-y-4">
          <PipelineActions prospect={prospect} />

          {prospect.video_url && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Proposal Video
              </h3>
              <video
                src={prospect.video_url}
                poster={prospect.video_thumbnail_url ?? undefined}
                controls
                className="w-full rounded-lg"
              />
            </div>
          )}

          {prospect.microsite_url && (
            <a
              href={prospect.microsite_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-black text-white text-center py-3 rounded-xl text-sm font-medium hover:bg-gray-800 transition"
            >
              View Microsite →
            </a>
          )}
        </div>
      </main>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">{title}</h2>
      <dl className="space-y-2">{children}</dl>
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`font-medium ${highlight ? "text-green-600" : "text-gray-900"}`}>
        {value}
      </dd>
    </div>
  );
}
