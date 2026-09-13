import { describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { createBlankCard } from "../schema";
import { getConversationActionTarget, getLatestTurnToolCallIds, getMessagesBeforeLastUser, saveRollbackCard } from "./conversationActions";

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

  it.each(["saved", "draft-only"] as const)("keeps a %s rollback result", async (state) => {
    const rollbackCard = createBlankCard();
    rollbackCard.data.name = "Before Agent";
    const originalCard = createBlankCard();
    originalCard.data.name = "After Agent";
    const applyAgentCard = vi.fn();
    const saveCardSnapshot = vi.fn().mockResolvedValue({ state });

    await saveRollbackCard(rollbackCard, originalCard, applyAgentCard, saveCardSnapshot);

    expect(applyAgentCard).toHaveBeenCalledTimes(1);
    expect(applyAgentCard).toHaveBeenCalledWith(rollbackCard, "正在回退上一轮 Agent 应用。");
    expect(saveCardSnapshot).toHaveBeenCalledWith(rollbackCard, {
      promptIfUnbound: false,
      savedStatus: "已回退上一轮 Agent 应用。"
    });
  });

  it("restores the original card and reports the file error when rollback saving fails", async () => {
    const rollbackCard = createBlankCard();
    rollbackCard.data.name = "Before Agent";
    const originalCard = createBlankCard();
    originalCard.data.name = "After Agent";
    const applyAgentCard = vi.fn();
    const saveCardSnapshot = vi.fn().mockResolvedValue({ state: "failed", error: "Access denied" });

    await expect(saveRollbackCard(rollbackCard, originalCard, applyAgentCard, saveCardSnapshot))
      .rejects.toThrow("保存回退结果失败，已恢复操作前的卡片状态，已停止重新生成或重发：Access denied");
    expect(applyAgentCard).toHaveBeenNthCalledWith(1, rollbackCard, "正在回退上一轮 Agent 应用。");
    expect(applyAgentCard).toHaveBeenNthCalledWith(2, originalCard, "回退保存失败，已恢复重新生成前的卡片状态。");
    expect(saveCardSnapshot).toHaveBeenCalledTimes(1);
    expect(saveCardSnapshot).toHaveBeenCalledWith(rollbackCard, {
      promptIfUnbound: false,
      savedStatus: "已回退上一轮 Agent 应用。"
    });
  });
});
