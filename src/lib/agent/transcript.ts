export interface AgentTranscriptTool {
  toolName: string;
  isError: boolean;
  content: string;
}

export interface AgentTranscriptTurn {
  userText: string;
  assistantText: string;
  tools: AgentTranscriptTool[];
  streaming: boolean;
}

interface AgentMessageRecord {
  role?: string;
  content?: unknown;
  toolName?: string;
  isError?: boolean;
}

export function buildAgentTranscript(messages: unknown[], streamingMessage?: unknown): AgentTranscriptTurn[] {
  const turns: AgentTranscriptTurn[] = [];
  let current: AgentTranscriptTurn | undefined;

  const ensureTurn = (): AgentTranscriptTurn => {
    if (!current) {
      current = { userText: "", assistantText: "", tools: [], streaming: false };
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
      current = { userText: readAgentMessageContent(message.content), assistantText: "", tools: [], streaming: false };
      continue;
    }

    if (message.role === "assistant") {
      appendAssistantText(ensureTurn(), readAgentMessageContent(message.content));
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
    if (text) {
      const turn = ensureTurn();
      appendAssistantText(turn, text);
      turn.streaming = true;
    }
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

function toAgentMessageRecord(message: unknown): AgentMessageRecord | undefined {
  if (!message || typeof message !== "object") return undefined;
  return message as AgentMessageRecord;
}
