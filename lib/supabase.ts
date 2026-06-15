import { createClient } from "@supabase/supabase-js";
import { prospectJourney } from "./prospectJourney";
import type { ProposalType, Prospect } from "./types";

export const supabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

export const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

export type Database = {
  public: {
    Tables: {
      prospects: {
        Row: Prospect;
        Insert: Partial<Prospect>;
        Update: Partial<Prospect>;
      };
    };
  };
};

export async function getProspect(id: string): Promise<Prospect | null> {
  const { data } = await supabaseAdmin()
    .from("prospects")
    .select("*")
    .eq("id", id)
    .single();
  return data;
}

export async function getProspectBySlug(slug: string): Promise<Prospect | null> {
  const { data } = await supabaseAdmin()
    .from("prospects")
    .select("*")
    .eq("slug", slug)
    .single();
  return data;
}

export async function getProspectsByIds(ids: string[]): Promise<Prospect[]> {
  if (!ids.length) return [];

  const { data } = await supabaseAdmin()
    .from("prospects")
    .select("*")
    .in("id", ids);

  return data ?? [];
}

export async function updateProspect(
  id: string,
  updates: Partial<Prospect>
): Promise<Prospect | null> {
  const { data } = await supabaseAdmin()
    .from("prospects")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  return data;
}

export async function listProspects(
  stage?: string,
  limit = 50,
  proposalType?: ProposalType
): Promise<Prospect[]> {
  let q = supabaseAdmin()
    .from("prospects")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (stage) q = q.eq("stage", stage);
  if (proposalType) q = q.eq("proposal_type", proposalType);
  const { data, error } = await q;
  if (error && proposalType && isMissingProposalTypeColumn(error)) {
    let fallback = supabaseAdmin()
      .from("prospects")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (stage) fallback = fallback.eq("stage", stage);
    const { data: fallbackData } = await fallback;
    return (fallbackData ?? []).filter((prospect) => prospectJourney(prospect) === proposalType);
  }
  return data ?? [];
}

export async function listActiveProspects(
  limit = 200,
  proposalType?: ProposalType
): Promise<Prospect[]> {
  let q = supabaseAdmin()
    .from("prospects")
    .select("*")
    .neq("stage", "dead")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (proposalType) q = q.eq("proposal_type", proposalType);

  const { data, error } = await q;
  if (error && proposalType && isMissingProposalTypeColumn(error)) {
    const { data: fallbackData } = await supabaseAdmin()
      .from("prospects")
      .select("*")
      .neq("stage", "dead")
      .order("created_at", { ascending: false })
      .limit(limit);
    return (fallbackData ?? []).filter((prospect) => prospectJourney(prospect) === proposalType);
  }
  return data ?? [];
}

export async function listProposals(
  limit = 100,
  proposalType?: ProposalType
): Promise<Prospect[]> {
  let q = supabaseAdmin()
    .from("prospects")
    .select("*")
    .not("microsite_url", "is", null)
    .neq("stage", "dead")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (proposalType) q = q.eq("proposal_type", proposalType);

  const { data, error } = await q;
  if (error && proposalType && isMissingProposalTypeColumn(error)) {
    const { data: fallbackData } = await supabaseAdmin()
      .from("prospects")
      .select("*")
      .not("microsite_url", "is", null)
      .neq("stage", "dead")
      .order("created_at", { ascending: false })
      .limit(limit);
    return (fallbackData ?? []).filter((prospect) => prospectJourney(prospect) === proposalType);
  }
  return data ?? [];
}

function isMissingProposalTypeColumn(error: { code?: string; message?: string }) {
  return error.code === "42703" || error.message?.includes("proposal_type") || false;
}
