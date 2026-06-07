import { listProspects } from "@/lib/supabase";
import { AdminConsole } from "./AdminConsole";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const prospects = await listProspects(undefined, 100);

  return <AdminConsole prospects={prospects} />;
}
