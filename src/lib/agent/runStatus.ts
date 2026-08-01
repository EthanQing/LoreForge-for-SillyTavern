import type { AgentMessage } from "@earendil-works/pi-agent-core";

export type AgentRunStatus = "completed" | "failed" | "aborted" | "incomplete";

export interface AgentRunOutcome {
  status: AgentRunStatus;
  message?: string;
}

type AssistantMessage = Extract<AgentMessage, { role: "assistant" }>;

export function getAgentRunOutcome(messages: readonly AgentMessage[], stateErrorMessage?: string): AgentRunOutcome {
  const assistant = [...messages].reverse().find(isAssistantMessage);
  if (!assistant) {
    return { status: "failed", message: "Agent 未返回助手消息。" };
  }

  if (assistant.stopReason === "aborted") {
    return { status: "aborted", message: assistant.errorMessage ?? "本轮 Agent 已中断。" };
  }

  if (assistant.stopReason === "length") {
    return { status: "incomplete", message: "Agent 输出达到长度限制，内容可能不完整。" };
  }

  if (assistant.stopReason === "error" || assistant.errorMessage || stateErrorMessage) {
    return { status: "failed", message: assistant.errorMessage ?? stateErrorMessage ?? "Agent 运行失败。" };
  }

  return { status: "completed" };
}

export function getAgentRunStatusMessage(outcome: AgentRunOutcome): string {
  switch (outcome.status) {
    case "failed":
      return `Agent 运行失败：${outcome.message ?? "未知错误"}`;
    case "aborted":
      return "Agent 已中断。";
    case "incomplete":
      return "Agent 输出未完成，可重新生成。";
    default:
      return "Agent 运行完成。";
  }
}

function isAssistantMessage(message: AgentMessage): message is AssistantMessage {
  return message.role === "assistant";
}
