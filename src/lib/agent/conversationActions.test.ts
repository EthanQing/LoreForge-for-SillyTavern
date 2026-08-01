import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { getConversationActionTarget, getLatestTurnToolCallIds, getMessagesBeforeLastUser } from "./conversationActions";

function messages(value: unknown[]): AgentMessage[] {
  return value as AgentMessage[];
}

describe("conversation actions", () => {
  it("only enables regeneration when no user message follows the latest assistant", () => {
    const continued = messages([
      { role: "user", content: "第一轮", timestamp: 1 },
      { role: "assistant", content: [], timestamp: 2 },
      { role: "user", content: "第二轮", timestamp: 3 }
    ]);
    const latest = messages([
      { role: "user", content: "最后一轮", timestamp: 1 },
      { role: "assistant", content: [], timestamp: 2 }
    ]);

    expect(getConversationActionTarget(continued).canRegenerate).toBe(false);
    expect(getConversationActionTarget(latest).canRegenerate).toBe(true);
  });

  it("keeps the context before the last user message for replacement", () => {
    const input = messages([
      { role: "user", content: "旧问题", timestamp: 1 },
      { role: "assistant", content: [], timestamp: 2 },
      { role: "user", content: "需要重发", timestamp: 3 },
      { role: "assistant", content: [], timestamp: 4 }
    ]);

    expect(getMessagesBeforeLastUser(input)).toHaveLength(2);
    expect((getMessagesBeforeLastUser(input)[0] as { content: string }).content).toBe("旧问题");
  });

  it("finds tool calls belonging to the latest user turn", () => {
    const input = messages([
      { role: "user", content: "上一轮", timestamp: 1 },
      { role: "assistant", content: [{ type: "toolCall", id: "old-tool" }], timestamp: 2 },
      { role: "user", content: "最后一轮", timestamp: 3 },
      { role: "assistant", content: [{ type: "toolCall", id: "new-tool" }], timestamp: 4 },
      { role: "toolResult", toolCallId: "new-tool", content: [], timestamp: 5 }
    ]);

    expect(getLatestTurnToolCallIds(input)).toEqual(["new-tool"]);
  });

  it("treats an empty streaming assistant as the current regenerable turn", () => {
    const input = messages([{ role: "user", content: "正在生成", timestamp: 1 }]);

    expect(getConversationActionTarget(input, { role: "assistant", content: [], timestamp: 2 } as unknown as AgentMessage).canRegenerate).toBe(true);
  });
});
