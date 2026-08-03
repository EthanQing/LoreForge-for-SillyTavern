import { describe, expect, it } from "vitest";
import { createBlankCard } from "../../lib/schema";
import { findLorebookMentionRange, getLorebookMentionOptions, insertLorebookMention } from "./agentMention";

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
});
