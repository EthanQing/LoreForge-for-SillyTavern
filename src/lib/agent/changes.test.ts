import { describe, expect, it } from "vitest";
import { createBlankCard } from "../schema";
import { applyAgentChanges, buildAgentDiff } from "./changes";
import { permissionForLorebookEntry, permissionForPreset } from "./permissions";
import { stableHash } from "./projection";

describe("agent semantic changes", () => {
  it("preserves complete before and after values when a long field changes only at the end", () => {
    const before = createBlankCard();
    const prefix = "第一行\n".repeat(200);
    before.data.description = `${prefix}原始结尾`;
    const after = structuredClone(before);
    after.data.description = `${prefix}修改后的结尾`;

    expect(buildAgentDiff(before, after)).toEqual([{
      path: "/description",
      label: "description",
      before: before.data.description,
      after: after.data.description
    }]);
  });

  it("builds a field-level diff with complete content for an existing lorebook entry", () => {
    const before = cardWithLorebookEntries(["王都"]);
    const after = structuredClone(before);
    const content = "第一行\n".repeat(200) + "修改后的结尾";
    after.data.character_book!.entries[0].content = content;

    expect(buildAgentDiff(before, after)).toEqual([{
      path: "/worldBook/entries/0/content",
      label: "世界书「王都」· 正文",
      before: "旧内容 1",
      after: content
    }]);
  });

  it("builds exactly the changed lorebook entry field diffs", () => {
    const before = cardWithLorebookEntries(["王都"]);
    before.data.character_book!.entries[0].keys = ["王都", "首都"];
    before.data.character_book!.entries[0].extensions.probability = 100;
    const after = structuredClone(before);
    after.data.character_book!.entries[0].keys.push("帝都");
    after.data.character_book!.entries[0].content = "新正文";
    after.data.character_book!.entries[0].extensions.probability = 80;

    expect(buildAgentDiff(before, after)).toEqual([
      expect.objectContaining({ path: "/worldBook/entries/0/keys", before: '["王都","首都"]', after: '["王都","首都","帝都"]' }),
      expect.objectContaining({ path: "/worldBook/entries/0/content", before: "旧内容 1", after: "新正文" }),
      expect.objectContaining({ path: "/worldBook/entries/0/probability", before: "100", after: "80" })
    ]);
  });

  it("represents missing optional lorebook values as empty strings", () => {
    const before = cardWithLorebookEntries(["王都"]);
    const entry = before.data.character_book!.entries[0];
    entry.extensions.outlet_name = "foo";
    const after = structuredClone(before);
    after.data.character_book!.entries[0].extensions.probability = 80;
    after.data.character_book!.entries[0].extensions.role = 0;
    delete after.data.character_book!.entries[0].extensions.outlet_name;

    const byPath = Object.fromEntries(buildAgentDiff(before, after).map((diff) => [diff.path, diff]));
    expect(byPath["/worldBook/entries/0/probability"]).toMatchObject({ before: "", after: "80" });
    expect(byPath["/worldBook/entries/0/role"]).toMatchObject({ before: "", after: "0" });
    expect(byPath["/worldBook/entries/0/outletName"]).toMatchObject({ before: "foo", after: "" });
    expect(JSON.stringify(Object.values(byPath))).not.toContain("undefined");
  });

  it("keeps paths and labels aligned across multiple existing entries", () => {
    const before = cardWithLorebookEntries(["王都", "港城"]);
    const after = structuredClone(before);
    after.data.character_book!.entries[0].content = "王都新正文";
    after.data.character_book!.entries[1].keys = ["港口"];

    expect(buildAgentDiff(before, after)).toEqual([
      expect.objectContaining({ path: "/worldBook/entries/0/content", label: "世界书「王都」· 正文" }),
      expect.objectContaining({ path: "/worldBook/entries/1/keys", label: "世界书「港城」· 关键词" })
    ]);
  });

  it("keeps a coarse lorebook summary for entry count and unknown-only changes", () => {
    const before = cardWithLorebookEntries(["王都"]);
    const injected = cardWithLorebookEntries(["王都", "港城"]);
    expect(buildAgentDiff(before, injected)).toEqual([{
      path: "/worldBook", label: "World Book", before: "1 个条目", after: "2 个条目"
    }]);

    const unknownOnly = structuredClone(before);
    unknownOnly.data.character_book!.extensions.unrecognized = true;
    expect(buildAgentDiff(before, unknownOnly)).toEqual([{
      path: "/worldBook", label: "World Book", before: "1 个条目", after: "1 个条目"
    }]);
  });

  it("covers every editable projected lorebook field without exposing technical fields", () => {
    const before = cardWithLorebookEntries(["旧标题"]);
    const after = structuredClone(before);
    const entry = after.data.character_book!.entries[0];
    entry.comment = "新标题";
    entry.keys = ["主键"];
    entry.secondary_keys = ["次键"];
    entry.content = "新正文";
    entry.enabled = false;
    entry.use_regex = true;
    entry.selective = true;
    entry.constant = true;
    entry.insertion_order = 9;
    entry.priority = 3;
    entry.case_sensitive = true;
    entry.extensions = { position: 4, role: 2, depth: 6, probability: 80, outlet_name: "出口" };

    const diffs = buildAgentDiff(before, after);
    expect(diffs.map((diff) => diff.path)).toEqual([
      "comment", "keys", "secondaryKeys", "content", "enabled", "useRegex", "selective", "triggerStrategy",
      "insertionPosition", "role", "depth", "insertionOrder", "probability", "priority", "caseSensitive", "outletName"
    ].map((field) => `/worldBook/entries/0/${field}`));
    expect(diffs.every((diff) => diff.label.startsWith("世界书「新标题」· "))).toBe(true);
    expect(diffs.some((diff) => /\/(index|id|fingerprint)$/.test(diff.path))).toBe(false);
  });

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
    expect(buildAgentDiff(card, next)).toEqual([{
      path: "/worldBook",
      label: "World Book",
      before: "0 个条目",
      after: "1 个条目"
    }]);
  });

  it("preserves unknown entry and extension fields on a legacy raw-fingerprint edit", () => {
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

function cardWithLorebookEntries(comments: string[]) {
  const card = createBlankCard();
  card.data.character_book = {
    extensions: {},
    entries: comments.map((comment, index) => ({
      id: index,
      comment,
      keys: [],
      secondary_keys: [],
      content: `旧内容 ${index + 1}`,
      extensions: {},
      enabled: true,
      insertion_order: index,
      use_regex: false,
      selective: false
    }))
  };
  return card;
}
