import type { AgentMessage } from "@earendil-works/pi-agent-core";

const DEFAULT_RESERVE_TOKENS = 8_000;
const TAIL_TOKEN_LIMIT = 20_000;

export function compactAgentMessages(
  messages: AgentMessage[],
  contextWindow: number,
  reserveTokens = DEFAULT_RESERVE_TOKENS
): AgentMessage[] {
  const budget = Math.max(4_000, Math.min(TAIL_TOKEN_LIMIT, contextWindow - reserveTokens));
  if (estimateMessagesTokens(messages) <= budget) {
    return messages;
  }

  const first = messages[0]?.role === "user" ? messages[0] : undefined;
  const groups = groupToolExchanges(messages.slice(first ? 1 : 0));
  const tail: AgentMessage[] = [];
  let used = first ? estimateMessagesTokens([first]) : 0;

  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index];
    const cost = estimateMessagesTokens(group);
    if (used + cost > budget) {
      break;
    }
    tail.unshift(...group);
    used += cost;
  }

  const omitted = messages.length - tail.length - (first ? 1 : 0);
  const summary: AgentMessage = {
    role: "user",
    content: `[上下文已压缩：省略 ${Math.max(0, omitted)} 条较旧消息；保留当前卡片边界与最近对话。]`,
    timestamp: Date.now()
  };
  return first ? [first, summary, ...tail] : [summary, ...tail];
}

function groupToolExchanges(messages: AgentMessage[]): AgentMessage[][] {
  const groups: AgentMessage[][] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!hasToolCalls(message)) {
      groups.push([message]);
      continue;
    }

    const group = [message];
    while (messages[index + 1]?.role === "toolResult") {
      index += 1;
      group.push(messages[index]);
    }
    groups.push(group);
  }

  return groups;
}

function hasToolCalls(message: AgentMessage): boolean {
  if (message.role !== "assistant") {
    return false;
  }

  return message.content.some((block) => block.type === "toolCall");
}

function estimateMessagesTokens(messages: AgentMessage[]): number {
  return messages.reduce((total, message) => total + Math.ceil(JSON.stringify(message).length / 4), 0);
}
