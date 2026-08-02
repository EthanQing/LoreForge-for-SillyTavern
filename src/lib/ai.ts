import { invoke } from "@tauri-apps/api/core";
import type { AiConnectionProfile } from "./agent/contracts";

export type AiProviderProfile = "deepseek" | "openai-compatible";

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
  /** Transient credential input; the store never persists it. */
  apiKey: string;
  model: string;
  manualModelInput: boolean;
  availableModels: AiModel[];
  thinkingLevel: AiConnectionProfile["thinkingLevel"];
  toolCalling: AiConnectionProfile["toolCalling"];
  contextWindow: number;
  allowInsecureHttp: boolean;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface AiConnectionTestResult {
  content: string;
  model: string;
  toolCalling: "supported" | "unsupported";
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
  thinkingLevel: "high",
  toolCalling: "unknown",
  contextWindow: AI_DEFAULT_CONTEXT_WINDOW,
  allowInsecureHttp: false,
  temperature: 0.4,
  maxOutputTokens: 8192,
  timeoutMs: 60_000
};

export function normalizeAiSettings(value: unknown): AiSettings {
  if (!value || typeof value !== "object") return { ...defaultAiSettings };
  const raw = value as Partial<AiSettings>;
  const providerProfile = raw.providerProfile === "openai-compatible" ? "openai-compatible" : "deepseek";
  const fallbackProfileId = `${providerProfile}-default`;
  return {
    ...defaultAiSettings,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : defaultAiSettings.enabled,
    providerProfile,
    profileId: typeof raw.profileId === "string" && raw.profileId.trim() ? raw.profileId.trim() : fallbackProfileId,
    credentialId: typeof raw.credentialId === "string" && raw.credentialId.trim() ? raw.credentialId.trim() : fallbackProfileId,
    baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl : defaultAiSettings.baseUrl,
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey : "",
    model: typeof raw.model === "string" ? raw.model : defaultAiSettings.model,
    manualModelInput: typeof raw.manualModelInput === "boolean" ? raw.manualModelInput : defaultAiSettings.manualModelInput,
    availableModels: Array.isArray(raw.availableModels) ? raw.availableModels.filter((model): model is AiModel => Boolean(model) && typeof model.id === "string") : [],
    thinkingLevel: isThinkingLevel(raw.thinkingLevel) ? raw.thinkingLevel : defaultAiSettings.thinkingLevel,
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
    thinkingLevel: settings.thinkingLevel,
    toolCalling: settings.toolCalling,
    allowInsecureHttp: settings.allowInsecureHttp
  };
}

export async function storeAiCredential(settings: AiSettings, secret = settings.apiKey): Promise<void> {
  if (!secret.trim()) throw new Error("API Key 不能为空。");
  await invoke("store_ai_credential", { request: { credentialId: settings.credentialId, secret: secret.trim() } });
}

export async function deleteAiCredential(settings: AiSettings): Promise<void> {
  await invoke("delete_ai_credential", { credentialId: settings.credentialId });
}

export async function configureAiProfile(settings: AiSettings): Promise<void> {
  await invoke("configure_ai_profile", {
    profile: { id: settings.profileId, baseUrl: settings.baseUrl, credentialId: settings.credentialId, allowInsecureHttp: settings.allowInsecureHttp }
  });
}

export async function fetchAiModels(settings: AiSettings): Promise<AiModel[]> {
  await ensureCredential(settings);
  await configureAiProfile(settings);
  const models = await invoke<Array<{ id: string; ownedBy?: string; owned_by?: string }>>("fetch_ai_models", { profileId: settings.profileId });
  return models.map((model) => ({ id: model.id, ownedBy: model.ownedBy ?? model.owned_by }));
}

export async function testAiConnection(settings: AiSettings): Promise<AiConnectionTestResult> {
  await ensureCredential(settings);
  await configureAiProfile(settings);
  return runConnectionProbe(settings);
}

async function runConnectionProbe(settings: AiSettings): Promise<AiConnectionTestResult> {
  const { tauriFetch } = await import("./agent/tauriFetch");
  const response = await tauriFetch(`${settings.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    profileId: settings.profileId,
    allowInsecureHttp: settings.allowInsecureHttp,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-card-agent-profile": settings.profileId,
      "x-card-agent-credential": settings.credentialId
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: "system", content: "Respond with a short connection acknowledgement." },
        { role: "user", content: "Connection test." }
      ],
      stream: false,
      temperature: settings.temperature,
      max_tokens: Math.min(settings.maxOutputTokens, 256),
      tools: [{ type: "function", function: { name: "card_agent_probe", description: "A no-side-effect capability probe.", parameters: { type: "object", properties: {}, additionalProperties: false } } }],
      tool_choice: { type: "function", function: { name: "card_agent_probe" } },
      ...(settings.providerProfile === "deepseek" ? {
        thinking: { type: settings.thinkingLevel === "off" ? "disabled" : "enabled" },
        reasoning_effort: settings.thinkingLevel === "off" ? undefined : settings.thinkingLevel
      } : {})
    })
  });
  if (!response.ok) throw new Error(`AI request failed (${response.status}).`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string; tool_calls?: unknown[] } }>; model?: string };
  const message = payload.choices?.[0]?.message;
  return {
    content: message?.content ?? (message?.tool_calls?.length ? "工具调用探针通过。" : "连接成功，但模型未按要求调用工具。"),
    model: payload.model ?? settings.model,
    toolCalling: message?.tool_calls?.length ? "supported" : "unsupported"
  };
}

async function ensureCredential(settings: AiSettings): Promise<void> {
  if (settings.apiKey.trim()) await storeAiCredential(settings);
}

function isThinkingLevel(value: unknown): value is AiSettings["thinkingLevel"] {
  return value === "off" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh" || value === "max";
}

function isToolCalling(value: unknown): value is AiSettings["toolCalling"] {
  return value === "unknown" || value === "supported" || value === "unsupported";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
