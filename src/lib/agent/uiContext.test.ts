import { describe, expect, it } from "vitest";
import { createBlankCard } from "../schema";
import { buildFieldActionInstruction, resolveFieldActionPermission } from "./uiContext";

describe("Agent Studio field dispatch", () => {
  it("dispatches ordinary fields with an exact field scope", () => {
    const target = { path: "/description" as const, label: "描述", value: "Old" };
    const permission = resolveFieldActionPermission(createBlankCard(), target);
    expect(permission.scope).toEqual({ kind: "field", path: "/description", label: "描述" });
    expect(buildFieldActionInstruction(target, "rewrite")).toContain("卡片字段编辑工具");
  });

  it("dispatches lorebook fields with an entry fingerprint and exact field", () => {
    const card = createBlankCard();
    card.data.character_book = { extensions: {}, entries: [{ id: 1, comment: "City", keys: [], secondary_keys: [], content: "Old", extensions: {}, enabled: true, insertion_order: 0, use_regex: false }] };
    const target = { path: "/worldBook/entries/0/content" as const, label: "条目内容", value: "Old" };
    const permission = resolveFieldActionPermission(card, target);
    expect(permission.scope).toMatchObject({ kind: "lorebookEntry", index: 0, fields: ["content"] });
    expect(buildFieldActionInstruction(target, "rewrite")).toContain("世界书条目编辑工具");
  });
});
