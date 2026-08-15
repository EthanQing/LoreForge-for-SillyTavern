import { invoke } from "@tauri-apps/api/core";
import type { AiConnectionProfile } from "./agent/contracts";

export type AiProviderProfile = "deepseek" | "openai-compatible" | "openai-codex";

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

export interface OpenAiOauthStatus {
  configured: boolean;
  expiresAt?: number;
}

export interface OpenAiOauthStart {
  flowId: string;
  method: "browser" | "device-code";
  authUrl?: string;
  userCode?: string;
  verificationUri?: string;
  intervalSeconds?: number;
  expiresAt: number;
}

export const AI_MAX_OUTPUT_TOKENS = 384_000;
export const AI_MAX_TIMEOUT_MS = 1_800_000;
export const AI_DEFAULT_CONTEXT_WINDOW = 128_000;
export const OPENAI_CODEX_BASE_URL = "https://chatgpt.com/backend-api";
export const OPENAI_CODEX_PROFILE_ID = "openai-codex";
export const OPENAI_CODEX_CREDENTIAL_ID = "openai-codex-oauth";

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
  const providerProfile = isProviderProfile(raw.providerProfile) ? raw.providerProfile : "deepseek";
  const fallbackProfileId = `${providerProfile}-default`;
  const normalized: AiSettings = {
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
  if (providerProfile === "openai-codex") {
    return {
      ...normalized,
      profileId: OPENAI_CODEX_PROFILE_ID,
      credentialId: OPENAI_CODEX_CREDENTIAL_ID,
      baseUrl: OPENAI_CODEX_BASE_URL,
      apiKey: "",
      model: typeof raw.model === "string" && raw.model.trim() ? raw.model : "gpt-5.6-luna",
      manualModelInput: false,
      toolCalling: "supported",
      contextWindow: typeof raw.contextWindow === "number" ? normalized.contextWindow : 272_000,
      maxOutputTokens: typeof raw.maxOutputTokens === "number" ? normalized.maxOutputTokens : 128_000,
      allowInsecureHttp: false
    };
  }
  return normalized;
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

export function settingsForProvider(
  providerProfile: AiProviderProfile,
  current: AiSettings
): Partial<AiSettings> {
  if (providerProfile === "openai-codex") {
    return {
      providerProfile,
      profileId: OPENAI_CODEX_PROFILE_ID,
      credentialId: OPENAI_CODEX_CREDENTIAL_ID,
      baseUrl: OPENAI_CODEX_BASE_URL,
      apiKey: "",
      model: "gpt-5.6-luna",
      manualModelInput: false,
      availableModels: [],
      contextWindow: 272_000,
      maxOutputTokens: 128_000,
      toolCalling: "supported",
      allowInsecureHttp: false
    };
  }
  const fallbackProfileId = `${providerProfile}-default`;
  const continuingCompatibleProfile = providerProfile === "openai-compatible"
    && current.providerProfile === "openai-compatible";
  return {
    providerProfile,
    profileId: fallbackProfileId,
    credentialId: fallbackProfileId,
    baseUrl: providerProfile === "deepseek"
      ? "https://api.deepseek.com"
      : continuingCompatibleProfile ? current.baseUrl : "https://api.openai.com/v1",
    apiKey: "",
    availableModels: [],
    model: providerProfile === "deepseek"
      ? "deepseek-v4-flash"
      : continuingCompatibleProfile ? current.model : "gpt-4o-mini",
    toolCalling: "unknown",
    allowInsecureHttp: providerProfile === "openai-compatible" ? current.allowInsecureHttp : false
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
    profile: {
      id: settings.profileId,
      kind: settings.providerProfile,
      baseUrl: settings.baseUrl,
      credentialId: settings.credentialId,
      allowInsecureHttp: settings.allowInsecureHttp
    }
  });
}

export async function fetchAiModels(settings: AiSettings): Promise<AiModel[]> {
  if (settings.providerProfile === "openai-codex") {
    const { openaiCodexProvider } = await import("@earendil-works/pi-ai/providers/openai-codex");
    return openaiCodexProvider().getModels().map((model) => ({ id: model.id }));
  }
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
  if (settings.providerProfile === "openai-codex") {
    const response = await tauriFetch(`${OPENAI_CODEX_BASE_URL}/codex/responses`, {
      method: "POST",
      profileId: settings.profileId,
      headers: {
        authorization: `Bearer ${createCodexAuthPlaceholder()}`,
        "chatgpt-account-id": "tauri-managed",
        "content-type": "application/json",
        accept: "text/event-stream",
        "openai-beta": "responses=experimental",
        "x-card-agent-profile": settings.profileId
      },
      body: JSON.stringify({
        model: settings.model,
        store: false,
        stream: true,
        instructions: "Respond with a short connection acknowledgement.",
        input: [{ role: "user", content: [{ type: "input_text", text: "Connection test." }] }],
        include: ["reasoning.encrypted_content"]
      })
    });
    if (!response.ok) throw new Error(`OpenAI Codex request failed (${response.status}).`);
    const payload = await response.text();
    if (!payload.includes("response.completed") && !payload.includes("response.done")) {
      throw new Error("OpenAI Codex connection closed before completion.");
    }
    return { content: "ChatGPT OAuth 连接成功。", model: settings.model, toolCalling: "supported" };
  }
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

export async function getOpenAiOauthStatus(
  credentialId = OPENAI_CODEX_CREDENTIAL_ID
): Promise<OpenAiOauthStatus> {
  return await invoke<OpenAiOauthStatus>("openai_oauth_status", { credentialId });
}

export async function beginOpenAiOauth(
  credentialId = OPENAI_CODEX_CREDENTIAL_ID
): Promise<OpenAiOauthStart> {
  return await invoke<OpenAiOauthStart>("begin_openai_oauth", { credentialId });
}

export async function completeOpenAiOauth(flowId: string): Promise<OpenAiOauthStatus> {
  return await invoke<OpenAiOauthStatus>("complete_openai_oauth", { flowId });
}

export async function cancelOpenAiOauth(flowId: string): Promise<void> {
  await invoke("cancel_openai_oauth", { flowId });
}

export async function logoutOpenAiOauth(
  credentialId = OPENAI_CODEX_CREDENTIAL_ID
): Promise<void> {
  await invoke("logout_openai_oauth", { credentialId });
}

export function createCodexAuthPlaceholder(): string {
  const header = globalThis.btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = globalThis.btoa(JSON.stringify({
    "https://api.openai.com/auth": { chatgpt_account_id: "tauri-managed" }
  }));
  return `${header}.${payload}.signature`;
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

function isProviderProfile(value: unknown): value is AiProviderProfile {
  return value === "deepseek" || value === "openai-compatible" || value === "openai-codex";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
