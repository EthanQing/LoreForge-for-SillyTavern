import { describe, expect, it } from "vitest";
import { buildAgentTranscript, formatAgentToolContent } from "./transcript";

describe("buildAgentTranscript", () => {
  it("combines assistant messages and tool results into one turn", () => {
    const turns = buildAgentTranscript([
      { role: "user", content: "检查这张卡" },
      { role: "assistant", content: [{ type: "text", text: "我先读取卡片。" }] },
      { role: "toolResult", toolName: "inspect_card", content: [{ type: "text", text: '{"name":""}' }] },
      { role: "assistant", content: [{ type: "text", text: "卡片目前为空。" }] }
    ]);

    expect(turns).toEqual([{
      userText: "检查这张卡",
      assistantText: "我先读取卡片。\n\n卡片目前为空。",
      assistantPresent: true,
      tools: [{ toolName: "inspect_card", isError: false, content: '{"name":""}' }],
      streaming: false
    }]);
  });

  it("adds a partial assistant message to the current turn", () => {
    const turns = buildAgentTranscript(
      [{ role: "user", content: "继续" }, { role: "assistant", content: "前半句" }],
      { role: "assistant", content: [{ type: "text", text: "后半句" }] }
    );

    expect(turns[0]).toMatchObject({
      assistantText: "前半句\n\n后半句",
      assistantPresent: true,
      streaming: true
    });
  });

  it("keeps an empty streaming assistant turn visible", () => {
    const turns = buildAgentTranscript([{ role: "user", content: "读取" }], { role: "assistant", content: [] });

    expect(turns[0]).toMatchObject({ assistantPresent: true, streaming: true });
  });
});

describe("assistant failure state", () => {
  it("keeps provider failure metadata visible in the turn", () => {
    const turns = buildAgentTranscript([
      { role: "user", content: "regenerate" },
      { role: "assistant", content: [], stopReason: "error", errorMessage: "SSE connection failed" }
    ]);

    expect(turns[0]).toMatchObject({
      assistantPresent: true,
      assistantStatus: "error",
      assistantError: "SSE connection failed",
      streaming: false
    });
  });
});

describe("formatAgentToolContent", () => {
  it("pretty prints JSON tool results", () => {
    expect(formatAgentToolContent([{ type: "text", text: '[{"name":"card"}]' }])).toBe('[\n  {\n    "name": "card"\n  }\n]');
  });

  it("leaves ordinary text unchanged", () => {
    expect(formatAgentToolContent([{ type: "text", text: "工具执行失败" }])).toBe("工具执行失败");
  });
});
