import { describe, expect, it } from "vitest";
import { createBlankCard } from "../../lib/schema";
import { findLorebookMentionRange, getAgentMentionOptions, getLorebookMentionOptions, insertLorebookMention } from "./agentMention";

function cardWithEntries(titles: string[]) {
  const card = createBlankCard();
  card.data.character_book = {
    extensions: {},
    entries: titles.map((comment, index) => ({
      id: index + 10,
      comment,
      keys: index === 0 ? ["留学", "东京"] : [],
      secondary_keys: [],
      content: "",
      extensions: {},
      enabled: true,
      insertion_order: index,
      use_regex: false
    }))
  };
  return card;
}

describe("agent lorebook mentions", () => {
  it("finds the active mention at the caret", () => {
    expect(findLorebookMentionRange("请修改 @东京", 7)).toEqual({ start: 4, end: 7, query: "东京" });
    expect(findLorebookMentionRange("mail@example.com", 16)).toBeUndefined();
  });

  it("filters entries by title, id, and keys", () => {
    const card = cardWithEntries(["中国留学生", "校园规则"]);

    expect(getLorebookMentionOptions(card, "东京").map((option) => option.title)).toEqual(["中国留学生"]);
    expect(getLorebookMentionOptions(card, "11").map((option) => option.title)).toEqual(["校园规则"]);
  });

  it("keeps every matching lorebook entry", () => {
    const card = cardWithEntries(Array.from({ length: 16 }, (_, index) => `条目 ${index + 1}`));

    const options = getLorebookMentionOptions(card, "");

    expect(options).toHaveLength(16);
    expect(options.at(-1)?.title).toBe("条目 16");
  });

  it("inserts quoted titles and disambiguates duplicates", () => {
    const card = cardWithEntries(["东京 大学", "东京 大学"]);
    const options = getLorebookMentionOptions(card, "东京");
    const result = insertLorebookMention("修改 @东京的内容", { start: 3, end: 6, query: "东京" }, options[1]);

    expect(options.map((option) => option.token)).toEqual(['@"东京 大学"#1', '@"东京 大学"#2']);
    expect(result).toEqual({ value: '修改 @"东京 大学"#2 的内容', cursor: 14 });
    expect(insertLorebookMention("@", { start: 0, end: 1, query: "" }, options[0])).toEqual({
      value: '@"东京 大学"#1 ',
      cursor: 11
    });
  });

  it("limits candidates to the current page surface", () => {
    const card = cardWithEntries(["城市"]);
    card.data.first_mes = "初次见面";
    card.data.alternate_greetings = ["备用一", "备用二"];

    expect(getAgentMentionOptions(card, "worldbook", "").every((option) => option.kind === "lorebookEntry")).toBe(true);
    expect(getAgentMentionOptions(card, "worldbook", "备用")).toHaveLength(0);
    expect(getAgentMentionOptions(card, "greetings", "备用").map((option) => option.title)).toEqual(["备用开场白 #1", "备用开场白 #2"]);
    expect(getAgentMentionOptions(card, "card", "").some((option) => option.kind === "lorebookEntry")).toBe(true);
    expect(getAgentMentionOptions(card, "card", "").some((option) => option.title === "描述")).toBe(true);
  });

  it("keeps unsupported pages from exposing mention targets", () => {
    expect(getAgentMentionOptions(createBlankCard(), "none", "")).toEqual([]);
  });
});
