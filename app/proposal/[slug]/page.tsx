import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProposalExperience } from "./ProposalExperience";
import { getProspectBySlug } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const prospect = await getProspectBySlug(slug);

  if (!prospect) return {};

  const ogImage = prospect.video_thumbnail_url ?? prospect.satellite_image_url;

  return {
    title: `Solar Proposal for ${prospect.company_name}`,
    description: `A private OpenClaw solar proposal for ${prospect.address}, ${prospect.city}.`,
    robots: { index: false, follow: false },
    openGraph: {
      title: `Solar Proposal for ${prospect.company_name}`,
      description: `A private OpenClaw solar proposal for ${prospect.address}, ${prospect.city}.`,
      images: ogImage ? [ogImage] : [],
    },
  };
}

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

  return (
    <ProposalExperience
      prospect={prospect}
      bookingUrl={process.env.NEXT_PUBLIC_CAL_URL?.trim() || null}
      contactEmail={process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || null}
    />
  );
}
