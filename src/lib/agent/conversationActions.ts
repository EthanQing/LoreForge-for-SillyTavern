import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { SaveCardSnapshotResult } from "../../app/useProjectActions";
import type { CharacterCardV3 } from "../schema";

interface MessageRecord {
  role?: string;
  content?: unknown;
}

export interface ConversationActionTarget {
  lastUserIndex: number;
  lastAssistantIndex: number;
  lastUserMessage?: AgentMessage;
  canRegenerate: boolean;
}

export function getConversationActionTarget(messages: readonly AgentMessage[], streamingMessage?: AgentMessage): ConversationActionTarget {
  let lastUserIndex = -1;
  let lastAssistantIndex = -1;
  let lastUserMessage: AgentMessage | undefined;

  messages.forEach((message, index) => {
    const role = toMessageRecord(message).role;
    if (role === "user") {
      lastUserIndex = index;
      lastUserMessage = message;
    }
    if (role === "assistant") {
      lastAssistantIndex = index;
    }
  });

  if (toMessageRecord(streamingMessage).role === "assistant") {
    lastAssistantIndex = messages.length;
  }

  return {
    lastUserIndex,
    lastAssistantIndex,
    lastUserMessage,
    canRegenerate: lastAssistantIndex > lastUserIndex && Boolean(lastUserMessage)
  };
}

export function getMessagesBeforeLastUser(messages: readonly AgentMessage[]): AgentMessage[] {
  const target = getConversationActionTarget(messages);
  if (target.lastUserIndex < 0) return [];
  return [...messages.slice(0, target.lastUserIndex)];
}

export function getLatestTurnToolCallIds(messages: readonly AgentMessage[]): string[] {
  const target = getConversationActionTarget(messages);
  if (target.lastUserIndex < 0) return [];

  const ids = new Set<string>();
  messages.slice(target.lastUserIndex + 1).forEach((message) => {
    const record = toMessageRecord(message);
    if (record.role !== "assistant" || !Array.isArray(record.content)) return;
    record.content.forEach((content) => {
      if (!content || typeof content !== "object") return;
      const item = content as { type?: unknown; id?: unknown };
      if (item.type === "toolCall" && typeof item.id === "string" && item.id.trim()) {
        ids.add(item.id);
      }
    });
  });
  return [...ids];
}

export async function saveRollbackCard(
  rollbackCard: CharacterCardV3,
  originalCard: CharacterCardV3,
  applyAgentCard: (card: CharacterCardV3, status: string) => void,
  saveCardSnapshot: (
    card: CharacterCardV3,
    options: { promptIfUnbound: false; savedStatus: string }
  ) => Promise<SaveCardSnapshotResult>
): Promise<void> {
  applyAgentCard(rollbackCard, "正在回退上一轮 Agent 应用。");
  const saveResult = await saveCardSnapshot(rollbackCard, { promptIfUnbound: false, savedStatus: "已回退上一轮 Agent 应用。" });
  if (saveResult.state === "failed") {
    applyAgentCard(originalCard, "回退保存失败，已恢复重新生成前的卡片状态。");
    throw new Error(`保存回退结果失败，已恢复操作前的卡片状态，已停止重新生成或重发：${saveResult.error}`);
  }
}

function toMessageRecord(message: AgentMessage | undefined): MessageRecord {
  return message && typeof message === "object" ? message as MessageRecord : {};
}
