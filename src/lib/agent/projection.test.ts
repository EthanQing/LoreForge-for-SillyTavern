import { describe, expect, it } from "vitest";
import { prepareCardForExport } from "../migrations";
import { createBlankCard, createBlankLorebook } from "../schema";
import { permissionForPreset } from "./permissions";
import { getLorebookEntryFingerprint, projectCard, projectCardForPermission } from "./projection";

function cardWithBinding() {
  const card = createBlankCard(1);
  const book = createBlankLorebook();
  book.name = "Embedded World";
  card.data.character_book = book;
  card.data.extensions.world = "Linked World";
  return card;
}

describe("agent card projection", () => {
  it("exposes the SillyTavern binding as read-only lorebook context", () => {
    const card = cardWithBinding();

    expect(projectCard(card, 4).lorebook).toMatchObject({
      name: "Embedded World",
      linkedWorldName: "Linked World"
    });
    expect(projectCardForPermission(card, 4, permissionForPreset("worldbook"))).toMatchObject({
      cardRevision: 4,
      lorebook: {
        name: "Embedded World",
        linkedWorldName: "Linked World"
      }
    });
  });

  it("keeps entry fingerprints stable through export normalization", () => {
    const card = createBlankCard(1);
    card.data.character_book = {
      extensions: {},
      entries: [{
        id: 1,
        name: "City",
        keys: ["city"],
        content: "Lore",
        extensions: {},
        enabled: true,
        insertion_order: 0,
        use_regex: false
      }]
    };
    const entry = card.data.character_book.entries[0];
    const fingerprint = getLorebookEntryFingerprint(entry, 0);
    const normalizedEntry = prepareCardForExport(card, 2).data.character_book?.entries[0];

    expect(normalizedEntry?.extensions.display_index).toBe(0);
    expect(normalizedEntry && getLorebookEntryFingerprint(normalizedEntry, 0)).toBe(fingerprint);
    expect(projectCard(card, 0).lorebook.entries[0]?.fingerprint).toBe(fingerprint);
  });
});
