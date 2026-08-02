import { describe, expect, it } from "vitest";
import { AI_MAX_OUTPUT_TOKENS, AI_MAX_TIMEOUT_MS, normalizeAiSettings } from "./ai";

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
});
