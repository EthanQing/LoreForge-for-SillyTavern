import { describe, expect, it } from "vitest";
import { getProposalSummary } from "./proposalPresentation";

describe("proposal presentation", () => {
  it("provides a readable fallback for an empty summary", () => {
    expect(getProposalSummary("  ")).toBe("未命名修改提案");
  });
});
