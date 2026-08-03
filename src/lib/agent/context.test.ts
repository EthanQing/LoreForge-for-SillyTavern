import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { compactAgentMessages } from "./context";

function messages(value: unknown[]): AgentMessage[] {
  return value as AgentMessage[];
}

describe("compactAgentMessages", () => {
  it("does not orphan tool results when trimming oversized inspection context", () => {
    const input = messages([
      { role: "user", content: "补充世界书", timestamp: 1 },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "inspect", name: "inspect_card", arguments: {} }],
        timestamp: 2
      },
      {
        role: "toolResult",
        toolCallId: "inspect",
        toolName: "inspect_card",
        content: [{ type: "text", text: "x".repeat(16_000) }],
        isError: false,
        timestamp: 3
      },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "propose", name: "propose_lorebook_injection", arguments: {} }],
        timestamp: 4
      },
      {
        role: "toolResult",
        toolCallId: "propose",
        toolName: "propose_lorebook_injection",
        content: [{ type: "text", text: "提案已创建" }],
        isError: false,
        timestamp: 5
      }
    ]);

    const compacted = compactAgentMessages(input, 12_000);

    expect(compacted.map((message) => message.role)).toEqual(["user", "user", "assistant", "toolResult"]);
    expect(compacted[2]).toMatchObject({
      role: "assistant",
      content: [expect.objectContaining({ type: "toolCall", id: "propose" })]
    });
    expect(compacted[3]).toMatchObject({ role: "toolResult", toolCallId: "propose" });
  });

  it("keeps every result from a parallel tool-call message in the same group", () => {
    const input = messages([
      { role: "user", content: "检查卡片", timestamp: 1 },
      { role: "assistant", content: [{ type: "text", text: "x".repeat(16_000) }], timestamp: 2 },
      {
        role: "assistant",
        content: [
          { type: "toolCall", id: "card", name: "inspect_card", arguments: {} },
          { type: "toolCall", id: "validation", name: "inspect_validation", arguments: {} }
        ],
        timestamp: 3
      },
      { role: "toolResult", toolCallId: "card", toolName: "inspect_card", content: [], isError: false, timestamp: 4 },
      { role: "toolResult", toolCallId: "validation", toolName: "inspect_validation", content: [], isError: false, timestamp: 5 }
    ]);

    const compacted = compactAgentMessages(input, 12_000);

    expect(compacted.map((message) => message.role)).toEqual(["user", "user", "assistant", "toolResult", "toolResult"]);
  });
});
