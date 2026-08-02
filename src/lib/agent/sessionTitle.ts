import { invoke } from "@tauri-apps/api/core";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AiConnectionProfile } from "./contracts";
import { buildAgentTranscript } from "./transcript";

export const PENDING_AGENT_SESSION_TITLE = "新会话";

export interface AgentSessionTitleSource {
  user: string;
  assistant: string;
}

export function getAgentSessionTitleSource(messages: AgentMessage[]): AgentSessionTitleSource | null {
  const turn = buildAgentTranscript(messages).find((item) => item.userText.trim() && item.assistantText.trim() && !item.assistantStatus);
  if (!turn) return null;
  return {
    user: truncate(turn.userText.trim(), 800),
    assistant: truncate(turn.assistantText.trim(), 1_200)
  };
}

export function normalizeAgentSessionTitle(value: string): string {
  const firstLine = value.split(/\r?\n/).find((line) => line.trim())?.trim() ?? "";
  const withoutPrefix = firstLine.replace(/^(?:标题|会话标题|title)\s*[:：]\s*/i, "");
  const plain = withoutPrefix
    .replace(/^#{1,6}\s*/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/^\*{1,2}|\*{1,2}$/g, "")
    .replace(/^[`'"“”‘’《》【】\[\]]+|[`'"“”‘’《》【】\[\]]+$/g, "")
    .replace(/[。！？!?；;：:，,、…]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return truncate(plain, 18);
}

export async function generateAgentSessionTitle(
  profile: AiConnectionProfile,
  source: AgentSessionTitleSource
): Promise<string> {
  await invoke("configure_ai_profile", {
    profile: {
      id: profile.id,
      baseUrl: profile.baseUrl,
      credentialId: profile.credentialId,
      allowInsecureHttp: profile.allowInsecureHttp
    }
  });
  const { tauriFetch } = await import("./tauriFetch");
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), Math.min(profile.timeoutMs, 30_000));
  try {
    const response = await tauriFetch(`${profile.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      profileId: profile.id,
      allowInsecureHttp: profile.allowInsecureHttp,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-card-agent-profile": profile.id,
        "x-card-agent-credential": profile.credentialId
      },
      body: JSON.stringify({
        model: profile.model,
        messages: [
          {
            role: "system",
            content: "为角色卡编辑会话生成简体中文短标题。概括用户的主要任务，使用 4 至 12 个汉字；只输出标题，不要引号、标点、Markdown 或解释。"
          },
          {
            role: "user",
            content: `用户要求：\n${source.user}\n\nAgent 处理摘要：\n${source.assistant}`
          }
        ],
        stream: false,
        temperature: Math.min(profile.temperature, 0.3),
        max_tokens: 64,
        ...(profile.kind === "deepseek" ? { thinking: { type: "disabled" } } : {})
      })
    });
    if (!response.ok) throw new Error(`AI title request failed (${response.status}).`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const title = normalizeAgentSessionTitle(payload.choices?.[0]?.message?.content ?? "");
    if (!title || title === PENDING_AGENT_SESSION_TITLE) throw new Error("AI title response was empty.");
    return title;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function truncate(value: string, maxLength: number): string {
  const characters = [...value];
  return characters.length > maxLength ? characters.slice(0, maxLength).join("") : value;
}
