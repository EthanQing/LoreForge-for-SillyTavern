import { describe, expect, it } from "vitest";
import { createBlankCard } from "../schema";
import { applyCardProposal, createCardProposal, isCardProposal } from "./contracts";
import { permissionForPreset } from "./permissions";

describe("semantic card proposals", () => {
  it("applies a card edit only after confirmation", () => {
    const card = createBlankCard();
    const proposal = createCardProposal({
      workspaceId: "workspace-test",
      sessionId: "session-test",
      toolCallId: "tool-test",
      summary: "命名角色卡",
      permission: permissionForPreset("basic"),
      changes: [{ kind: "cardEdit", edits: [{ path: "/name", value: "Aster" }] }],
      card,
      cardRevision: 0,
      now: 1
    });

    expect(card.data.name).toBe("");
    const result = applyCardProposal(proposal, card, 0);
    expect(result.state).toBe("applied");
    if (result.state === "applied") expect(result.card.data.name).toBe("Aster");
  });

  it("rejects stale revisions even when another field changed", () => {
    const card = createBlankCard();
    const proposal = createCardProposal({
      workspaceId: "workspace-test",
      sessionId: "session-test",
      toolCallId: "tool-test",
      summary: "更新描述",
      permission: permissionForPreset("prompts"),
      changes: [{ kind: "cardEdit", edits: [{ path: "/description", value: "New description" }] }],
      card,
      cardRevision: 2
    });
    const edited = { ...card, data: { ...card.data, personality: "User edit" } };
    expect(applyCardProposal(proposal, edited, 3).state).toBe("conflicted");
  });

  it("rejects edits outside the frontend permission", () => {
    expect(() => createCardProposal({
      workspaceId: "workspace-test",
      sessionId: "session-test",
      toolCallId: "tool-test",
      summary: "越权修改",
      permission: permissionForPreset("basic"),
      changes: [{ kind: "cardEdit", edits: [{ path: "/systemPrompt", value: "no" }] }],
      card: createBlankCard(),
      cardRevision: 0
    })).toThrow("超出当前权限范围");
  });

  it("requires an explicit candidate selection", () => {
    const card = createBlankCard();
    const proposal = createCardProposal({
      workspaceId: "workspace-test",
      sessionId: "session-test",
      toolCallId: "tool-test",
      summary: "候选",
      permission: permissionForPreset("worldbook"),
      changes: [{ kind: "lorebookInjection", candidates: [{ candidateId: "one", comment: "City", content: "Lore" }] }],
      card,
      cardRevision: 0
    });
    expect(proposal.selectedCandidateIds).toEqual([]);
    expect(applyCardProposal(proposal, card, 0).state).toBe("blocked");
    const selected = applyCardProposal(proposal, card, 0, ["one"]);
    expect(selected.state).toBe("applied");
  });

  it("rejects persisted proposals with expanded capabilities", () => {
    const card = createBlankCard();
    const proposal = createCardProposal({
      workspaceId: "workspace-test",
      sessionId: "session-test",
      toolCallId: "tool-test",
      summary: "字段提案",
      permission: permissionForPreset("basic"),
      changes: [{ kind: "cardEdit", edits: [{ path: "/name", value: "Aster" }] }],
      card,
      cardRevision: 0
    });
    expect(isCardProposal({ ...proposal, permission: { ...proposal.permission, capabilities: ["read", "edit", "inject"] } })).toBe(false);
  });
});
