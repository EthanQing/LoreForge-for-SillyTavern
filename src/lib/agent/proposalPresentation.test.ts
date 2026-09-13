import { describe, expect, it } from "vitest";
import { getAppliedProposalSaveStatus, getProposalSummary } from "./proposalPresentation";

describe("proposal presentation", () => {
  it("provides a readable fallback for an empty summary", () => {
    expect(getProposalSummary("  ")).toBe("未命名修改提案");
  });

  it("describes a proposal saved to its bound file", () => {
    expect(getAppliedProposalSaveStatus({ state: "saved" })).toBe("Agent 提案已应用并写入文件。");
  });

  it("distinguishes a local draft from a file save", () => {
    expect(getAppliedProposalSaveStatus({ state: "draft-only" })).toBe("Agent 提案已应用，已保存为本地草稿，尚未写入文件。");
  });

  it("preserves the file error while confirming the local draft", () => {
    const message = getAppliedProposalSaveStatus({ state: "failed", error: "Access denied" });
    expect(message).toContain("保存为本地草稿");
    expect(message).toContain("写入文件失败");
    expect(message).toContain("Access denied");
  });
});
