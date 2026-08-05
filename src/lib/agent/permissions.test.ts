import { describe, expect, it } from "vitest";
import { createBlankCard } from "../schema";
import { canEditCardField, canEditCardPath, canEditLorebookEntry, canInjectLorebook, decodeAgentRequest, encodeAgentRequest, permissionForField, permissionForPreset, resolveAgentRequest, resolveReplacementAgentRequest } from "./permissions";
import { projectCardForPermission, stableHash } from "./projection";

describe("agent request permissions", () => {
  it("turns @ targets into enforced scopes", () => {
    const request = resolveAgentRequest("@提示词 润色描述", createBlankCard(), "card");
    expect(request.instruction).toBe("润色描述");
    expect(canEditCardField(request.permission, "/description")).toBe(true);
    expect(canEditCardField(request.permission, "/name")).toBe(false);
    expect(canInjectLorebook(request.permission)).toBe(false);
  });

  it("rejects unknown mentions instead of falling back to full-card access", () => {
    expect(() => resolveAgentRequest("@不存在 修改", createBlankCard(), "card")).toThrow("无法识别");
  });

  it("rejects ambiguous lorebook titles", () => {
    const card = createBlankCard();
    card.data.character_book = {
      extensions: {},
      entries: [0, 1].map((id) => ({ id, comment: "城市", keys: [], secondary_keys: [], content: "", extensions: {}, enabled: true, insertion_order: id, use_regex: false }))
    };
    expect(() => resolveAgentRequest("@城市 修改", card, "card")).toThrow("多个世界书条目");
  });

  it("resolves quoted lorebook titles containing spaces", () => {
    const card = createBlankCard();
    card.data.character_book = {
      extensions: {},
      entries: [{ id: 7, comment: "东京 大学", keys: [], secondary_keys: [], content: "", extensions: {}, enabled: true, insertion_order: 0, use_regex: false }]
    };

    const request = resolveAgentRequest('@"东京 大学" 修改内容', card, "card");

    expect(request.instruction).toBe("修改内容");
    expect(request.permission.scope).toMatchObject({ kind: "lorebookEntry", index: 0, label: "东京 大学" });
  });

  it("uses the autocomplete index to disambiguate duplicate titles", () => {
    const card = createBlankCard();
    card.data.character_book = {
      extensions: {},
      entries: [0, 1].map((id) => ({ id, comment: "城市", keys: [], secondary_keys: [], content: "", extensions: {}, enabled: true, insertion_order: id, use_regex: false }))
    };

    const request = resolveAgentRequest('@"城市"#2 修改', card, "card");

    expect(request.permission.scope).toMatchObject({ kind: "lorebookEntry", index: 1 });
  });

  it("combines multiple selected lorebook mentions into an exact permission", () => {
    const card = createBlankCard();
    card.data.character_book = {
      extensions: {},
      entries: ["东京", "大阪", "京都", "名古屋"].map((comment, index) => ({ id: index, comment, keys: [], secondary_keys: [], content: "", extensions: {}, enabled: true, insertion_order: index, use_regex: false }))
    };

    const request = resolveAgentRequest('@"东京" @"大阪" @"京都" 同时修改', card, "card");
    const entries = card.data.character_book.entries;

    expect(request.instruction).toBe("同时修改");
    expect(request.permission.scope).toMatchObject({ kind: "lorebookEntries", entries: [{ index: 0 }, { index: 1 }, { index: 2 }] });
    expect(canEditLorebookEntry(request.permission, 0, entries[0] ? stableHash(entries[0]) : "")).toBe(true);
    expect(canEditLorebookEntry(request.permission, 1, entries[1] ? stableHash(entries[1]) : "")).toBe(true);
    expect(canEditLorebookEntry(request.permission, 2, entries[2] ? stableHash(entries[2]) : "")).toBe(true);
    expect(canEditLorebookEntry(request.permission, 3, entries[3] ? stableHash(entries[3]) : "")).toBe(false);
  });

  it("roundtrips persisted request scope envelopes", () => {
    const permission = permissionForField("/description", "描述");
    expect(decodeAgentRequest(encodeAgentRequest(permission, "润色"))).toEqual({ permission, instruction: "润色" });
  });

  it("does not trust capabilities from a persisted envelope", () => {
    const encoded = `<agent_scope data="${encodeURIComponent(JSON.stringify({ scope: { kind: "field", path: "/description", label: "描述" }, capabilities: ["read", "edit", "inject"] }))}">\n润色\n</agent_scope>`;
    expect(decodeAgentRequest(encoded).permission).toEqual(permissionForField("/description", "描述"));
  });

  it("uses the current user-selected scope for replacement runs", () => {
    const previous = encodeAgentRequest(permissionForPreset("worldbook"), "修改开场白");
    expect(resolveReplacementAgentRequest(previous, "card")).toEqual({
      instruction: "修改开场白",
      permission: permissionForPreset("card")
    });
  });

  it("uses edited text and the current scope when resending", () => {
    const previous = encodeAgentRequest(permissionForPreset("worldbook"), "旧指令");
    expect(resolveReplacementAgentRequest(previous, "greetings", "新指令")).toEqual({
      instruction: "新指令",
      permission: permissionForPreset("greetings")
    });
  });

  it("resolves greeting mentions to one alternate greeting field", () => {
    const card = createBlankCard();
    card.data.alternate_greetings = ["备用一", "备用二"];

    const request = resolveAgentRequest("@开场白/备用2 润色", card, "greetings", "greetings");

    expect(request.instruction).toBe("润色");
    expect(request.permission.scope).toMatchObject({ kind: "field", path: "/alternateGreetings/1" });
    expect(canEditCardPath(request.permission, "/alternateGreetings/1")).toBe(true);
    expect(canEditCardPath(request.permission, "/alternateGreetings/0")).toBe(false);
  });

  it("rejects a target from another page surface", () => {
    const card = createBlankCard();
    card.data.alternate_greetings = ["备用一"];

    expect(() => resolveAgentRequest("@开场白/备用1 修改", card, "worldbook", "worldbook")).toThrow("世界书条目");
  });

  it("clamps the fallback scope to the active page", () => {
    const request = resolveAgentRequest("整理当前页面", createBlankCard(), "card", "greetings");

    expect(request.permission).toEqual(permissionForPreset("greetings"));
  });

  it("combines exact card targets without granting injection", () => {
    const card = createBlankCard();
    card.data.alternate_greetings = ["备用一"];
    card.data.character_book = {
      extensions: {},
      entries: [{ id: 1, comment: "城市", keys: [], secondary_keys: [], content: "Lore", extensions: {}, enabled: true, insertion_order: 0, use_regex: false }]
    };

    const request = resolveAgentRequest("@开场白/备用1 @\"城市\" 同时检查", card, "card", "card");

    expect(request.permission.scope).toMatchObject({
      kind: "targets",
      fields: [{ path: "/alternateGreetings/0" }],
      entries: [{ index: 0 }]
    });
    expect(canEditCardPath(request.permission, "/alternateGreetings/0")).toBe(true);
    expect(canEditLorebookEntry(request.permission, 0, stableHash(card.data.character_book.entries[0]))).toBe(true);
    expect(canInjectLorebook(request.permission)).toBe(false);
  });

  it("rejects a stale alternate greeting target", () => {
    const card = createBlankCard();
    card.data.alternate_greetings = ["备用一"];

    expect(() => resolveAgentRequest("@开场白/备用2 修改", card, "greetings", "greetings")).toThrow("开场白选项可能已变化");
  });

  it("projects only exact targets on a mixed card request", () => {
    const card = createBlankCard();
    card.data.alternate_greetings = ["备用一"];
    card.data.character_book = {
      extensions: {},
      entries: [{ id: 1, comment: "城市", keys: [], secondary_keys: [], content: "Lore", extensions: {}, enabled: true, insertion_order: 0, use_regex: false }]
    };
    const request = resolveAgentRequest("@开场白/备用1 @\"城市\" 检查", card, "card", "card");
    const projection = projectCardForPermission(card, 4, request.permission) as { fields: Array<{ path: string }>; entries: Array<{ index: number }> };

    expect(projection.fields.map((field) => field.path)).toEqual(["/alternateGreetings/0"]);
    expect(projection.entries.map((entry) => entry.index)).toEqual([0]);
  });
});
