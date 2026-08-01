import type { CardProposal, ProposalState } from "./contracts";

const REVIEWABLE_STATES: ProposalState[] = ["pending", "conflicted"];

export function isReviewableProposal(proposal: Pick<CardProposal, "state">): boolean {
  return REVIEWABLE_STATES.includes(proposal.state);
}

export function getProposalStateLabel(state: ProposalState): string {
  switch (state) {
    case "pending": return "待确认";
    case "conflicted": return "存在冲突";
    case "applied": return "已应用";
    case "discarded": return "已丢弃";
  }
}

export function getProposalSummary(summary: string): string {
  return summary.trim() || "未命名修改提案";
}
