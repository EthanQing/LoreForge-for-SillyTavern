import { describe, expect, it } from "vitest";
import { createBlankCard } from "./schema";
import {
  buildValidationAgentInstruction,
  getValidationEditorTab,
  getValidationTargetPaths,
  resolveValidationIssuePermission
} from "./validationIssueNavigation";

describe("validation issue navigation", () => {
  it("routes validation paths to the matching editor", () => {
    expect(getValidationEditorTab("data.name")).toBe("basic");
    expect(getValidationEditorTab("data.description")).toBe("prompts");
    expect(getValidationEditorTab("data.first_mes")).toBe("greetings");
    expect(getValidationEditorTab("data.character_book.entries.2.keys.0")).toBe("lorebook");
    expect(getValidationEditorTab("data.character_book.entries")).toBe("validation");
    expect(getValidationEditorTab("data.character_book.entries.2.keys")).toBe("validation");
    expect(getValidationEditorTab("data.group_only_greetings")).toBe("validation");
    expect(getValidationEditorTab("data.assets.1.uri")).toBe("assets");
    expect(getValidationEditorTab("unknown.path")).toBe("validation");
  });

  it("returns exact and parent targets for lazy or aggregate fields", () => {
    expect(getValidationTargetPaths("data.character_book.entries.2.keys.0")).toEqual([
      "data.character_book.entries.2.keys.0",
      "data.character_book.entries.2.keys",
      "data.character_book.entries.2",
      "data.character_book.entries",
      "data.character_book",
      "data"
    ]);
  });

  it("grants the narrowest supported field permission", () => {
    const card = createBlankCard();
    const permission = resolveValidationIssuePermission(card, {
      level: "warning",
      code: "empty_name",
      path: "data.name",
      message: "Name is empty."
    });
    expect(permission.scope).toEqual({ kind: "field", path: "/name", label: "data.name" });
  });

  it("limits a lorebook issue to the matching entry field", () => {
    const card = createBlankCard();
    card.data.character_book = {
      extensions: {},
      entries: [{ keys: ["["], content: "", extensions: {}, enabled: true, insertion_order: 0, use_regex: true }]
    };
    const permission = resolveValidationIssuePermission(card, {
      level: "warning",
      code: "invalid_regex",
      path: "data.character_book.entries.0.keys.0",
      message: "Invalid regex."
    });
    expect(permission.scope).toMatchObject({ kind: "lorebookEntry", index: 0, fields: ["keys"] });
  });

  it("keeps unsupported asset issues read-only", () => {
    const permission = resolveValidationIssuePermission(createBlankCard(), {
      level: "warning",
      code: "http_asset",
      path: "data.assets.0.uri",
      message: "HTTP asset URI is not secure."
    });
    expect(permission.capabilities).toEqual(["read"]);
  });

  it("embeds the report as diagnostic data and requires a fresh inspection", () => {
    const instruction = buildValidationAgentInstruction({
      valid: false,
      errors: [{ level: "error", code: "missing_string", path: "data.name", message: "Name is empty." }],
      warnings: []
    });
    expect(instruction).toContain("inspect_validation");
    expect(instruction).toContain("<validation_report>");
    expect(instruction).toContain("data.name");
    expect(instruction).toContain("待审核提案");
  });
});
