import { notFound, redirect } from "next/navigation";
import { getProspectBySlug } from "@/lib/supabase";
import { buildProposalPath } from "@/lib/proposals";

export const dynamic = "force-dynamic";

export default async function LegacyMicrositeRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const prospect = await getProspectBySlug(slug);

  if (!prospect || prospect.stage === "dead" || prospect.stage === "sourced") {
    notFound();
  }

  redirect(buildProposalPath(slug));
}
