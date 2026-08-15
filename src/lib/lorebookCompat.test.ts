import { describe, expect, it } from "vitest";
import { createBlankCard, createBlankLorebook, createBlankLorebookEntry } from "./schema";
import {
  fromSillyTavernWorldInfo,
  getSillyTavernLorebookBinding,
  normalizeLorebookForSillyTavern,
  toSillyTavernWorldInfo,
  syncSillyTavernLorebookBinding,
  syncSillyTavernLorebookBindingAfterRename
} from "./lorebookCompat";

function cardWithLorebook(bookName: string | undefined, linkedName?: string) {
  const card = createBlankCard(1);
  const book = createBlankLorebook();
  if (bookName !== undefined) {
    book.name = bookName;
  }
  card.data.character_book = book;
  card.data.extensions.keep = true;
  if (linkedName !== undefined) {
    card.data.extensions.world = linkedName;
  }
  return card;
}

describe("SillyTavern lorebook binding", () => {
  it("detects a mismatch between the embedded name and primary binding", () => {
    expect(getSillyTavernLorebookBinding(cardWithLorebook("New World", "Old World"))).toEqual({
      embeddedName: "New World",
      linkedName: "Old World",
      isMismatched: true
    });
  });

  it("follows an existing binding when the embedded lorebook is renamed", () => {
    const card = cardWithLorebook("New World", "Old World");
    const next = syncSillyTavernLorebookBindingAfterRename(card, "Old World");

    expect(next.data.extensions.world).toBe("New World");
    expect(next.data.extensions.keep).toBe(true);
  });

  it("preserves an intentional external binding during a rename", () => {
    const card = cardWithLorebook("New World", "Shared World");
    const next = syncSillyTavernLorebookBindingAfterRename(card, "Old World");

    expect(next.data.extensions.world).toBe("Shared World");
  });

  it("can explicitly replace an external binding with the embedded name", () => {
    const card = cardWithLorebook("New World", "Shared World");
    const next = syncSillyTavernLorebookBinding(card);

    expect(next.data.extensions.world).toBe("New World");
    expect(next.data.extensions.keep).toBe(true);
  });

  it("keeps the exact embedded name when writing the binding", () => {
    const card = cardWithLorebook(" New World ", "Old World");
    const next = syncSillyTavernLorebookBinding(card);

    expect(next.data.extensions.world).toBe(" New World ");
    expect(getSillyTavernLorebookBinding(card).isMismatched).toBe(true);
  });

  it("creates a primary binding when the embedded lorebook has no link", () => {
    const card = cardWithLorebook("New World");
    const next = syncSillyTavernLorebookBindingAfterRename(card, "Old World");

    expect(next.data.extensions.world).toBe("New World");
  });

  it("exports the standalone SillyTavern entries object", () => {
    const book = createBlankLorebook();
    book.name = "World";
    book.entries.push({
      id: 12,
      keys: ["alpha"],
      secondary_keys: ["beta"],
      content: "Entry content",
      extensions: { position: 1, group: "cities" },
      enabled: true,
      insertion_order: 42,
      use_regex: false,
      comment: "Alpha entry"
    });

    const exported = toSillyTavernWorldInfo(book);
    expect(exported).toEqual(expect.objectContaining({ entries: expect.any(Object) }));
    expect(exported.entries["12"]).toMatchObject({
      uid: 12,
      key: ["alpha"],
      keysecondary: ["beta"],
      order: 42,
      position: 1,
      group: "cities"
    });
    expect(exported.entries["12"]).not.toHaveProperty("keys");
  });

  it("assigns unique entry IDs before exporting an embedded or standalone lorebook", () => {
    const book = createBlankLorebook();
    const ids = [undefined, 0, undefined, 1, 2, undefined, 19, 3, 4, 15, undefined, 18];
    book.entries = ids.map((id, index) => {
      const entry = createBlankLorebookEntry(index);
      if (id !== undefined) {
        entry.id = id;
      }
      return entry;
    });

    const normalized = normalizeLorebookForSillyTavern(book);
    const exported = toSillyTavernWorldInfo(book);

    expect(normalized?.entries.map((entry) => entry.id)).toEqual([5, 0, 6, 1, 2, 7, 19, 3, 4, 15, 8, 18]);
    expect(Object.keys(exported.entries)).toHaveLength(12);
    expect(new Set(Object.values(exported.entries).map((entry) => String(entry.uid))).size).toBe(12);
  });

  it("treats numeric and string entry IDs with the same key as duplicates", () => {
    const book = createBlankLorebook();
    book.entries = [0, "0", undefined].map((id, index) => {
      const entry = createBlankLorebookEntry(index);
      if (id !== undefined) {
        entry.id = id;
      }
      return entry;
    });

    expect(normalizeLorebookForSillyTavern(book)?.entries.map((entry) => entry.id)).toEqual([0, 1, 2]);
  });

  it("imports a standalone SillyTavern entries object", () => {
    const imported = fromSillyTavernWorldInfo({
      entries: {
        "7": {
          uid: 7,
          key: ["alpha"],
          keysecondary: ["beta"],
          comment: "Alpha entry",
          content: "Entry content",
          order: 9,
          position: 1,
          disable: false,
          group: "cities"
        }
      }
    });

    expect(imported?.entries[0]).toMatchObject({
      id: 7,
      keys: ["alpha"],
      secondary_keys: ["beta"],
      insertion_order: 9,
      position: "after_char"
    });
    expect(imported?.entries[0].extensions).toMatchObject({ group: "cities", position: 1 });
  });

  it("uses the standalone entry key when a World Info UID is missing", () => {
    const imported = fromSillyTavernWorldInfo({
      entries: {
        legacy_uid: {
          key: ["legacy"],
          content: "Legacy content"
        }
      }
    });

    expect(imported?.entries[0].id).toBe("legacy_uid");
  });
});
