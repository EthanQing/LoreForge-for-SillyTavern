import { describe, expect, it } from "vitest";
import { getMarkdownEnterResult } from "./markdownInput";

describe("getMarkdownEnterResult", () => {
  it("continues ordered lists with the next number", () => {
    const line = "  1. 第一项";

    expect(getMarkdownEnterResult(line, line.length)).toEqual({
      fromOffset: line.length,
      toOffset: line.length,
      insert: "\n  2. ",
      cursorOffset: line.length + 6
    });
  });

  it("continues unordered lists and block quotes", () => {
    const list = "- 第一项";
    const quote = "> 说明";

    expect(getMarkdownEnterResult(list, list.length)?.insert).toBe("\n- ");
    expect(getMarkdownEnterResult(quote, quote.length)?.insert).toBe("\n> ");
  });

  it("exits an empty list or quote", () => {
    expect(getMarkdownEnterResult("1. ", 3)).toEqual({
      fromOffset: 0,
      toOffset: 3,
      insert: "\n",
      cursorOffset: 1
    });
    expect(getMarkdownEnterResult("> ", 2)?.insert).toBe("\n");
  });

  it("does not rewrite a line when the cursor is in the middle", () => {
    expect(getMarkdownEnterResult("1. 第一项", 4)).toBeNull();
    expect(getMarkdownEnterResult("普通文本", 2)).toBeNull();
  });
});
