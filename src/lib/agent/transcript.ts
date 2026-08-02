export interface AgentTranscriptTool {
  toolName: string;
  isError: boolean;
  content: string;
}

export interface AgentTranscriptTurn {
  userText: string;
  assistantText: string;
  assistantPresent: boolean;
  assistantStatus?: "error" | "aborted" | "incomplete";
  assistantError?: string;
  tools: AgentTranscriptTool[];
  streaming: boolean;
}

interface AgentMessageRecord {
  role?: string;
  content?: unknown;
  toolName?: string;
  isError?: boolean;
  stopReason?: string;
  errorMessage?: string;
}

export function buildAgentTranscript(messages: unknown[], streamingMessage?: unknown): AgentTranscriptTurn[] {
  const turns: AgentTranscriptTurn[] = [];
  let current: AgentTranscriptTurn | undefined;

  const ensureTurn = (): AgentTranscriptTurn => {
    if (!current) {
      current = { userText: "", assistantText: "", assistantPresent: false, tools: [], streaming: false };
    }
    return current;
  };

  const flushTurn = () => {
    if (!current) return;
    if (current.userText || current.assistantText || current.tools.length > 0 || current.streaming) {
      turns.push(current);
    }
    current = undefined;
  };

  for (const rawMessage of messages) {
    const message = toAgentMessageRecord(rawMessage);
    if (!message) continue;

    if (message.role === "user") {
      flushTurn();
      current = { userText: decodeAgentRequest(readAgentMessageContent(message.content)).instruction, assistantText: "", assistantPresent: false, tools: [], streaming: false };
      continue;
    }

    if (message.role === "assistant") {
      const turn = ensureTurn();
      turn.assistantPresent = true;
      appendAssistantText(turn, readAgentMessageContent(message.content));
      setAssistantStatus(turn, message);
      continue;
    }

    if (message.role === "toolResult") {
      ensureTurn().tools.push({
        toolName: message.toolName ?? "tool",
        isError: Boolean(message.isError),
        content: readAgentMessageContent(message.content)
      });
    }
  }

  const streaming = toAgentMessageRecord(streamingMessage);
  if (streaming?.role === "assistant") {
    const text = readAgentMessageContent(streaming.content);
    const turn = ensureTurn();
    turn.assistantPresent = true;
    appendAssistantText(turn, text);
    turn.streaming = true;
  }

  flushTurn();
  return turns;
}

export function readAgentMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((item) => {
      if (!item || typeof item !== "object" || !("text" in item)) return "";
      return String((item as { text: unknown }).text ?? "");
    })
    .filter(Boolean)
    .join("\n");
}

export function formatAgentToolContent(content: unknown): string {
  const text = readAgentMessageContent(content).trim();
  if (!text) return "";

  if (!text.startsWith("{") && !text.startsWith("[")) {
    return text;
  }

  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function appendAssistantText(turn: AgentTranscriptTurn, text: string): void {
  const normalized = text.trim();
  if (!normalized) return;
  turn.assistantText = turn.assistantText ? `${turn.assistantText}\n\n${normalized}` : normalized;
}

function setAssistantStatus(turn: AgentTranscriptTurn, message: AgentMessageRecord): void {
  if (message.stopReason === "aborted") {
    turn.assistantStatus = "aborted";
    turn.assistantError = message.errorMessage;
    return;
  }
  if (message.stopReason === "length") {
    turn.assistantStatus = "incomplete";
    turn.assistantError = "Agent 输出达到长度限制，内容可能不完整。";
    return;
  }
  if (message.stopReason === "error" || message.errorMessage) {
    turn.assistantStatus = "error";
    turn.assistantError = message.errorMessage;
  }
}

function toAgentMessageRecord(message: unknown): AgentMessageRecord | undefined {
  if (!message || typeof message !== "object") return undefined;
  return message as AgentMessageRecord;
}
import { decodeAgentRequest } from "./permissions";
