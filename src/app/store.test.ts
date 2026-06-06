import { describe, expect, it } from "vitest";
import { reorderLorebookEntriesForDisplay } from "./store";
import type { LorebookEntry } from "../lib/schema";

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
