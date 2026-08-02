import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";
import { encodeAgentRequest, permissionForPreset } from "./permissions";
import { getAgentSessionTitleSource, normalizeAgentSessionTitle } from "./sessionTitle";

describe("Agent session titles", () => {
  it("uses the first completed user and assistant turn without exposing the permission envelope", () => {
    const messages = [
      {
        role: "user",
        content: [{ type: "text", text: encodeAgentRequest(permissionForPreset("card"), "重写开场白") }],
        timestamp: 1
      },
      { role: "assistant", content: [{ type: "text", text: "已创建开场白修改提案。" }], timestamp: 2 }
    ] as AgentMessage[];

    expect(getAgentSessionTitleSource(messages)).toEqual({
      user: "重写开场白",
      assistant: "已创建开场白修改提案。"
    });
  });

  it("waits until a turn has both user and assistant text", () => {
    expect(getAgentSessionTitleSource([
      { role: "user", content: "补全世界书", timestamp: 1 } as AgentMessage
    ])).toBeNull();
  });

  it("does not title a failed Agent turn", () => {
    expect(getAgentSessionTitleSource([
      { role: "user", content: "补全世界书", timestamp: 1 } as AgentMessage,
      { role: "assistant", content: "请求失败", stopReason: "error", errorMessage: "timeout", timestamp: 2 } as unknown as AgentMessage
    ])).toBeNull();
  });

  it("normalizes model decoration and caps the visible title", () => {
    expect(normalizeAgentSessionTitle("标题：**优化都市世界书**\n说明"))
      .toBe("优化都市世界书");
    expect(normalizeAgentSessionTitle("《重写角色开场白。》")).toBe("重写角色开场白");
    expect([...normalizeAgentSessionTitle("这是一个超过十八个字符而且非常冗长的会话标题")]).toHaveLength(18);
  });
});
