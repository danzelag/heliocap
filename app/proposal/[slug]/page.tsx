import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommercialMicrosite } from "./CommercialMicrosite";
import { ResidentialMicrosite } from "./ResidentialMicrosite";
import { prospectJourney } from "@/lib/prospectJourney";
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

  const displayName = prospect.company_name ?? prospect.contact_name ?? prospect.owner_name ?? prospect.address;
  const ogImage = prospect.video_thumbnail_url ?? prospect.ev_video_thumbnail_url ?? prospect.satellite_image_url;

  return {
    title: `Energy Proposal for ${displayName}`,
    description: `A private OpenClaw energy proposal for ${prospect.address}, ${prospect.city}.`,
    robots: { index: false, follow: false },
    openGraph: {
      title: `Energy Proposal for ${displayName}`,
      description: `A private OpenClaw energy proposal for ${prospect.address}, ${prospect.city}.`,
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

  const props = {
    prospect,
    bookingUrl: process.env.NEXT_PUBLIC_CAL_URL?.trim() || null,
    contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || null,
  };

  return prospectJourney(prospect) === "residential" ? (
    <ResidentialMicrosite {...props} />
  ) : (
    <CommercialMicrosite {...props} />
  );
}
