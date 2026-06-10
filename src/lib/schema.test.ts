import { describe, expect, it } from "vitest";
import { createBlankCard, createBlankLorebookEntry } from "./schema";
import { migrateToV3, prepareCardForExport } from "./migrations";
import { validateCard } from "./validation";

describe("ccv3 schema helpers", () => {
  it("creates a blank V3 card", () => {
    const card = createBlankCard(100);
    expect(card.spec).toBe("chara_card_v3");
    expect(card.spec_version).toBe("3.0");
    expect(card.data.tags).toEqual([]);
    expect(card.data.group_only_greetings).toEqual([]);
    expect(card.data.creation_date).toBe(100);
  });

  it("roundtrips V3 JSON without stripping unknown fields", () => {
    const card = createBlankCard(100);
    card.data.extensions.example = { keep: true };
    card.data.extra_field = "preserve";
    const migrated = migrateToV3(JSON.parse(JSON.stringify(card)), 200);
    expect(migrated.card.data.extensions.example).toEqual({ keep: true });
    expect(migrated.card.data.extra_field).toBe("preserve");
  });

  it("migrates V2 to V3 and fills use_regex", () => {
    const result = migrateToV3(
      {
        spec: "chara_card_v2",
        spec_version: "2.0",
        data: {
          name: "A",
          character_book: {
            extensions: {},
            entries: [{ keys: ["["], content: "x", extensions: {}, enabled: true, insertion_order: 7 }],
          },
        },
      },
      300,
    );
    expect(result.card.spec).toBe("chara_card_v3");
    expect(result.card.data.character_book?.entries[0].use_regex).toBe(false);
  });

  it("creates blank lorebook entries with a SillyTavern memo fallback", () => {
    const entry = createBlankLorebookEntry(2);

    expect(entry.name).toBeUndefined();
    expect(entry.comment).toBe("Entry 3");
  });

  it("fills empty lorebook memos and syncs SillyTavern extension fields before export", () => {
    const card = createBlankCard(100);
    card.data.character_book = {
      extensions: {},
      entries: [
        {
          name: "Faction",
          keys: ["faction"],
          content: "Faction lore.",
          extensions: {},
          enabled: true,
          insertion_order: 0,
          use_regex: false,
          position: "after_char",
          case_sensitive: true,
          depth: 3,
          probability: 80,
        },
        {
          keys: ["city"],
          content: "City lore.",
          extensions: { commentKeep: true },
          enabled: true,
          insertion_order: 1,
          use_regex: false,
        },
      ],
    };

    const exported = prepareCardForExport(card, 200);
    const entries = exported.data.character_book?.entries ?? [];

    expect(entries[0].comment).toBe("Faction");
    expect(entries[0].name).toBeUndefined();
    expect(entries[0].extensions.position).toBe(1);
    expect(entries[0].extensions.case_sensitive).toBe(true);
    expect(entries[0].extensions.depth).toBe(3);
    expect(entries[0].extensions.probability).toBe(80);
    expect(entries[1].comment).toBe("city");
    expect(entries[1].extensions.commentKeep).toBe(true);
    expect(entries[1].extensions.display_index).toBe(1);
  });

  it("migrates V1 cards", () => {
    const result = migrateToV3({ name: "A", description: "B", personality: "C", scenario: "D", first_mes: "E" }, 400);
    expect(result.sourceFormat).toBe("v1");
    expect(result.card.data.name).toBe("A");
    expect(result.card.data.creation_date).toBe(400);
  });

  it("warns for invalid regex", () => {
    const card = createBlankCard();
    card.data.character_book = {
      extensions: {},
      entries: [{ keys: ["["], content: "", extensions: {}, enabled: true, insertion_order: 0, use_regex: true }],
    };
    const report = validateCard(card);
    expect(report.warnings.some((warning) => warning.code === "invalid_regex")).toBe(true);
  });

  it("validates main icon rules", () => {
    const card = createBlankCard();
    card.data.assets = [
      { type: "icon", uri: "ccdefault:", name: "side", ext: "png" },
      { type: "icon", uri: "ccdefault:", name: "other", ext: "png" },
    ];
    const report = validateCard(card);
    expect(report.errors.some((error) => error.code === "invalid_main_icon")).toBe(true);
  });

  it("warns when an exported card contains inline image assets", () => {
    const card = createBlankCard();
    card.data.assets = [{ type: "icon", uri: "data:image/png;base64,abcdef", name: "main", ext: "png" }];

    const report = validateCard(card);

    expect(report.warnings.some((warning) => warning.code === "inline_image_asset")).toBe(true);
  });
});
