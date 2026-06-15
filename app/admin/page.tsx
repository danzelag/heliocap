import { listProposals } from "@/lib/supabase";
import { AdminConsole } from "./AdminConsole";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [residentialProspects, commercialProspects] = await Promise.all([
    listProposals(100, "residential"),
    listProposals(100, "commercial"),
  ]);

  return <AdminConsole residentialProspects={residentialProspects} commercialProspects={commercialProspects} />;
}
