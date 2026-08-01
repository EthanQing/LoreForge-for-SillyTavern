import { describe, expect, it } from "vitest";
import { hydrateAgentMessages, type PersistedAgentEntry } from "./sessionMessages";

function entry(payload: unknown, createdAt: number): PersistedAgentEntry {
  return { payload, createdAt };
}

describe("hydrateAgentMessages", () => {
  it("does not duplicate a completed tool result from execution events", () => {
    const messages = hydrateAgentMessages([
      entry({ type: "message_end", message: { role: "user", content: "读取卡片", timestamp: 1 } }, 1),
      entry({
        type: "message_end",
        message: { role: "assistant", content: [{ type: "toolCall", id: "tool-1", name: "inspect_card", arguments: {} }], timestamp: 2 }
      }, 2),
      entry({ type: "tool_execution_start", toolCallId: "tool-1", toolName: "inspect_card" }, 3),
      entry({
        type: "tool_execution_end",
        toolCallId: "tool-1",
        toolName: "inspect_card",
        result: { content: [{ type: "text", text: "{\"name\":\"角色卡\"}" }], details: {} },
        isError: false
      }, 4),
      entry({
        type: "message_end",
        message: {
          role: "toolResult",
          toolCallId: "tool-1",
          toolName: "inspect_card",
          content: [{ type: "text", text: "{\"name\":\"角色卡\"}" }],
          isError: false,
          timestamp: 5
        }
      }, 5)
    ]);

    expect(messages).toHaveLength(3);
    expect(messages[2]).toMatchObject({ role: "toolResult", toolCallId: "tool-1" });
  });

  it("adds toolCallId when recovering an interrupted tool execution", () => {
    const messages = hydrateAgentMessages([
      entry({ type: "tool_execution_start", toolCallId: "tool-2", toolName: "inspect_validation" }, 10)
    ]);

    expect(messages).toEqual([expect.objectContaining({
      role: "toolResult",
      toolCallId: "tool-2",
      toolName: "inspect_validation",
      isError: true
    })]);
  });

  it("keeps a completed fallback usable when message_end was not persisted", () => {
    const messages = hydrateAgentMessages([
      entry({ type: "tool_execution_end", toolCallId: "tool-3", toolName: "inspect_card", result: { content: [{ type: "text", text: "结果" }] }, isError: false }, 20)
    ]);

    expect(messages).toEqual([expect.objectContaining({
      role: "toolResult",
      toolCallId: "tool-3",
      content: [{ type: "text", text: "结果" }]
    })]);
  });
});
