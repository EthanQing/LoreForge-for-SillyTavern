import { describe, expect, it } from "vitest";
import {
  applyAiPatches,
  createAiAgentPreview,
  fromNormalizedAiCard,
  parseAiAgentResponse,
  toNormalizedAiCard,
  type AiPatch,
  type NormalizedWorldBookEntry
} from "./aiAgent";
import { createBlankCard } from "./schema";
import { validateCard } from "./validation";

function worldBookEntry(id: string): NormalizedWorldBookEntry {
  return {
    id,
    enabled: true,
    name: "Main Setting",
    keys: ["setting"],
    secondaryKeys: [],
    content: "The setting has a clear reusable fact.",
    selective: false,
    constant: false,
    insertionPosition: "before_char",
    order: 0,
    depth: 4,
    probability: 100,
    budget: 300
  };
}

describe("ai agent normalized card helpers", () => {
  it("normalizes a blank card with editable fields", () => {
    const normalized = toNormalizedAiCard(createBlankCard(100));

    expect(normalized.name).toBe("");
    expect(normalized.firstMessage).toBe("");
    expect(normalized.alternateGreetings).toEqual([]);
    expect(normalized.tags).toEqual([]);
    expect(normalized.worldBook).toBeUndefined();
  });

  it("roundtrips worldBook data without stripping preserved card fields", () => {
    const card = createBlankCard(100);
    card.data.extra_field = "preserve";
    card.data.character_book = {
      name: "Book",
      extensions: { keep: true },
      entries: [
        {
          id: "wb_keep",
          name: "Faction",
          keys: ["faction"],
          secondary_keys: ["city"],
          content: "A preserved faction.",
          extensions: { entryKeep: true },
          enabled: true,
          insertion_order: 7,
          use_regex: false,
          priority: 42,
          depth: 3
        }
      ]
    };

    const normalized = toNormalizedAiCard(card);
    normalized.worldBook!.entries[0].content = "Updated lore.";
    const roundtripped = fromNormalizedAiCard(normalized, card);

    expect(roundtripped.data.extra_field).toBe("preserve");
    expect(roundtripped.data.character_book?.extensions.keep).toBe(true);
    expect(roundtripped.data.character_book?.entries[0].extensions.entryKeep).toBe(true);
    expect(roundtripped.data.character_book?.entries[0].priority).toBe(42);
    expect(roundtripped.data.character_book?.entries[0].content).toBe("Updated lore.");
  });

  it("applies allowed scalar and array patches", () => {
    const normalized = toNormalizedAiCard(createBlankCard());
    const patched = applyAiPatches(normalized, [
      { op: "replace", path: "/name", value: "Ada" },
      { op: "add", path: "/alternateGreetings/-", value: "{{char}} smiles at {{user}}." },
      { op: "add", path: "/tags/-", value: "Mystery" }
    ]);

    expect(patched.name).toBe("Ada");
    expect(patched.alternateGreetings).toEqual(["{{char}} smiles at {{user}}."]);
    expect(patched.tags).toEqual(["Mystery"]);
  });

  it("adds worldBook entries using the next available order", () => {
    const normalized = toNormalizedAiCard(createBlankCard());
    const first = worldBookEntry("wb_first");
    const second = { ...worldBookEntry("wb_second"), order: 99 };

    const patched = applyAiPatches(normalized, [
      { op: "add", path: "/worldBook", value: { name: "Book", entries: [first] } },
      { op: "add", path: "/worldBook/entries/-", value: second }
    ]);

    expect(patched.worldBook?.entries.map((entry) => entry.order)).toEqual([0, 1]);
  });

  it("rejects raw card paths and unsupported regexScripts", () => {
    const normalized = toNormalizedAiCard(createBlankCard());

    expect(() => applyAiPatches(normalized, [{ op: "replace", path: "/data/name", value: "Bad" }])).toThrow(
      /unsupported path|raw card field/
    );
    expect(() => parseAiAgentResponse(JSON.stringify({ message: "", summary: [], patches: [{ op: "add", path: "/regexScripts", value: [] }] }))).toThrow(
      /regexScripts/
    );
  });

  it("rejects invalid array indexes and wrong value types", () => {
    const normalized = toNormalizedAiCard(createBlankCard());

    expect(() => applyAiPatches(normalized, [{ op: "replace", path: "/alternateGreetings/0", value: "Missing" }])).toThrow(
      /invalid array index/
    );
    expect(() => applyAiPatches(normalized, [{ op: "replace", path: "/tags", value: "not-array" }])).toThrow(
      /array of strings/
    );
  });

  it("creates a valid preview card without mutating the input", () => {
    const card = createBlankCard();
    const response = parseAiAgentResponse(
      JSON.stringify({
        message: "Draft ready.",
        summary: ["Created a basic card."],
        patches: [
          { op: "replace", path: "/name", value: "Ada" },
          { op: "replace", path: "/description", value: "Ada is a curious archivist." },
          { op: "replace", path: "/personality", value: "Careful, bright, and quietly brave." },
          { op: "replace", path: "/scenario", value: "{{user}} meets Ada inside a sealed library." },
          { op: "replace", path: "/firstMessage", value: "{{char}} lowers her lantern. \"You heard it too, didn't you?\"" }
        ]
      })
    );

    const preview = createAiAgentPreview(card, response);

    expect(card.data.name).toBe("");
    expect(preview.after.data.name).toBe("Ada");
    expect(validateCard(preview.after).valid).toBe(true);
    expect(preview.diffs.map((diff) => diff.path)).toContain("/name");
  });

  it("reports non-json, markdown-wrapped json, and malformed responses", () => {
    expect(() => parseAiAgentResponse("hello")).toThrow(/valid JSON/);
    expect(() => parseAiAgentResponse("```json\n{}\n```")).toThrow(/Markdown/);
    expect(() => parseAiAgentResponse(JSON.stringify({ message: "Missing fields" }))).toThrow(/summary/);
  });

  it("does not apply a malformed worldBook entry", () => {
    const normalized = toNormalizedAiCard(createBlankCard());
    const badPatch: AiPatch = {
      op: "add",
      path: "/worldBook/entries/-",
      value: { id: "wb_bad", name: "Incomplete" }
    };

    expect(() => applyAiPatches(normalized, [badPatch])).toThrow(/missing enabled/);
    expect(normalized.worldBook).toBeUndefined();
  });
});
