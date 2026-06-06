import { notFound } from "next/navigation";
import { getProspectBySlug } from "@/lib/supabase";
import type { Prospect } from "@/lib/types";
import { CountdownTimer } from "./CountdownTimer";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const prospect = await getProspectBySlug(slug);
  if (!prospect) return {};
  return {
    title: `Solar Proposal for ${prospect.company_name}`,
    description: `Personalized solar analysis for ${prospect.address}, ${prospect.city}`,
    openGraph: {
      images: prospect.satellite_image_url ? [prospect.satellite_image_url] : [],
    },
  };
}

export const dynamic = "force-dynamic";

// deadline: 90 days from now (incentive program closes)
const DEADLINE = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

export default async function MicrositePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const prospect = await getProspectBySlug(slug);

  if (!prospect || prospect.stage === "dead" || prospect.stage === "sourced") {
    notFound();
  }

  const roofAge = prospect.year_built
    ? new Date().getFullYear() - prospect.year_built
    : null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* video hero */}
      <section className="relative aspect-video max-h-[80vh] overflow-hidden">
        {prospect.video_url ? (
          <video
            src={prospect.video_url}
            poster={prospect.video_thumbnail_url ?? prospect.satellite_image_url ?? undefined}
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-full object-cover"
          />
        ) : prospect.satellite_image_url ? (
          <div className="relative w-full h-full">
            <img
              src={prospect.satellite_image_url}
              alt={`${prospect.address} satellite`}
              className="w-full h-full object-cover"
            />
            {prospect.panel_svg_url && (
              <img
                src={prospect.panel_svg_url}
                alt="Solar panel layout"
                className="absolute inset-0 w-full h-full"
              />
            )}
          </div>
        ) : (
          <div className="w-full h-full bg-gray-900 flex items-center justify-center">
            <span className="text-gray-600">Satellite imagery loading...</span>
          </div>
        )}

        {/* gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent" />

        {/* hero text */}
        <div className="absolute bottom-0 left-0 right-0 p-8 md:p-12">
          <p className="text-sm text-gray-400 uppercase tracking-widest mb-2">
            Solar Proposal
          </p>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight">
            {prospect.company_name}
          </h1>
          <p className="text-gray-400 mt-2">{prospect.address}, {prospect.city}, Ontario</p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-6 py-16 space-y-16">
        {/* greeting */}
        {prospect.owner_name && (
          <div className="text-center">
            <p className="text-xl text-gray-300">
              Hey {prospect.owner_name.split(" ")[0]}, we ran the numbers on your building.
            </p>
          </div>
        )}

        {/* building snapshot */}
        <section>
          <SectionLabel>Building Snapshot</SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SnapCard label="Address" value={prospect.address} />
            <SnapCard label="Size" value={prospect.sqft ? `${prospect.sqft.toLocaleString()} ft²` : "—"} />
            <SnapCard label="Year Built" value={prospect.year_built?.toString() ?? "—"} />
            <SnapCard label="Roof Age" value={roofAge ? `${roofAge} years` : "—"} accent={roofAge && roofAge >= 20 ? "yellow" : undefined} />
          </div>
          {roofAge && roofAge >= 20 && (
            <p className="mt-4 text-yellow-400 text-sm">
              Your roof is at the 20-year replacement window — the optimal time to combine a reroof with a solar installation and maximize your incentive eligibility.
            </p>
          )}
        </section>

        {/* solar system */}
        {prospect.panel_count && (
          <section>
            <SectionLabel>Your Solar System</SectionLabel>
            <div className="grid grid-cols-3 gap-4">
              <MetricCard value={prospect.panel_count.toString()} label="Panels" />
              <MetricCard value={`${prospect.system_kw} kW`} label="System Size" />
              <MetricCard
                value={`${(prospect.yearly_kwh! / 1000).toFixed(0)} MWh`}
                label="Annual Output"
              />
            </div>
            <p className="mt-4 text-gray-500 text-sm">
              Deployed on the top-performing 70% of your available roof area — matching real installer practice after code setbacks and HVAC clearances.
            </p>
          </section>
        )}

        {/* savings summary */}
        {prospect.savings_25yr && (
          <section>
            <SectionLabel>Savings Summary</SectionLabel>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <SavingsCard
                label="Year 1"
                value={`$${Math.round(prospect.yearly_savings!).toLocaleString()}`}
              />
              <SavingsCard
                label="Year 10"
                value={`$${Math.round(prospect.yearly_savings! * 10 * 1.3).toLocaleString()}`}
              />
              <SavingsCard
                label="25 Years"
                value={`$${Math.round(prospect.savings_25yr).toLocaleString()}`}
                featured
              />
              <SavingsCard
                label="Available Credits"
                value={`$${Math.round(prospect.incentive_amount!).toLocaleString()}`}
                accent="green"
              />
            </div>
            <p className="mt-4 text-gray-500 text-sm">
              Based on Ontario commercial TOU rates at $0.13/kWh with 3% annual escalation. System installed at ~$2.10/W commercial Ontario rate.
            </p>
          </section>
        )}

        {/* incentive countdown */}
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
          <SectionLabel>Incentive Deadline</SectionLabel>
          <CountdownTimer deadline={DEADLINE} />
          <p className="text-gray-400 text-sm mt-4">
            Canada&apos;s federal solar incentives are currently active. The safe harbour provision lets you lock in today&apos;s rate by signing an installation agreement before the program closes — construction can follow.
          </p>
        </section>

        {/* CTA */}
        <section className="text-center py-8">
          <h2 className="text-3xl font-bold mb-4">Ready to move forward?</h2>
          <p className="text-gray-400 mb-8 max-w-md mx-auto">
            Book a 20-minute call. We&apos;ll walk through the engineering report and answer any questions.
          </p>
          <a
            href={process.env.NEXT_PUBLIC_CAL_URL ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-white text-black font-semibold px-10 py-4 rounded-xl hover:bg-gray-100 transition text-lg"
          >
            Book a Call
          </a>
        </section>
      </div>

      {/* footer */}
      <footer className="border-t border-gray-900 px-6 py-8 text-center text-gray-600 text-xs">
        <p>OpenClaw Solar · Ontario, Canada</p>
        <p className="mt-1">
          This proposal was generated using Google Solar API data for {prospect.address}.
          Savings projections are estimates based on current utility rates and may vary.
        </p>
      </footer>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-6">
      {children}
    </h2>
  );
}

function SnapCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "yellow" | "green";
}) {
  const accentClass = accent === "yellow" ? "text-yellow-400" : accent === "green" ? "text-green-400" : "text-white";
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`font-semibold text-sm ${accentClass}`}>{value}</p>
    </div>
  );
}

function MetricCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
      <p className="text-3xl font-bold text-white">{value}</p>
      <p className="text-gray-500 text-sm mt-1">{label}</p>
    </div>
  );
}

function SavingsCard({
  label,
  value,
  featured,
  accent,
}: {
  label: string;
  value: string;
  featured?: boolean;
  accent?: "green";
}) {
  return (
    <div
      className={`rounded-xl p-5 ${featured ? "bg-white text-black" : "bg-gray-900 border border-gray-800 text-white"}`}
    >
      <p className={`text-xs font-medium mb-1 ${featured ? "text-gray-500" : "text-gray-500"}`}>
        {label}
      </p>
      <p className={`text-xl font-bold ${accent === "green" ? "text-green-400" : featured ? "text-black" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}
