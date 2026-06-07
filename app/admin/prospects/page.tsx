import Link from "next/link";
import { listActiveProspects } from "@/lib/supabase";
import { ProspectRoster } from "./ProspectRoster";

export const dynamic = "force-dynamic";

export default async function ProspectRosterPage() {
  const prospects = await listActiveProspects(250);

  return (
    <div className="min-h-screen bg-[#131316] text-[#ece9e3] selection:bg-[#c08a4b]/30">
      <div className="mx-auto max-w-[1660px] px-5 pb-20 pt-6 sm:px-8">
        <header className="flex flex-col gap-5 border-b border-white/[0.07] pb-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <ClawMark />
            <div>
              <div className="text-lg font-semibold tracking-[0.34em]">
                OPEN<span className="text-[#c08a4b]">CLAW</span>
              </div>
              <div className="mt-1 text-[10.5px] uppercase tracking-[0.28em] text-stone-500">Prospect roster · CRM workspace</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/admin"
              className="border border-white/12 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-stone-400 transition hover:border-[#c08a4b]/50 hover:text-[#d8a866]"
            >
              Proposal console
            </Link>
            <Link
              href="/admin/prospects/new"
              className="border border-[#c08a4b]/50 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[#d8a866] transition hover:bg-[#c08a4b]/10"
            >
              Add prospect
            </Link>
          </div>
        </header>

        <main className="pt-8">
          <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="border border-white/[0.07] bg-[#1a1a1f] px-5 py-5">
              <div className="text-[10.5px] uppercase tracking-[0.26em] text-stone-500">Workspace</div>
              <div className="mt-3 max-w-3xl text-sm leading-6 text-stone-400">
                This is the operational roster for raw leads and in-flight prospects. Use it to vet contactability,
                open individual records, and publish selected entries into the final proposal console.
              </div>
            </div>
            <div className="grid grid-cols-2 border border-white/[0.07] bg-white/[0.07]">
              <Readout label="Active prospects" value={String(prospects.length)} />
              <Readout label="Proposal flow" value="/proposal/[slug]" />
            </div>
          </div>

          <ProspectRoster prospects={prospects} />
        </main>
      </div>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#1a1a1f] p-4">
      <div className="text-[9px] uppercase tracking-[0.16em] text-stone-500">{label}</div>
      <div className="mt-1 font-mono text-xs text-[#ece9e3]">{value}</div>
    </div>
  );
}

function ClawMark() {
  return (
    <svg className="h-[30px] w-[30px] shrink-0" viewBox="0 0 30 30" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="28" height="28" stroke="#c08a4b" strokeWidth="1" opacity="0.5" />
      <path d="M15 5L15 25M8 9L8 21M22 9L22 21" stroke="#c08a4b" strokeWidth="1.4" strokeLinecap="square" />
      <circle cx="15" cy="15" r="3.4" fill="#c08a4b" />
    </svg>
  );
}
