import { describe, expect, it, vi } from "vitest";
import { createStreamFn } from "./controller";
import type { AiConnectionProfile } from "./contracts";

function createProfile(kind: AiConnectionProfile["kind"]): AiConnectionProfile {
  return {
    id: kind === "openai-codex" ? "openai-codex" : `${kind}-default`,
    kind,
    baseUrl: kind === "openai-codex" ? "https://chatgpt.com/backend-api" : "https://example.com/v1",
    model: "test-model",
    credentialId: kind === "openai-codex" ? "openai-codex-oauth" : `${kind}-default`,
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    timeoutMs: 60_000,
    temperature: 0.4,
    thinkingLevel: "high",
    toolCalling: "supported",
    allowInsecureHttp: false
  };
}

describe("agent stream provider selection", () => {
  it("bypasses Pi OAuth resolution for the Rust-managed Codex credential", () => {
    const stream = {} as never;
    const codexProvider = {
      id: "openai-codex",
      getModels: () => [],
      streamSimple: vi.fn((_model: unknown, _context: unknown, _options?: Record<string, unknown>) => stream)
    } as any;
    const models = {
      setProvider: vi.fn(),
      streamSimple: vi.fn((_model: unknown, _context: unknown, _options?: Record<string, unknown>) => stream)
    } as any;
    const streamFn = createStreamFn(models, codexProvider, createProfile("openai-codex"));

    streamFn({} as never, {} as never, {});

    expect(codexProvider.streamSimple).toHaveBeenCalledOnce();
    expect(models.streamSimple).not.toHaveBeenCalled();
    const options = codexProvider.streamSimple.mock.calls[0]?.[2];
    expect(options).toMatchObject({
      transport: "sse",
      timeoutMs: 60_000,
      maxTokens: 8_192,
      temperature: undefined,
      headers: {
        "x-card-agent-profile": "openai-codex",
        "x-card-agent-credential": "openai-codex-oauth"
      }
    });
    expect(options?.apiKey).toMatch(/^[^.]+\.[^.]+\.[^.]+$/);
    expect(options?.fetch).toEqual(expect.any(Function));
  });

  it("keeps non-Codex providers on the Pi Models registry", () => {
    const stream = {} as never;
    const provider = {
      id: "deepseek-default",
      getModels: () => [],
      streamSimple: vi.fn((_model: unknown, _context: unknown, _options?: Record<string, unknown>) => stream)
    } as any;
    const models = {
      setProvider: vi.fn(),
      streamSimple: vi.fn((_model: unknown, _context: unknown, _options?: Record<string, unknown>) => stream)
    } as any;
    const streamFn = createStreamFn(models, provider, createProfile("deepseek"));

    streamFn({} as never, {} as never, {});

    expect(models.streamSimple).toHaveBeenCalledOnce();
    expect(provider.streamSimple).not.toHaveBeenCalled();
    const options = models.streamSimple.mock.calls[0]?.[2];
    expect(options).toMatchObject({
      apiKey: "tauri-managed",
      transport: "sse",
      timeoutMs: 60_000,
      maxTokens: 8_192,
      temperature: 0.4,
      headers: {
        "x-card-agent-profile": "deepseek-default",
        "x-card-agent-credential": "deepseek-default"
      }
    });
    expect(options?.fetch).toEqual(expect.any(Function));
  });
});
