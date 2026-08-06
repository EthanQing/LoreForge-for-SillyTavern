import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBlankCard, createBlankLorebook, type LorebookEntry } from "../lib/schema";
import { promoteAlternateGreetingToFirst, reorderLorebookEntriesForDisplay, useCardStore } from "./store";

function entry(comment: string, order: number): LorebookEntry {
  return {
    comment,
    keys: [comment],
    content: comment,
    extensions: {},
    enabled: true,
    insertion_order: order,
    use_regex: false
  };
}

describe("store lorebook helpers", () => {
  it("reorders entries without rewriting duplicate insertion orders", () => {
    const entries = [entry("Alpha", 10), entry("Beta", 10), entry("Gamma", 20)];

    const reordered = reorderLorebookEntriesForDisplay(entries, 0, 2);

    expect(reordered.map((item) => item.comment)).toEqual(["Beta", "Gamma", "Alpha"]);
    expect(reordered.map((item) => item.insertion_order)).toEqual([10, 20, 10]);
  });
});

describe("store greeting helpers", () => {
  it("promotes an alternate greeting by swapping the first message back into its slot", () => {
    const promoted = promoteAlternateGreetingToFirst("First", ["Alt 1", "Alt 2", "Alt 3"], 1);

    expect(promoted).toEqual(["Alt 1", "First", "Alt 3"]);
  });

  it("leaves alternate greetings unchanged for an invalid promotion index", () => {
    const alternates = ["Alt 1"];

    expect(promoteAlternateGreetingToFirst("First", alternates, 2)).toBe(alternates);
  });
});

function createStorageMock() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  };
}

function cardWithLorebookBinding() {
  const card = createBlankCard(1);
  const book = createBlankLorebook();
  book.name = "Old World";
  card.data.character_book = book;
  card.data.extensions.world = "Old World";
  return card;
}

describe("store lorebook binding actions", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorageMock());
    useCardStore.getState().replaceCard(cardWithLorebookBinding(), {
      dirty: false,
      origin: "new",
      workspaceId: "store-test"
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("syncs the binding for an explicit lorebook rename", () => {
    const beforeRevision = useCardStore.getState().cardRevision;

    useCardStore.getState().renameLorebook("New World");

    const state = useCardStore.getState();
    expect(state.card.data.character_book?.name).toBe("New World");
    expect(state.card.data.extensions.world).toBe("New World");
    expect(state.cardRevision).toBe(beforeRevision + 1);
    expect(state.dirty).toBe(true);
  });

  it("keeps the binding when a whole lorebook is imported", () => {
    const imported = createBlankLorebook();
    imported.name = "Imported World";

    useCardStore.getState().updateData("character_book", imported);

    const state = useCardStore.getState();
    expect(state.card.data.character_book?.name).toBe("Imported World");
    expect(state.card.data.extensions.world).toBe("Old World");
    expect(state.report.warnings).toContainEqual(expect.objectContaining({ code: "lorebook_binding_mismatch" }));
  });

  it("does not rewrite a binding when a card is loaded", () => {
    const loaded = cardWithLorebookBinding();
    loaded.data.character_book!.name = "Loaded World";

    useCardStore.getState().replaceCard(loaded, { dirty: false, origin: "file", workspaceId: "store-test" });

    const state = useCardStore.getState();
    expect(state.card.data.extensions.world).toBe("Old World");
    expect(state.report.warnings).toContainEqual(expect.objectContaining({ code: "lorebook_binding_mismatch" }));
  });
});
