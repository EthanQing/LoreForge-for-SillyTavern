import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { translate } from "./i18n";

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
  baseUrl: string;
  apiKey: string;
  model: string;
  manualModelInput: boolean;
  availableModels: AiModel[];
  stream: boolean;
  showReasoning: boolean;
  thinkingMode: AiThinkingMode;
  thinkingEffort: AiThinkingEffort;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface AiChatRequestOptions {
  jsonResponse?: boolean;
}

export interface AiChatMessage {
  role: "system" | "user" | "assistant";
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
}

export const AI_MAX_OUTPUT_TOKENS = 384_000;
export const AI_MAX_TIMEOUT_MS = 1_800_000;

export const defaultAiSettings: AiSettings = {
  enabled: true,
  providerProfile: "deepseek",
  baseUrl: "https://api.deepseek.com",
  apiKey: "",
  model: "deepseek-v4-flash",
  manualModelInput: false,
  availableModels: [],
  stream: true,
  showReasoning: true,
  thinkingMode: "enabled",
  thinkingEffort: "high",
  temperature: 0.4,
  maxOutputTokens: 8192,
  timeoutMs: 60_000
};

export function normalizeAiSettings(value: unknown): AiSettings {
  if (!value || typeof value !== "object") {
    return defaultAiSettings;
  }
  const raw = value as Partial<AiSettings>;
  const rawThinkingEffort = (value as { thinkingEffort?: unknown }).thinkingEffort;
  return {
    ...defaultAiSettings,
    ...raw,
    providerProfile: raw.providerProfile === "openai-compatible" ? "openai-compatible" : "deepseek",
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
    temperature: clampNumber(raw.temperature, 0, 2, defaultAiSettings.temperature),
    maxOutputTokens: Math.trunc(clampNumber(raw.maxOutputTokens, 1, AI_MAX_OUTPUT_TOKENS, defaultAiSettings.maxOutputTokens)),
    timeoutMs: Math.trunc(clampNumber(raw.timeoutMs, 1_000, AI_MAX_TIMEOUT_MS, defaultAiSettings.timeoutMs))
  };
}

export async function fetchAiModels(settings: AiSettings): Promise<AiModel[]> {
  return await invoke<AiModel[]>("fetch_ai_models", {
    request: {
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey
    }
  });
}

export async function testAiConnection(
  settings: AiSettings,
  onStream?: (event: AiStreamEvent) => void
): Promise<AiChatResult> {
  return await runAiChat(
    "test_ai_connection",
    settings,
    [
      {
        role: "system",
        content: translate("ai.testSystem")
      },
      {
        role: "user",
        content: translate("ai.testUser")
      }
    ],
    onStream
  );
}

export async function sendAiChat(
  settings: AiSettings,
  messages: AiChatMessage[],
  onStream?: (event: AiStreamEvent) => void,
  options?: AiChatRequestOptions
): Promise<AiChatResult> {
  return await runAiChat("send_ai_chat", settings, messages, onStream, options);
}

async function runAiChat(
  command: "test_ai_connection" | "send_ai_chat",
  settings: AiSettings,
  messages: AiChatMessage[],
  onStream?: (event: AiStreamEvent) => void,
  options?: AiChatRequestOptions
): Promise<AiChatResult> {
  const requestId = createRequestId();
  let unlisten: UnlistenFn | undefined;

  if (settings.stream && onStream) {
    unlisten = await listen<AiStreamEvent>("ai://stream", (event) => {
      if (event.payload.requestId === requestId) {
        onStream(event.payload);
      }
    });
  }

  try {
    return await invoke<AiChatResult>(command, {
      request: {
        requestId,
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
        messages,
        stream: settings.stream,
        temperature: settings.temperature,
        maxTokens: settings.maxOutputTokens,
        thinkingEffort:
          settings.providerProfile === "deepseek" && settings.thinkingMode === "enabled"
            ? settings.thinkingEffort
            : null,
        deepseekThinking: settings.providerProfile === "deepseek" ? settings.thinkingMode === "enabled" : null,
        timeoutMs: settings.timeoutMs,
        jsonResponse: options?.jsonResponse ?? false
      }
    });
  } finally {
    unlisten?.();
  }
}

function isThinkingMode(value: unknown): value is AiThinkingMode {
  return value === "enabled" || value === "disabled";
}

function isThinkingEffort(value: unknown): value is AiThinkingEffort {
  return value === "high" || value === "max";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function createRequestId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
