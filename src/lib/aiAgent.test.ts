import { describe, expect, it } from "vitest";
import {
  applyAiPatches,
  createEditTargetFromFieldTarget,
  createAiAgentPreview,
  emptyFieldPaths,
  filterAiPatchesForTarget,
  filterAiPatchesByDeniedPaths,
  fromNormalizedAiCard,
  parseAiAgentResponse,
  parseAiAgentEditTarget,
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
    comment: "Main Setting",
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
          comment: "Faction Memo",
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
    expect(roundtripped.data.character_book?.entries[0].comment).toBe("Faction Memo");
    expect(roundtripped.data.character_book?.entries[0].content).toBe("Updated lore.");
    expect(roundtripped.data.character_book?.entries[0].extensions.depth).toBe(3);
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

  it("requires and applies SillyTavern memo comments for worldBook entries", () => {
    const normalized = toNormalizedAiCard(createBlankCard());
    const entry = worldBookEntry("wb_city");

    const patched = applyAiPatches(normalized, [
      { op: "add", path: "/worldBook", value: { name: "Book", entries: [entry] } },
      { op: "replace", path: "/worldBook/entries/0/comment", value: "City Memo" }
    ]);
    const card = fromNormalizedAiCard(patched, createBlankCard());

    expect(patched.worldBook?.entries[0].comment).toBe("City Memo");
    expect(card.data.character_book?.entries[0].comment).toBe("City Memo");
    expect(card.data.character_book?.entries[0].name).toBeUndefined();
    expect(card.data.character_book?.entries[0].extensions.probability).toBe(100);

    const missingComment = { ...entry } as Record<string, unknown>;
    delete missingComment.comment;
    expect(() => applyAiPatches(toNormalizedAiCard(createBlankCard()), [{ op: "add", path: "/worldBook", value: { entries: [missingComment] } }])).toThrow(
      /missing comment/
    );
  });

  it("parses @ targets and filters out-of-scope patches", () => {
    const card = createBlankCard();
    card.data.character_book = {
      extensions: {},
      entries: [
        {
          id: "wb_city",
          name: "City",
          keys: ["city"],
          content: "The city is old.",
          extensions: {},
          enabled: true,
          insertion_order: 0,
          use_regex: false
        }
      ]
    };
    const normalized = toNormalizedAiCard(card);
    const target = parseAiAgentEditTarget("@City rewrite the entry content", normalized);

    expect(target?.kind).toBe("worldBookEntry");
    expect(target?.entryIndex).toBe(0);

    const filtered = filterAiPatchesForTarget(
      [
        { op: "replace", path: "/worldBook/entries/0/content", value: "The city is ancient." },
        { op: "replace", path: "/name", value: "Ada" }
      ],
      target
    );

    expect(filtered.accepted.map((patch) => patch.path)).toEqual(["/worldBook/entries/0/content"]);
    expect(filtered.rejected).toEqual(["/name"]);
  });

  it("parses broad @基础 and @世界书 edit targets", () => {
    const normalized = toNormalizedAiCard(createBlankCard());

    expect(parseAiAgentEditTarget("@基础 改名", normalized)?.editablePaths).toContain("/name");
    expect(parseAiAgentEditTarget("@世界书 新增一个组织条目", normalized)?.editablePaths).toEqual(["/worldBook"]);
  });

  it("parses @ targets followed by Chinese punctuation and still filters patches", () => {
    const normalized = toNormalizedAiCard(createBlankCard());
    const target = parseAiAgentEditTarget("@基础，帮我补全一下", normalized);

    expect(target?.kind).toBe("basic");
    expect(target?.instruction).toBe("，帮我补全一下");

    const filtered = filterAiPatchesForTarget(
      [
        { op: "replace", path: "/creatorNotes", value: "基础备注。" },
        { op: "replace", path: "/description", value: "不该进入基础目标。" },
        { op: "replace", path: "/firstMessage", value: "也不该进入基础目标。" }
      ],
      target
    );

    expect(filtered.accepted.map((patch) => patch.path)).toEqual(["/creatorNotes"]);
    expect(filtered.rejected).toEqual(["/description", "/firstMessage"]);
  });

  it("field targets constrain field action patches to the targeted path", () => {
    const target = createEditTargetFromFieldTarget({
      kind: "field",
      path: "/description",
      label: "Description",
      value: "Short."
    });
    const filtered = filterAiPatchesForTarget(
      [
        { op: "replace", path: "/description", value: "Longer description." },
        { op: "replace", path: "/scenario", value: "Out of scope." }
      ],
      target
    );

    expect(filtered.accepted.map((patch) => patch.path)).toEqual(["/description"]);
    expect(filtered.rejected).toEqual(["/scenario"]);
  });

  it("selection targets only accept string replacement for the source field", () => {
    const target = createEditTargetFromFieldTarget({
      kind: "selection",
      path: "/description",
      label: "Description",
      value: "old",
      start: 0,
      end: 3
    });
    const filtered = filterAiPatchesForTarget(
      [
        { op: "replace", path: "/description", value: "new full field" },
        { op: "add", path: "/description", value: "bad op" },
        { op: "replace", path: "/personality", value: "bad path" }
      ],
      target
    );

    expect(filtered.accepted.map((patch) => patch.path)).toEqual(["/description"]);
    expect(filtered.rejected).toEqual(["/description", "/personality"]);
  });

  it("detects empty fields and filters denied paths", () => {
    const normalized = toNormalizedAiCard(createBlankCard());
    expect(emptyFieldPaths(normalized)).toContain("/name");
    expect(emptyFieldPaths(normalized)).toContain("/description");

    const filtered = filterAiPatchesByDeniedPaths(
      [
        { op: "replace", path: "/description", value: "Denied." },
        { op: "replace", path: "/name", value: "Allowed." }
      ],
      ["/description"]
    );
    expect(filtered.accepted.map((patch) => patch.path)).toEqual(["/name"]);
    expect(filtered.rejected).toEqual(["/description"]);
  });
});
