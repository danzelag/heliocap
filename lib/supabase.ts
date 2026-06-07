import { createClient } from "@supabase/supabase-js";
import type { Prospect } from "./types";

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
  limit = 50
): Promise<Prospect[]> {
  let q = supabaseAdmin()
    .from("prospects")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (stage) q = q.eq("stage", stage);
  const { data } = await q;
  return data ?? [];
}

export async function listActiveProspects(limit = 200): Promise<Prospect[]> {
  const { data } = await supabaseAdmin()
    .from("prospects")
    .select("*")
    .neq("stage", "dead")
    .order("created_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}

export async function listProposals(limit = 100): Promise<Prospect[]> {
  const { data } = await supabaseAdmin()
    .from("prospects")
    .select("*")
    .not("microsite_url", "is", null)
    .neq("stage", "dead")
    .order("created_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}
