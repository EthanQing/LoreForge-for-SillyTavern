import { describe, expect, it } from "vitest";
import { getProposalStateLabel, getProposalSummary, isReviewableProposal } from "./proposalPresentation";

describe("proposal presentation", () => {
  it("keeps only proposals that need review in the active list", () => {
    expect(isReviewableProposal({ state: "pending" })).toBe(true);
    expect(isReviewableProposal({ state: "conflicted" })).toBe(true);
    expect(isReviewableProposal({ state: "applied" })).toBe(false);
    expect(isReviewableProposal({ state: "discarded" })).toBe(false);
  });

  it("uses Chinese labels for proposal states", () => {
    expect(getProposalStateLabel("pending")).toBe("待确认");
    expect(getProposalStateLabel("conflicted")).toBe("存在冲突");
    expect(getProposalStateLabel("applied")).toBe("已应用");
    expect(getProposalStateLabel("discarded")).toBe("已丢弃");
  });

  it("provides a readable fallback for an empty summary", () => {
    expect(getProposalSummary("  ")).toBe("未命名修改提案");
  });
});
