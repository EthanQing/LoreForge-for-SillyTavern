import { describe, expect, it } from "vitest";
import { createBlankCard, createBlankLorebook } from "./schema";
import {
  getSillyTavernLorebookBinding,
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
});
