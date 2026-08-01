import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { getAgentRunOutcome, getAgentRunStatusMessage } from "./runStatus";

function messages(value: unknown[]): AgentMessage[] {
  return value as AgentMessage[];
}

describe("Agent run status", () => {
  it("recognizes a completed assistant response", () => {
    const outcome = getAgentRunOutcome(messages([{ role: "assistant", content: [], stopReason: "stop" }]));

    expect(outcome).toEqual({ status: "completed" });
    expect(getAgentRunStatusMessage(outcome)).toBe("Agent 运行完成。");
  });

  it("exposes provider failures instead of treating them as completion", () => {
    const outcome = getAgentRunOutcome(messages([{ role: "assistant", content: [], stopReason: "error", errorMessage: "SSE connection failed" }]));

    expect(outcome).toEqual({ status: "failed", message: "SSE connection failed" });
    expect(getAgentRunStatusMessage(outcome)).toContain("SSE connection failed");
  });

  it("distinguishes an aborted run", () => {
    const outcome = getAgentRunOutcome(messages([{ role: "assistant", content: [], stopReason: "aborted" }]));

    expect(outcome.status).toBe("aborted");
    expect(getAgentRunStatusMessage(outcome)).toBe("Agent 已中断。");
  });

  it("marks a length-limited response as incomplete", () => {
    const outcome = getAgentRunOutcome(messages([{ role: "assistant", content: [], stopReason: "length" }]));

    expect(outcome).toEqual({ status: "incomplete", message: "Agent 输出达到长度限制，内容可能不完整。" });
    expect(getAgentRunStatusMessage(outcome)).toBe("Agent 输出未完成，可重新生成。");
  });

  it("treats a run with no assistant response as a failure", () => {
    expect(getAgentRunOutcome(messages([{ role: "user", content: "hello" }]))).toEqual({
      status: "failed",
      message: "Agent 未返回助手消息。"
    });
  });
});
