import { describe, expect, it } from "vitest";
import {
  AI_MAX_OUTPUT_TOKENS,
  AI_MAX_TIMEOUT_MS,
  OPENAI_CODEX_BASE_URL,
  OPENAI_CODEX_CREDENTIAL_ID,
  normalizeAiSettings,
  settingsForProvider
} from "./ai";

describe("AI settings normalization", () => {
  it("allows DeepSeek V4 sized output while clamping extreme values", () => {
    expect(normalizeAiSettings({ maxOutputTokens: 384_000 }).maxOutputTokens).toBe(AI_MAX_OUTPUT_TOKENS);
    expect(normalizeAiSettings({ maxOutputTokens: 999_999 }).maxOutputTokens).toBe(AI_MAX_OUTPUT_TOKENS);
  });

  it("allows long timeouts for very large streamed outputs", () => {
    expect(normalizeAiSettings({ timeoutMs: 1_800_000 }).timeoutMs).toBe(AI_MAX_TIMEOUT_MS);
    expect(normalizeAiSettings({ timeoutMs: 9_999_999 }).timeoutMs).toBe(AI_MAX_TIMEOUT_MS);
  });

  it("keeps only the Pi Agent thinking level contract", () => {
    const settings = normalizeAiSettings({ thinkingLevel: "xhigh", stream: false, showReasoning: false, thinkingEffort: "max" });
    expect(settings.thinkingLevel).toBe("xhigh");
    expect("stream" in settings).toBe(false);
    expect("showReasoning" in settings).toBe(false);
    expect("thinkingEffort" in settings).toBe(false);
  });

  it("normalizes OpenAI Codex to the fixed OAuth profile", () => {
    const settings = normalizeAiSettings({
      providerProfile: "openai-codex",
      baseUrl: "https://example.com/steal",
      credentialId: "other-key",
      apiKey: "must-not-persist",
      allowInsecureHttp: true
    });
    expect(settings.baseUrl).toBe(OPENAI_CODEX_BASE_URL);
    expect(settings.credentialId).toBe(OPENAI_CODEX_CREDENTIAL_ID);
    expect(settings.apiKey).toBe("");
    expect(settings.model).toBe("gpt-5.6-luna");
    expect(settings.contextWindow).toBe(272_000);
    expect(settings.allowInsecureHttp).toBe(false);
  });

  it("switches provider presets without retaining DeepSeek endpoints", () => {
    const current = normalizeAiSettings({});
    expect(settingsForProvider("openai-codex", current)).toMatchObject({
      providerProfile: "openai-codex",
      baseUrl: OPENAI_CODEX_BASE_URL,
      model: "gpt-5.6-luna"
    });
    expect(settingsForProvider("deepseek", { ...current, baseUrl: "https://custom.example/v1" })).toMatchObject({
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash"
    });
    expect(settingsForProvider("openai-compatible", current)).toMatchObject({
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini"
    });
  });
});
