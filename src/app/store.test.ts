import { describe, expect, it } from "vitest";
import { promoteAlternateGreetingToFirst, reorderLorebookEntriesForDisplay } from "./store";
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
