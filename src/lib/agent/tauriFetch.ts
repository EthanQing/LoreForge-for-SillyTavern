import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface TauriFetchOptions extends RequestInit {
  profileId?: string;
  allowInsecureHttp?: boolean;
}

interface StartAiHttpStreamResult {
  requestId: string;
  status: number;
  statusText?: string;
  headers: Record<string, string>;
}

interface AiHttpStreamEvent {
  requestId: string;
  event: "chunk" | "done" | "error";
  data?: string;
  message?: string;
}

export async function tauriFetch(input: RequestInfo | URL, init: TauriFetchOptions = {}): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const requestId = createRequestId();
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  const body = await readBody(input, init);
  const controller = new AbortController();
  const signal = init.signal;
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) {
    controller.abort();
  }

  let chunkUnlisten: UnlistenFn | undefined;
  let doneUnlisten: UnlistenFn | undefined;
  let resolveResponse: (response: StartAiHttpStreamResult) => void = () => undefined;
  let rejectResponse: (error: unknown) => void = () => undefined;
  const responsePromise = new Promise<StartAiHttpStreamResult>((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
  });
  const stream = new ReadableStream<Uint8Array>({
    start: async (streamController) => {
      const cleanup = () => {
        chunkUnlisten?.();
        doneUnlisten?.();
        signal?.removeEventListener("abort", abort);
      };
      try {
        const onEvent = (event: AiHttpStreamEvent) => {
          if (event.requestId !== requestId) {
            return;
          }
          if (event.event === "chunk" && event.data) {
            streamController.enqueue(decodeBase64(event.data));
            return;
          }
          if (event.event === "error") {
            cleanup();
            streamController.error(new Error(event.message ?? "AI HTTP stream failed."));
            return;
          }
          cleanup();
          streamController.close();
        };
        chunkUnlisten = await listen<AiHttpStreamEvent>("ai://http-stream", (event) => onEvent(event.payload));
        doneUnlisten = await listen<AiHttpStreamEvent>("ai://http-stream-end", (event) => onEvent(event.payload));
        if (controller.signal.aborted) {
          await cancelRequest(requestId);
          const error = new DOMException("The operation was aborted.", "AbortError");
          rejectResponse(error);
          streamController.error(error);
          return;
        }
        const started = await invoke<StartAiHttpStreamResult>("start_ai_http_stream", {
          request: {
            requestId,
            url,
            method: init.method ?? (input instanceof Request ? input.method : "GET"),
            headers: Object.fromEntries(headers.entries()),
            body,
            profileId: init.profileId ?? headers.get("x-card-agent-profile"),
            allowInsecureHttp: Boolean(init.allowInsecureHttp)
          }
        });
        resolveResponse(started);
      } catch (error) {
        cleanup();
        rejectResponse(error);
        streamController.error(error);
      }
    },
    cancel: () => {
      void cancelRequest(requestId);
    }
  });

  const response = await responsePromise;
  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

async function cancelRequest(requestId: string): Promise<void> {
  try {
    await invoke("cancel_ai_http_stream", { requestId });
  } catch {
    // The request may have already completed or Tauri may be unavailable in a browser preview.
  }
}

async function readBody(input: RequestInfo | URL, init: RequestInit): Promise<string | null> {
  if (typeof init.body === "string") {
    return init.body;
  }
  if (input instanceof Request) {
    return await input.clone().text();
  }
  return null;
}

function decodeBase64(value: string): Uint8Array {
  const binary = globalThis.atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `ai-http-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
