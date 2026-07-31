import { invoke } from "@tauri-apps/api/core";
import type { AiConnectionProfile } from "./agent/contracts";
import { tauriFetch } from "./agent/tauriFetch";

export type AiProviderProfile = "deepseek" | "openai-compatible";
export type AiThinkingMode = "enabled" | "disabled";
export type AiThinkingEffort = "high" | "max";

export interface AiModel {
  id: string;
  ownedBy?: string;
}

export interface AiSettings {
  enabled: boolean;
  providerProfile: AiProviderProfile;
  profileId: string;
  credentialId: string;
  baseUrl: string;
  /** Transient migration field; the store never persists it. */
  apiKey: string;
  model: string;
  manualModelInput: boolean;
  availableModels: AiModel[];
  stream: boolean;
  showReasoning: boolean;
  thinkingMode: AiThinkingMode;
  thinkingEffort: AiThinkingEffort;
  thinkingLevel: AiConnectionProfile["thinkingLevel"];
  toolCalling: AiConnectionProfile["toolCalling"];
  contextWindow: number;
  allowInsecureHttp: boolean;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface AiChatRequestOptions {
  jsonResponse?: boolean;
  probeTools?: boolean;
}

export interface AiChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface AiStreamEvent {
  requestId: string;
  event: "start" | "delta" | "done";
  contentDelta: string;
  reasoningDelta: string;
  message?: string | null;
}

export interface AiChatResult {
  content: string;
  reasoning: string;
  model: string;
  toolCalling?: "supported" | "unsupported" | "unknown";
}

export const AI_MAX_OUTPUT_TOKENS = 384_000;
export const AI_MAX_TIMEOUT_MS = 1_800_000;
export const AI_DEFAULT_CONTEXT_WINDOW = 128_000;

export const defaultAiSettings: AiSettings = {
  enabled: true,
  providerProfile: "deepseek",
  profileId: "deepseek-default",
  credentialId: "deepseek-default",
  baseUrl: "https://api.deepseek.com",
  apiKey: "",
  model: "deepseek-v4-flash",
  manualModelInput: false,
  availableModels: [],
  stream: true,
  showReasoning: true,
  thinkingMode: "enabled",
  thinkingEffort: "high",
  thinkingLevel: "high",
  toolCalling: "unknown",
  contextWindow: AI_DEFAULT_CONTEXT_WINDOW,
  allowInsecureHttp: false,
  temperature: 0.4,
  maxOutputTokens: 8192,
  timeoutMs: 60_000
};

export function normalizeAiSettings(value: unknown): AiSettings {
  if (!value || typeof value !== "object") {
    return { ...defaultAiSettings };
  }
  const raw = value as Partial<AiSettings>;
  const rawThinkingEffort = (value as { thinkingEffort?: unknown }).thinkingEffort;
  const providerProfile = raw.providerProfile === "openai-compatible" ? "openai-compatible" : "deepseek";
  const fallbackProfileId = providerProfile + "-default";
  return {
    ...defaultAiSettings,
    ...raw,
    providerProfile,
    profileId: typeof raw.profileId === "string" && raw.profileId.trim() ? raw.profileId.trim() : fallbackProfileId,
    credentialId: typeof raw.credentialId === "string" && raw.credentialId.trim() ? raw.credentialId.trim() : fallbackProfileId,
    baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl : defaultAiSettings.baseUrl,
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey : "",
    model: typeof raw.model === "string" ? raw.model : defaultAiSettings.model,
    manualModelInput: typeof raw.manualModelInput === "boolean" ? raw.manualModelInput : defaultAiSettings.manualModelInput,
    availableModels: Array.isArray(raw.availableModels)
      ? raw.availableModels.filter((model): model is AiModel => Boolean(model) && typeof model.id === "string")
      : [],
    stream: typeof raw.stream === "boolean" ? raw.stream : defaultAiSettings.stream,
    showReasoning: typeof raw.showReasoning === "boolean" ? raw.showReasoning : defaultAiSettings.showReasoning,
    thinkingMode: isThinkingMode(raw.thinkingMode)
      ? raw.thinkingMode
      : rawThinkingEffort === "off"
        ? "disabled"
        : defaultAiSettings.thinkingMode,
    thinkingEffort: isThinkingEffort(rawThinkingEffort) ? rawThinkingEffort : defaultAiSettings.thinkingEffort,
    thinkingLevel: isThinkingLevel(raw.thinkingLevel)
      ? raw.thinkingLevel
      : rawThinkingEffort === "max"
        ? "max"
        : rawThinkingEffort === "high"
          ? "high"
          : defaultAiSettings.thinkingLevel,
    toolCalling: isToolCalling(raw.toolCalling) ? raw.toolCalling : "unknown",
    contextWindow: Math.trunc(clampNumber(raw.contextWindow, 8_000, 2_000_000, defaultAiSettings.contextWindow)),
    allowInsecureHttp: typeof raw.allowInsecureHttp === "boolean" ? raw.allowInsecureHttp : false,
    temperature: clampNumber(raw.temperature, 0, 2, defaultAiSettings.temperature),
    maxOutputTokens: Math.trunc(clampNumber(raw.maxOutputTokens, 1, AI_MAX_OUTPUT_TOKENS, defaultAiSettings.maxOutputTokens)),
    timeoutMs: Math.trunc(clampNumber(raw.timeoutMs, 1_000, AI_MAX_TIMEOUT_MS, defaultAiSettings.timeoutMs))
  };
}

export function toAiConnectionProfile(settings: AiSettings): AiConnectionProfile {
  return {
    id: settings.profileId,
    kind: settings.providerProfile,
    baseUrl: settings.baseUrl,
    model: settings.model,
    credentialId: settings.credentialId,
    contextWindow: settings.contextWindow,
    maxOutputTokens: settings.maxOutputTokens,
    timeoutMs: settings.timeoutMs,
    temperature: settings.temperature,
    thinkingLevel: settings.thinkingMode === "disabled" ? "off" : settings.thinkingLevel,
    toolCalling: settings.toolCalling,
    allowInsecureHttp: settings.allowInsecureHttp
  };
}

export async function storeAiCredential(settings: AiSettings, secret = settings.apiKey): Promise<void> {
  if (!secret.trim()) {
    throw new Error("API Key 不能为空。");
  }
  await invoke("store_ai_credential", {
    request: { credentialId: settings.credentialId, secret: secret.trim() }
  });
}

export async function deleteAiCredential(settings: AiSettings): Promise<void> {
  await invoke("delete_ai_credential", { credentialId: settings.credentialId });
}

export async function migrateLegacyAiCredential(settings: AiSettings): Promise<boolean> {
  if (!settings.apiKey.trim()) {
    return true;
  }
  try {
    await storeAiCredential(settings);
    return true;
  } catch {
    return false;
  }
}

export async function configureAiProfile(settings: AiSettings): Promise<void> {
  await invoke("configure_ai_profile", {
    profile: {
      id: settings.profileId,
      baseUrl: settings.baseUrl,
      credentialId: settings.credentialId,
      allowInsecureHttp: settings.allowInsecureHttp
    }
  });
}

export async function fetchAiModels(settings: AiSettings): Promise<AiModel[]> {
  await ensureCredential(settings);
  await configureAiProfile(settings);
  const models = await invoke<Array<{ id: string; ownedBy?: string; owned_by?: string }>>("fetch_ai_models", {
    profileId: settings.profileId
  });
  return models.map((model) => ({ id: model.id, ownedBy: model.ownedBy ?? model.owned_by }));
}

export async function testAiConnection(settings: AiSettings, onStream?: (event: AiStreamEvent) => void): Promise<AiChatResult> {
  const testSettings = { ...settings, stream: false, maxOutputTokens: Math.min(settings.maxOutputTokens, 256) };
  const messages: AiChatMessage[] = [
    { role: "system", content: "Respond with a short connection acknowledgement." },
    { role: "user", content: "Connection test." }
  ];
  try {
    return await runAiChat(testSettings, messages, onStream, { probeTools: true });
  } catch {
    const fallback = await runAiChat(testSettings, messages, onStream);
    return { ...fallback, toolCalling: "unsupported" };
  }
}

export async function sendAiChat(
  settings: AiSettings,
  messages: AiChatMessage[],
  onStream?: (event: AiStreamEvent) => void,
  options?: AiChatRequestOptions
): Promise<AiChatResult> {
  return await runAiChat(settings, messages, onStream, options);
}

async function runAiChat(
  settings: AiSettings,
  messages: AiChatMessage[],
  onStream?: (event: AiStreamEvent) => void,
  options?: AiChatRequestOptions
): Promise<AiChatResult> {
  await ensureCredential(settings);
  await configureAiProfile(settings);
  const requestId = createRequestId();
  const response = await tauriFetch(settings.baseUrl.replace(/\/+$/, "") + "/chat/completions", {
    method: "POST",
    profileId: settings.profileId,
    allowInsecureHttp: settings.allowInsecureHttp,
    headers: {
      "content-type": "application/json",
      accept: settings.stream ? "text/event-stream" : "application/json",
      "x-card-agent-profile": settings.profileId,
      "x-card-agent-credential": settings.credentialId
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      stream: Boolean(settings.stream),
      temperature: settings.temperature,
      max_tokens: settings.maxOutputTokens,
      ...(options?.jsonResponse ? { response_format: { type: "json_object" } } : {}),
      ...(options?.probeTools ? {
        tools: [{ type: "function", function: { name: "card_agent_probe", description: "A no-side-effect capability probe.", parameters: { type: "object", properties: {}, additionalProperties: false } } }],
        tool_choice: { type: "function", function: { name: "card_agent_probe" } }
      } : {}),
      ...(settings.providerProfile === "deepseek"
        ? { thinking: { type: settings.thinkingMode === "enabled" ? "enabled" : "disabled" }, reasoning_effort: settings.thinkingEffort }
        : {})
    })
  });
  if (!response.ok) {
    throw new Error("AI request failed (" + response.status + ").");
  }
  if (!settings.stream) {
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string; reasoning_content?: string; tool_calls?: unknown[] } }>; model?: string };
    const message = payload.choices?.[0]?.message;
    return { content: message?.content ?? "", reasoning: message?.reasoning_content ?? "", model: payload.model ?? settings.model, toolCalling: options?.probeTools ? (message?.tool_calls?.length ? "supported" : "unsupported") : undefined };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("AI response did not contain a stream.");
  }
  let buffer = "";
  let content = "";
  let reasoning = "";
  onStream?.({ requestId, event: "start", contentDelta: "", reasoningDelta: "" });
  const decoder = new TextDecoder();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const payload = line.trim().replace(/^data:\s*/, "");
      if (!payload || payload === "[DONE]") {
        continue;
      }
      try {
        const delta = (JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }> }).choices?.[0]?.delta;
        const contentDelta = delta?.content ?? "";
        const reasoningDelta = delta?.reasoning_content ?? "";
        content += contentDelta;
        reasoning += reasoningDelta;
        if (contentDelta || reasoningDelta) {
          onStream?.({ requestId, event: "delta", contentDelta, reasoningDelta });
        }
      } catch {
        // Ignore provider comments/keep-alives.
      }
    }
  }
  onStream?.({ requestId, event: "done", contentDelta: "", reasoningDelta: "" });
  return { content, reasoning, model: settings.model };
}

async function ensureCredential(settings: AiSettings): Promise<void> {
  if (settings.apiKey.trim()) {
    await storeAiCredential(settings);
  }
}

function isThinkingMode(value: unknown): value is AiThinkingMode {
  return value === "enabled" || value === "disabled";
}

function isThinkingEffort(value: unknown): value is AiThinkingEffort {
  return value === "high" || value === "max";
}

function isThinkingLevel(value: unknown): value is AiSettings["thinkingLevel"] {
  return value === "off" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh" || value === "max";
}

function isToolCalling(value: unknown): value is AiSettings["toolCalling"] {
  return value === "unknown" || value === "supported" || value === "unsupported";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? "ai-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}
