import { describe, expect, it } from "vitest";
import { createBlankCard } from "../schema";
import { applyAgentChanges } from "./changes";
import { permissionForLorebookEntry, permissionForPreset } from "./permissions";
import { stableHash } from "./projection";

describe("agent semantic changes", () => {
  it("injects selected candidates atomically with SillyTavern extensions", () => {
    const card = createBlankCard();
    const candidates = [
      { candidateId: "a", comment: "City", content: "An old city.", keys: ["city"], insertionPosition: 4, role: 2, depth: 6, probability: 80 },
      { candidateId: "b", comment: "Guild", content: "A quiet guild.", keys: ["guild"] }
    ];
    const next = applyAgentChanges(card, [{ kind: "lorebookInjection", candidates }], permissionForPreset("worldbook"), ["a"]);
    const entries = next.data.character_book?.entries ?? [];
    expect(entries).toHaveLength(1);
    expect(entries[0].comment).toBe("City");
    expect(entries[0].name).toBeUndefined();
    expect(entries[0].extensions).toMatchObject({ position: 4, role: 2, depth: 6, probability: 80 });
  });

  it("preserves unknown entry and extension fields on edit", () => {
    const card = createBlankCard();
    card.data.character_book = { extensions: { keepBook: true }, entries: [{
      id: "city", keys: ["city"], content: "Old", extensions: { keep: true }, enabled: true,
      insertion_order: 0, use_regex: false, unknownField: "keep"
    }] };
    const permission = permissionForPreset("worldbook");
    const fingerprint = stableHash(card.data.character_book.entries[0]);
    const next = applyAgentChanges(card, [{ kind: "lorebookEntryEdit", edit: { index: 0, fingerprint, fields: { content: "New" } } }], permission);
    expect(next.data.character_book?.entries[0].extensions.keep).toBe(true);
    expect(next.data.character_book?.entries[0].unknownField).toBe("keep");
  });

  it("does not expose a delete change and rejects empty selection", () => {
    const card = createBlankCard();
    const change = { kind: "lorebookInjection" as const, candidates: [{ candidateId: "a", comment: "City", content: "Lore" }] };
    expect(() => applyAgentChanges(card, [change], permissionForPreset("worldbook"), [])).toThrow("至少选择一个");
  });

  it("rejects a stale entry fingerprint", () => {
    const card = createBlankCard();
    card.data.character_book = { extensions: {}, entries: [{ id: 1, comment: "City", keys: [], secondary_keys: [], content: "Old", extensions: {}, enabled: true, insertion_order: 0, use_regex: false }] };
    const permission = permissionForLorebookEntry(card, 0, ["content"]);
    card.data.character_book.entries[0].content = "User edit";
    expect(() => applyAgentChanges(card, [{ kind: "lorebookEntryEdit", edit: { index: 0, fingerprint: permission.scope.kind === "lorebookEntry" ? permission.scope.fingerprint : "", fields: { content: "Agent edit" } } }], permission)).toThrow("已发生变化");
    expect(card.data.character_book.entries[0].content).toBe("User edit");
  });

  it("rejects an invalid selected batch without mutating the card", () => {
    const card = createBlankCard();
    const before = structuredClone(card);
    const candidates = [
      { candidateId: "good", comment: "City", content: "Lore" },
      { candidateId: "bad", comment: "", content: "Invalid" }
    ];
    expect(() => applyAgentChanges(card, [{ kind: "lorebookInjection", candidates }], permissionForPreset("worldbook"), ["good", "bad"])).toThrow("标题不能为空");
    expect(card).toEqual(before);
  });
});
