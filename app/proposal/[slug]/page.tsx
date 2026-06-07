import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProspectBySlug } from "@/lib/supabase";
import { CountdownTimer } from "../CountdownTimer";

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

const DEADLINE = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

export default async function ProposalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const prospect = await getProspectBySlug(slug);

  if (!prospect || prospect.stage === "dead" || prospect.stage === "sourced") {
    notFound();
  }

  const roofAge = prospect.year_built ? new Date().getFullYear() - prospect.year_built : null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <section className="relative aspect-video max-h-[80vh] overflow-hidden">
        {prospect.video_url ? (
          <video
            src={prospect.video_url}
            poster={prospect.video_thumbnail_url ?? prospect.satellite_image_url ?? undefined}
            autoPlay
            muted
            loop
            playsInline
            className="h-full w-full object-cover"
          />
        ) : prospect.satellite_image_url ? (
          <div className="relative h-full w-full">
            <Image
              src={prospect.satellite_image_url}
              alt={`${prospect.address} satellite`}
              fill
              unoptimized
              sizes="100vw"
              className="object-cover"
            />
            {prospect.panel_svg_url ? (
              <Image
                src={prospect.panel_svg_url}
                alt="Solar panel layout"
                fill
                unoptimized
                sizes="100vw"
                className="object-cover"
              />
            ) : null}
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gray-900">
            <span className="text-gray-600">Satellite imagery loading...</span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 p-8 md:p-12">
          <p className="mb-2 text-sm uppercase tracking-widest text-gray-400">Solar Proposal</p>
          <h1 className="text-3xl font-bold leading-tight md:text-5xl">{prospect.company_name}</h1>
          <p className="mt-2 text-gray-400">
            {prospect.address}, {prospect.city}, Ontario
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl space-y-16 px-6 py-16">
        {prospect.owner_name ? (
          <div className="text-center">
            <p className="text-xl text-gray-300">Hey {prospect.owner_name.split(" ")[0]}, we ran the numbers on your building.</p>
          </div>
        ) : null}

        <section>
          <SectionLabel>Building Snapshot</SectionLabel>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <SnapCard label="Address" value={prospect.address} />
            <SnapCard label="Size" value={prospect.sqft ? `${prospect.sqft.toLocaleString()} ft²` : "—"} />
            <SnapCard label="Year Built" value={prospect.year_built?.toString() ?? "—"} />
            <SnapCard
              label="Roof Age"
              value={roofAge ? `${roofAge} years` : "—"}
              accent={roofAge && roofAge >= 20 ? "yellow" : undefined}
            />
          </div>
          {roofAge && roofAge >= 20 ? (
            <p className="mt-4 text-sm text-yellow-400">
              Your roof is at the 20-year replacement window, which is usually the cleanest moment to pair reroofing
              with a solar installation and capture incentives.
            </p>
          ) : null}
        </section>

        {prospect.panel_count ? (
          <section>
            <SectionLabel>Your Solar System</SectionLabel>
            <div className="grid grid-cols-3 gap-4">
              <MetricCard value={prospect.panel_count.toString()} label="Panels" />
              <MetricCard value={`${prospect.system_kw} kW`} label="System Size" />
              <MetricCard value={`${Math.round((prospect.yearly_kwh ?? 0) / 1000)} MWh`} label="Annual Output" />
            </div>
            <p className="mt-4 text-sm text-gray-500">
              Deployed on the top-performing roof area after setbacks, service clearances, and practical installer
              spacing.
            </p>
          </section>
        ) : null}

        {prospect.savings_25yr ? (
          <section>
            <SectionLabel>Savings Summary</SectionLabel>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <SavingsCard label="Year 1" value={`$${Math.round(prospect.yearly_savings ?? 0).toLocaleString()}`} />
              <SavingsCard
                label="Year 10"
                value={`$${Math.round((prospect.yearly_savings ?? 0) * 10 * 1.3).toLocaleString()}`}
              />
              <SavingsCard label="25 Years" value={`$${Math.round(prospect.savings_25yr).toLocaleString()}`} featured />
              <SavingsCard
                label="Available Credits"
                value={`$${Math.round(prospect.incentive_amount ?? 0).toLocaleString()}`}
                accent="green"
              />
            </div>
            <p className="mt-4 text-sm text-gray-500">
              Based on Ontario commercial electricity assumptions and current incentive data. Final pricing and savings
              get refined in the installer handoff.
            </p>
          </section>
        ) : null}

        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-8">
          <SectionLabel>Incentive Deadline</SectionLabel>
          <CountdownTimer deadline={DEADLINE} />
          <p className="mt-4 text-sm text-gray-400">
            This is a demo proposal page for the publishing flow. We can swap in the Claude-designed microsite later
            without changing the route structure.
          </p>
        </section>

        <section className="py-8 text-center">
          <h2 className="mb-4 text-3xl font-bold">Ready to move forward?</h2>
          <p className="mx-auto mb-8 max-w-md text-gray-400">
            Book a quick call and we&apos;ll walk through the roof assumptions, savings model, and next-step rollout.
          </p>
          <a
            href={process.env.NEXT_PUBLIC_CAL_URL ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-xl bg-white px-10 py-4 text-lg font-semibold text-black transition hover:bg-gray-100"
          >
            Book a Call
          </a>
        </section>
      </div>

      <footer className="border-t border-gray-900 px-6 py-8 text-center text-xs text-gray-600">
        <p>OpenClaw Solar · Ontario, Canada</p>
        <p className="mt-1">
          This proposal page was generated from the OpenClaw pipeline for {prospect.address}. Savings are directional
          until final installer review.
        </p>
      </footer>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-6 text-xs font-semibold uppercase tracking-widest text-gray-500">{children}</h2>;
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
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <p className="mb-1 text-xs text-gray-500">{label}</p>
      <p className={`text-sm font-semibold ${accentClass}`}>{value}</p>
    </div>
  );
}

function MetricCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center">
      <p className="text-3xl font-bold text-white">{value}</p>
      <p className="mt-1 text-sm text-gray-500">{label}</p>
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
    <div className={`rounded-xl p-5 ${featured ? "bg-white text-black" : "border border-gray-800 bg-gray-900 text-white"}`}>
      <p className="mb-1 text-xs font-medium text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${accent === "green" ? "text-green-400" : featured ? "text-black" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}
