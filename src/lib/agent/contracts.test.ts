import { describe, expect, it } from "vitest";
import { createBlankCard } from "../schema";
import { applyCardProposal, assertAllowedPatches, createCardProposal } from "./contracts";

describe("card proposals", () => {
  it("applies a proposal when guarded fields are unchanged", () => {
    const card = createBlankCard();
    const proposal = createCardProposal({
      workspaceId: "workspace-test",
      sessionId: "session-test",
      toolCallId: "tool-test",
      summary: "Name the card",
      patches: [{ op: "replace", path: "/name", value: "Aster" }],
      allowedPaths: ["/name"],
      card,
      cardRevision: 0,
      now: 1
    });

    const result = applyCardProposal(proposal, card);
    expect(result.state).toBe("applied");
    if (result.state === "applied") {
      expect(result.card.data.name).toBe("Aster");
    }
  });

  it("merges unrelated user edits", () => {
    const card = createBlankCard();
    const proposal = createCardProposal({
      workspaceId: "workspace-test",
      sessionId: "session-test",
      toolCallId: "tool-test",
      summary: "Update description",
      patches: [{ op: "replace", path: "/description", value: "New description" }],
      allowedPaths: ["/description"],
      card,
      cardRevision: 0
    });
    const edited = { ...card, data: { ...card.data, personality: "User edit" } };
    const result = applyCardProposal(proposal, edited);
    expect(result.state).toBe("applied");
    if (result.state === "applied") {
      expect(result.card.data.description).toBe("New description");
      expect(result.card.data.personality).toBe("User edit");
    }
  });

  it("blocks a proposal when the affected field changed", () => {
    const card = createBlankCard();
    const proposal = createCardProposal({
      workspaceId: "workspace-test",
      sessionId: "session-test",
      toolCallId: "tool-test",
      summary: "Update name",
      patches: [{ op: "replace", path: "/name", value: "Agent name" }],
      allowedPaths: ["/name"],
      card,
      cardRevision: 0
    });
    const edited = { ...card, data: { ...card.data, name: "User name" } };
    const result = applyCardProposal(proposal, edited);
    expect(result.state).toBe("conflicted");
    if (result.state === "conflicted") {
      expect(result.reasons[0]).toContain("/name");
    }
  });

  it("rejects patches outside the approved normalized scope", () => {
    expect(() => assertAllowedPatches([{ op: "replace", path: "/systemPrompt", value: "no" }], ["/description"])).toThrow("outside the approved scope");
  });
});
