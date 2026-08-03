import { describe, expect, it } from "vitest";
import { createBlankCard } from "../schema";
import { applyCardProposal, createCardProposal, isCardProposal } from "./contracts";
import { permissionForPreset } from "./permissions";
import { stableHash } from "./projection";

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

  it("applies independent lorebook entry proposals after another proposal changes the card revision", () => {
    const card = createBlankCard();
    card.data.character_book = {
      extensions: {},
      entries: ["东京", "大阪"].map((comment, index) => ({ id: index, comment, keys: [], secondary_keys: [], content: "旧内容", extensions: {}, enabled: true, insertion_order: index, use_regex: false }))
    };
    const entries = card.data.character_book.entries;
    const first = createCardProposal({
      workspaceId: "workspace-test", sessionId: "session-test", toolCallId: "tool-first", summary: "修改东京", permission: permissionForPreset("worldbook"),
      changes: [{ kind: "lorebookEntryEdit", edit: { index: 0, fingerprint: stableHash(entries[0]), fields: { content: "东京新内容" } } }], card, cardRevision: 0
    });
    const second = createCardProposal({
      workspaceId: "workspace-test", sessionId: "session-test", toolCallId: "tool-second", summary: "修改大阪", permission: permissionForPreset("worldbook"),
      changes: [{ kind: "lorebookEntryEdit", edit: { index: 1, fingerprint: stableHash(entries[1]), fields: { content: "大阪新内容" } } }], card, cardRevision: 0
    });

    const firstResult = applyCardProposal(first, card, 0);
    expect(firstResult.state).toBe("applied");
    if (firstResult.state !== "applied") return;

    const secondResult = applyCardProposal(second, firstResult.card, 1);
    expect(secondResult.state).toBe("applied");
    if (secondResult.state !== "applied") return;
    expect(secondResult.card.data.character_book?.entries.map((entry) => entry.content)).toEqual(["东京新内容", "大阪新内容"]);
  });

  it("rejects a stale lorebook entry proposal when its target changed", () => {
    const card = createBlankCard();
    card.data.character_book = {
      extensions: {},
      entries: [{ id: 0, comment: "东京", keys: [], secondary_keys: [], content: "旧内容", extensions: {}, enabled: true, insertion_order: 0, use_regex: false }]
    };
    const entry = card.data.character_book.entries[0];
    const proposal = createCardProposal({
      workspaceId: "workspace-test", sessionId: "session-test", toolCallId: "tool-test", summary: "修改东京", permission: permissionForPreset("worldbook"),
      changes: [{ kind: "lorebookEntryEdit", edit: { index: 0, fingerprint: stableHash(entry), fields: { content: "提案内容" } } }], card, cardRevision: 0
    });
    const changed = { ...card, data: { ...card.data, character_book: { ...card.data.character_book, entries: [{ ...entry, content: "用户修改" }] } } };

    expect(applyCardProposal(proposal, changed, 1).state).toBe("conflicted");
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
