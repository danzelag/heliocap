"use client";

import Link from "next/link";
import { useState } from "react";
import { buildProposalPath, isProposal } from "@/lib/proposals";
import type { Prospect } from "@/lib/types";

type MailerCheckResult = {
  checked: number;
  ready: number;
  missingEmail: number;
  blocked: number;
};

type ProposalCreationResult = {
  count: number;
  blocked?: number;
  proposals: Prospect[];
};

export function ProspectRoster({ prospects }: { prospects: Prospect[] }) {
  const [rows, setRows] = useState(prospects);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [running, setRunning] = useState<"mailer" | "proposal" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  function toggleAll() {
    setSelectedIds(allSelected ? [] : rows.map((row) => row.id));
  }

  function toggleOne(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  async function runMailerCheck() {
    if (!selectedIds.length) {
      setError("Select at least one prospect first.");
      return;
    }

    setRunning("mailer");
    setError("");
    setMessage("");

    const res = await fetch("/api/prospects/mailer-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds }),
    });

    const data = (await res.json()) as MailerCheckResult & { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Mailer check failed.");
      setRunning(null);
      return;
    }

    setMessage(
      `Mailer check ran on ${data.checked} prospect${data.checked === 1 ? "" : "s"}: ${data.ready} ready, ${data.missingEmail} missing email, ${data.blocked} blocked.`
    );
    setRunning(null);
  }

  async function createProposals(ids = selectedIds) {
    if (!ids.length) {
      setError("Select at least one prospect first.");
      return;
    }

    setRunning("proposal");
    setError("");
    setMessage("");

    const res = await fetch("/api/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });

    const data = (await res.json()) as ProposalCreationResult & { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Proposal creation failed.");
      setRunning(null);
      return;
    }

    const byId = new Map(data.proposals.map((proposal) => [proposal.id, proposal]));
    setRows((current) => current.map((row) => byId.get(row.id) ?? row));
    setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
    setMessage(
      `Published ${data.count} proposal page${data.count === 1 ? "" : "s"}${data.blocked ? `, skipped ${data.blocked} blocked record${data.blocked === 1 ? "" : "s"}` : ""}.`
    );
    setRunning(null);
  }

  return (
    <section className="border border-white/[0.07] bg-[#1a1a1f]">
      <div className="flex flex-col gap-4 border-b border-white/[0.07] px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-[#ece9e3]">Prospect CRM</div>
          <div className="mt-2 text-sm text-stone-400">
            Select prospects, run outreach readiness, and publish proposal pages.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleAll}
            className="border border-white/12 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-stone-300 transition hover:bg-[#212128]"
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
          <button
            type="button"
            onClick={runMailerCheck}
            disabled={running !== null}
            className="border border-white/12 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-stone-300 transition hover:bg-[#212128] disabled:cursor-wait disabled:opacity-40"
          >
            {running === "mailer" ? "Checking..." : "Mailer check"}
          </button>
          <button
            type="button"
            onClick={() => createProposals()}
            disabled={running !== null}
            className="border border-[#c08a4b]/55 bg-[#c08a4b]/10 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-[#d8a866] transition hover:bg-[#c08a4b]/18 disabled:cursor-wait disabled:opacity-40"
          >
            {running === "proposal" ? "Publishing..." : "Make proposals"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-b border-white/[0.07] px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-stone-500">
        <span>{selectedIds.length} selected</span>
        <span>{rows.length} total prospects</span>
        <span>Video generation next pass</span>
      </div>

      {message ? <p className="mx-5 mt-4 border border-[#86a06f]/35 bg-[#86a06f]/10 px-4 py-3 text-sm text-[#a4ba8d]">{message}</p> : null}
      {error ? <p className="mx-5 mt-4 border border-[#c8704a]/35 bg-[#c8704a]/10 px-4 py-3 text-sm text-[#c8704a]">{error}</p> : null}

      <div className="overflow-x-auto px-5 pb-5 pt-4">
        <table className="min-w-full border border-white/[0.07] text-left">
          <thead className="bg-[#131316] text-[10px] uppercase tracking-[0.18em] text-stone-500">
            <tr>
              <th className="w-12 border-b border-white/[0.07] px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 border-white/15 bg-[#1a1a1f] accent-[#c08a4b]"
                />
              </th>
              <th className="border-b border-white/[0.07] px-4 py-3">Property</th>
              <th className="border-b border-white/[0.07] px-4 py-3">Owner</th>
              <th className="border-b border-white/[0.07] px-4 py-3">Stage</th>
              <th className="border-b border-white/[0.07] px-4 py-3">Contact</th>
              <th className="border-b border-white/[0.07] px-4 py-3">Proposal</th>
              <th className="border-b border-white/[0.07] px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((prospect) => {
              const published = isProposal(prospect);
              const canPublish = !["dead", "skipped"].includes(prospect.stage);
              return (
                <tr key={prospect.id} className="border-b border-white/[0.07] align-top last:border-b-0">
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(prospect.id)}
                      onChange={() => toggleOne(prospect.id)}
                      className="mt-1 h-4 w-4 border-white/15 bg-[#1a1a1f] accent-[#c08a4b]"
                    />
                  </td>
                  <td className="px-4 py-4">
                    <div className="min-w-[220px]">
                      <div className="text-sm font-semibold text-[#ece9e3]">{prospect.company_name}</div>
                      <div className="mt-1 text-sm text-stone-400">{prospect.address}</div>
                      <div className="mt-1 text-[12px] text-stone-600">{prospect.city}</div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="min-w-[180px]">
                      <div className="text-sm text-[#ece9e3]">{prospect.owner_name ?? "Owner pending"}</div>
                      <div className="mt-1 text-[12px] text-stone-500">{prospect.owner_title ?? "Title pending"}</div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="inline-flex border border-white/12 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-stone-300">
                      {formatStage(prospect.stage)}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="min-w-[200px]">
                      <div className="font-mono text-xs text-stone-300">{prospect.owner_email ?? "No email"}</div>
                      <div className="mt-1 font-mono text-xs text-stone-500">{prospect.owner_mobile ?? "No mobile"}</div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {published ? (
                      <div className="space-y-2">
                        <div className="text-sm text-[#d8a866]">Published</div>
                        <Link
                          href={buildProposalPath(prospect.slug)}
                          className="inline-flex border border-[#c08a4b]/45 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[#d8a866] transition hover:bg-[#c08a4b]/10"
                        >
                          View page
                        </Link>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-sm text-stone-500">{canPublish ? "Not published" : "Blocked"}</div>
                        {canPublish ? (
                          <button
                            type="button"
                            onClick={() => createProposals([prospect.id])}
                            disabled={running !== null}
                            className="inline-flex border border-white/12 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-stone-300 transition hover:bg-[#212128] disabled:cursor-wait disabled:opacity-40"
                          >
                            Make page
                          </button>
                        ) : (
                          <span className="inline-flex border border-white/12 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-stone-500">
                            Needs review
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex min-w-[170px] flex-wrap gap-2">
                      <Link
                        href={`/admin/prospects/${prospect.id}`}
                        className="inline-flex border border-white/12 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-stone-300 transition hover:bg-[#212128]"
                      >
                        View info
                      </Link>
                      {published ? (
                        <Link
                          href={buildProposalPath(prospect.slug)}
                          className="inline-flex border border-[#c08a4b]/45 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[#d8a866] transition hover:bg-[#c08a4b]/10"
                        >
                          Open proposal
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatStage(stage: Prospect["stage"]) {
  return stage.replace(/_/g, " ");
}
