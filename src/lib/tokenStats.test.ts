import { describe, expect, it } from "vitest";
import { createBlankCard } from "./schema";
import { buildCardTokenStats } from "./tokenStats";

describe("card token stats", () => {
  it("reports zero text tokens for a blank card", () => {
    const stats = buildCardTokenStats(createBlankCard(100));

    expect(stats.totalTokens).toBe(0);
    expect(stats.promptPreviewMaxTokens).toBe(0);
    expect(stats.largestFields).toEqual([]);
  });

  it("groups card text, lorebook entries, and greeting preview estimates", () => {
    const card = createBlankCard(100);
    card.data.name = "Ada";
    card.data.description = "Ada is a careful archivist.";
    card.data.personality = "Patient, precise, quietly funny.";
    card.data.first_mes = "{{char}} opens the archive for {{user}}.";
    card.data.alternate_greetings = ["{{char}} checks the lantern twice."];
    card.data.character_book = {
      extensions: {},
      entries: [
        {
          keys: ["archive", "ledger"],
          secondary_keys: ["city"],
          content: "The archive stores disputed histories.",
          enabled: true,
          insertion_order: 10,
          use_regex: false,
          extensions: {},
          comment: "Archive",
        },
      ],
    };

    const stats = buildCardTokenStats(card);
    const prompts = stats.sections.find((section) => section.id === "prompts");
    const greetings = stats.sections.find((section) => section.id === "greetings");
    const lorebook = stats.sections.find((section) => section.id === "lorebook");

    expect(stats.totalTokens).toBeGreaterThan(0);
    expect(prompts?.tokens).toBeGreaterThan(0);
    expect(greetings?.tokens).toBeGreaterThan(0);
    expect(lorebook?.tokens).toBeGreaterThan(0);
    expect(stats.lorebookEntries).toHaveLength(1);
    expect(stats.lorebookEntries[0].totalTokens).toBeGreaterThan(stats.lorebookEntries[0].contentTokens);
    expect(stats.enabledLorebookEntries).toBe(1);
    expect(stats.greetingPreviews).toHaveLength(2);
    expect(stats.promptPreviewMaxTokens).toBeGreaterThanOrEqual(stats.greetingPreviews[0].promptTokens);
  });

  it("skips inline asset data uris while counting external references", () => {
    const card = createBlankCard(100);
    card.data.assets = [
      { type: "icon", name: "main", ext: "png", uri: "data:image/png;base64,abcdef" },
      { type: "background", name: "city", ext: "png", uri: "https://example.test/city.png" },
    ];

    const stats = buildCardTokenStats(card);
    const assets = stats.sections.find((section) => section.id === "assets");

    expect(stats.assetSummary.skippedDataUris).toBe(1);
    expect(stats.assetSummary.countedReferences).toBe(1);
    expect(assets?.tokens).toBeGreaterThan(0);
    expect(assets?.items[0].tokens).toBeGreaterThan(0);
    expect(assets?.items[0].characters).toBe("icon\nmain\npng".length);
  });

  it("sorts largest fields by token count", () => {
    const card = createBlankCard(100);
    card.data.description = "short";
    card.data.mes_example = "one two three four five six seven eight nine ten";

    const stats = buildCardTokenStats(card, 2);

    expect(stats.largestFields).toHaveLength(2);
    expect(stats.largestFields[0].tokens).toBeGreaterThanOrEqual(stats.largestFields[1].tokens);
    expect(stats.largestFields[0].label).toBe("messageExample");
  });
});
