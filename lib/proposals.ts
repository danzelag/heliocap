import type { Prospect, ProspectStage } from "./types";

const PROPOSAL_LIVE_STAGE: ProspectStage = "microsite_live";

const STAGE_ORDER: ProspectStage[] = [
  "sourced",
  "geocoded",
  "qualified",
  "skipped",
  "satellite_done",
  "solar_done",
  "video_done",
  PROPOSAL_LIVE_STAGE,
  "emailed",
  "followed_up",
  "replied",
  "booked",
  "dead",
];

export function buildProposalPath(slug: string) {
  return `/proposal/${slug}`;
}

export function buildProposalUrl(slug: string) {
  const path = buildProposalPath(slug);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return baseUrl ? `${baseUrl}${path}` : path;
}

export function isProposal(prospect: Prospect) {
  return Boolean(prospect.microsite_url) || stageRank(prospect.stage) >= stageRank(PROPOSAL_LIVE_STAGE);
}

export function getProposalStage(prospect: Prospect): ProspectStage {
  return stageRank(prospect.stage) < stageRank(PROPOSAL_LIVE_STAGE) ? PROPOSAL_LIVE_STAGE : prospect.stage;
}

function stageRank(stage: ProspectStage) {
  return STAGE_ORDER.indexOf(stage);
}
