import type { ProposalType, Prospect } from "./types";

export function prospectJourney(prospect: Prospect): ProposalType {
  if (prospect.proposal_type === "residential" || prospect.proposal_type === "commercial") {
    return prospect.proposal_type;
  }

  const marker = `${prospect.industry ?? ""} ${prospect.owner_title ?? ""}`.toLowerCase();
  return marker.includes("residential") ? "residential" : "commercial";
}

export function isResidentialProspect(prospect: Prospect) {
  return prospectJourney(prospect) === "residential";
}

export function displayProspectName(prospect: Prospect) {
  return prospect.company_name ?? prospect.contact_name ?? prospect.owner_name ?? prospect.address;
}
