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

type DeleteProspectsResult = {
  deletedIds: string[];
};

type RosterType = "residential" | "commercial";

export function ProspectRoster({
  residentialProspects,
  commercialProspects,
  initialRosterType = "commercial",
}: {
  residentialProspects: Prospect[];
  commercialProspects: Prospect[];
  initialRosterType?: RosterType;
}) {
  const [rosterType, setRosterType] = useState<RosterType>(initialRosterType);
  const [rows, setRows] = useState(() =>
    initialRosterType === "commercial" ? commercialProspects : residentialProspects
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [running, setRunning] = useState<"mailer" | "proposal" | "delete" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  function toggleAll() {
    setSelectedIds(allSelected ? [] : rows.map((row) => row.id));
  }

  function toggleOne(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  function switchRoster(nextType: RosterType) {
    setRosterType(nextType);
    setRows(nextType === "commercial" ? commercialProspects : residentialProspects);
    setSelectedIds([]);
    setMessage("");
    setError("");
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

  async function deleteSelected() {
    if (!selectedIds.length) {
      setError("Select at least one prospect first.");
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selectedIds.length} selected prospect${selectedIds.length === 1 ? "" : "s"}? This cannot be undone.`
    );
    if (!confirmed) return;

    const ids = selectedIds;
    setRunning("delete");
    setError("");
    setMessage("");

    const res = await fetch("/api/prospects", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });

    const data = (await res.json()) as DeleteProspectsResult & { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Delete failed.");
      setRunning(null);
      return;
    }

    const deleted = new Set(data.deletedIds);
    setRows((current) => current.filter((row) => !deleted.has(row.id)));
    setSelectedIds((current) => current.filter((id) => !deleted.has(id)));
    setMessage(`Deleted ${deleted.size} prospect${deleted.size === 1 ? "" : "s"}.`);
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
      <div className="grid gap-1 border-b border-white/[0.07] bg-[#131316] p-1 sm:grid-cols-2">
        <RosterTab
          active={rosterType === "commercial"}
          label="Commercial Proposals"
          count={commercialProspects.length}
          onClick={() => switchRoster("commercial")}
        />
        <RosterTab
          active={rosterType === "residential"}
          label="Residential Proposals"
          count={residentialProspects.length}
          onClick={() => switchRoster("residential")}
        />
      </div>
      <div className="flex flex-col gap-4 border-b border-white/[0.07] px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-[#ece9e3]">
            {rosterType === "commercial" ? "Commercial CRM" : "Residential CRM"}
          </div>
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
          <button
            type="button"
            onClick={deleteSelected}
            disabled={running !== null || !selectedIds.length}
            className="border border-[#c8704a]/45 bg-[#c8704a]/10 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-[#d99a82] transition hover:bg-[#c8704a]/18 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running === "delete" ? "Deleting..." : "Delete selected"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-b border-white/[0.07] px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-stone-500">
        <span>{selectedIds.length} selected</span>
        <span>{rows.length} total prospects</span>
        <span>{rosterType === "commercial" ? "Outbound journey" : "Inbound journey"}</span>
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
              <th className="border-b border-white/[0.07] px-4 py-3">Submitted</th>
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
                      <div className="text-sm font-semibold text-[#ece9e3]">{displayName(prospect)}</div>
                      <div className="mt-1 text-sm text-stone-400">{prospect.address}</div>
                      <div className="mt-1 text-[12px] text-stone-600">{prospect.city}</div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="min-w-[180px]">
                      <div className="text-sm text-[#ece9e3]">{prospect.owner_name ?? "Owner pending"}</div>
                      {prospect.owner_title ? (
                        <div className="mt-1 text-[12px] text-stone-500">{prospect.owner_title}</div>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="min-w-[160px] font-mono text-[11px] leading-5 text-stone-400">
                      {formatDateTime(prospect.created_at)}
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
                        Proposal editor
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

function RosterTab({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-3 text-left text-[11px] uppercase tracking-[0.14em] transition ${
        active ? "bg-[#c08a4b] text-[#131316]" : "text-stone-400 hover:text-[#d8a866]"
      }`}
    >
      {label} <span className="font-mono">{count}</span>
    </button>
  );
}

function displayName(prospect: Prospect) {
  return prospect.company_name ?? prospect.contact_name ?? prospect.owner_name ?? prospect.address;
}

function formatStage(stage: Prospect["stage"]) {
  return stage.replace(/_/g, " ");
}

function formatDateTime(value: string) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}
