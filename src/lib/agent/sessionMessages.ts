import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ToolResultMessage } from "@earendil-works/pi-ai";

export interface PersistedAgentEntry {
  payload?: unknown;
  createdAt?: number;
}

interface ToolExecutionRecord {
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError: boolean;
  timestamp: number;
}

export function hydrateAgentMessages(entries: readonly PersistedAgentEntry[]): AgentMessage[] {
  let messages: AgentMessage[] = [];
  const inFlight = new Map<string, { toolName: string; timestamp: number }>();
  const completed = new Map<string, ToolExecutionRecord>();
  const restoredToolResults = new Set<string>();

  for (const entry of entries) {
    const payload = asRecord(entry.payload);
    if (!payload) continue;

    const type = readString(payload.type);
    if (type === "agent_conversation_branch") {
      messages = restoreBranchMessages(payload.baseMessages, restoredToolResults);
      inFlight.clear();
      completed.clear();
      continue;
    }

    if (type === "tool_execution_start") {
      const toolCallId = readString(payload.toolCallId);
      if (toolCallId) {
        inFlight.set(toolCallId, {
          toolName: readString(payload.toolName) ?? "tool",
          timestamp: entry.createdAt ?? Date.now()
        });
      }
      continue;
    }

    if (type === "tool_execution_end") {
      const toolCallId = readString(payload.toolCallId);
      if (!toolCallId) continue;
      inFlight.delete(toolCallId);
      completed.set(toolCallId, {
        toolCallId,
        toolName: readString(payload.toolName) ?? "tool",
        result: payload.result,
        isError: Boolean(payload.isError),
        timestamp: entry.createdAt ?? Date.now()
      });
      continue;
    }

    if (type !== "message_end") continue;
    const message = asRecord(payload.message);
    if (!message || typeof message.role !== "string") continue;
    if (message.role === "toolResult") {
      const toolCallId = readString(message.toolCallId);
      if (!toolCallId) continue;
      restoredToolResults.add(toolCallId);
      completed.delete(toolCallId);
    }
    messages.push(message as unknown as AgentMessage);
  }

  for (const record of completed.values()) {
    if (!restoredToolResults.has(record.toolCallId)) {
      messages.push(createToolResultMessage(record));
    }
  }
  for (const [toolCallId, execution] of inFlight) {
    if (!restoredToolResults.has(toolCallId)) {
      messages.push({
        role: "toolResult",
        toolCallId,
        toolName: execution.toolName,
        content: [{ type: "text", text: "上次运行在工具返回前中断。" }],
        isError: true,
        timestamp: execution.timestamp
      });
    }
  }

  return messages;
}

function restoreBranchMessages(value: unknown, restoredToolResults: Set<string>): AgentMessage[] {
  restoredToolResults.clear();
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    const message = asRecord(item);
    if (!message || typeof message.role !== "string") return [];
    if (message.role === "toolResult") {
      const toolCallId = readString(message.toolCallId);
      if (!toolCallId) return [];
      restoredToolResults.add(toolCallId);
    }
    return [message as unknown as AgentMessage];
  });
}

function createToolResultMessage(record: ToolExecutionRecord): ToolResultMessage {
  const result = asRecord(record.result);
  const content: ToolResultMessage["content"] = Array.isArray(result?.content)
    ? result.content as ToolResultMessage["content"]
    : [{ type: "text", text: JSON.stringify(record.result ?? null) }];

  return {
    role: "toolResult",
    toolCallId: record.toolCallId,
    toolName: record.toolName,
    content,
    ...(result && "details" in result ? { details: result.details } : {}),
    ...(result && Array.isArray(result.addedToolNames) ? { addedToolNames: result.addedToolNames as string[] } : {}),
    isError: record.isError,
    timestamp: record.timestamp
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
