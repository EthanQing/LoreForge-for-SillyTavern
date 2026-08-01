import type { AgentMessage } from "@earendil-works/pi-agent-core";

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

function toMessageRecord(message: AgentMessage | undefined): MessageRecord {
  return message && typeof message === "object" ? message as MessageRecord : {};
}
