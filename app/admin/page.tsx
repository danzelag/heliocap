import { listProposals } from "@/lib/supabase";
import { AdminConsole } from "./AdminConsole";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const prospects = await listProposals(100);

  return <AdminConsole prospects={prospects} />;
}
