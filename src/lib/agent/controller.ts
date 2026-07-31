import type {
  AgentEvent,
  AgentMessage,
  AgentTool,
  BeforeToolCallContext,
  StreamFn,
  ThinkingLevel
} from "@earendil-works/pi-agent-core";
import type { AssistantMessageEventStream, Context, Model, SimpleStreamOptions } from "@earendil-works/pi-ai";
import type { CardProposal } from "./contracts";
import type { AiConnectionProfile } from "./contracts";
import type { CardAgentSnapshot } from "./tools";
import { invoke } from "@tauri-apps/api/core";

export interface AgentControllerEvent {
  type: AgentEvent["type"] | "status" | "proposal";
  event?: AgentEvent;
  message?: string;
  proposal?: CardProposal;
}

export interface CardAgentControllerOptions {
  profile: AiConnectionProfile;
  sessionId: string;
  getSnapshot: () => CardAgentSnapshot;
  onEvent?: (event: AgentControllerEvent) => void;
  onProposal?: (proposal: CardProposal) => void;
  allowedPaths?: string[];
  reserveTokens?: number;
}

interface AgentRuntime {
  Agent: new (options: Record<string, unknown>) => AgentLike;
  createModels: (options?: Record<string, unknown>) => ModelsLike;
  createProvider: (options: Record<string, unknown>) => ProviderLike;
  openAICompletionsApi: () => unknown;
}

interface AgentLike {
  state: {
    model: Model<any>;
    tools: AgentTool[];
    messages: AgentMessage[];
    isStreaming: boolean;
    errorMessage?: string;
  };
  subscribe(listener: (event: AgentEvent, signal: AbortSignal) => Promise<void> | void): () => void;
  prompt(message: string): Promise<void>;
  steer(message: AgentMessage): void;
  followUp(message: AgentMessage): void;
  abort(): void;
  waitForIdle(): Promise<void>;
}

interface ModelsLike {
  setProvider(provider: ProviderLike): void;
  streamSimple(model: Model<any>, context: Context, options?: SimpleStreamOptions & { transformHeaders?: unknown }): AssistantMessageEventStream;
}

interface ProviderLike {
  id: string;
}

const DEFAULT_RESERVE_TOKENS = 8_000;
const TAIL_TOKEN_LIMIT = 20_000;
const DEFAULT_AGENT_ALLOWED_PATHS = [
  "/name",
  "/description",
  "/personality",
  "/scenario",
  "/firstMessage",
  "/alternateGreetings",
  "/exampleDialogue",
  "/creatorNotes",
  "/systemPrompt",
  "/postHistoryInstructions",
  "/tags",
  "/creator",
  "/characterVersion",
  "/worldBook"
];

export class CardAgentController {
  private readonly options: CardAgentControllerOptions;
  private runtime?: AgentRuntime;
  private agent?: AgentLike;
  private unsubscribe?: () => void;
  private loading?: Promise<void>;

  constructor(options: CardAgentControllerOptions) {
    this.options = options;
  }

  get isReady(): boolean {
    return Boolean(this.agent);
  }

  get isStreaming(): boolean {
    return this.agent?.state.isStreaming ?? false;
  }

  get messages(): AgentMessage[] {
    return this.agent?.state.messages ?? [];
  }

  async start(): Promise<void> {
    if (this.agent) {
      return;
    }
    if (!this.loading) {
      this.loading = this.initialize();
    }
    await this.loading;
  }

  async send(message: string): Promise<void> {
    await this.start();
    if (!this.agent) {
      throw new Error("Agent runtime is unavailable.");
    }
    if (this.agent.state.isStreaming) {
      this.agent.steer(createUserMessage(message));
      this.emit({ type: "status", message: "已加入当前轮次的 steering 队列。" });
      return;
    }
    await this.agent.prompt(message);
  }

  async continueAfterRun(message: string): Promise<void> {
    await this.start();
    if (!this.agent) {
      return;
    }
    this.agent.followUp(createUserMessage(message));
    this.emit({ type: "status", message: "已加入完成后的 follow-up 队列。" });
  }

  abort(): void {
    this.agent?.abort();
    this.emit({ type: "status", message: "正在取消当前 Agent 运行…" });
  }

  async waitForIdle(): Promise<void> {
    await this.agent?.waitForIdle();
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.agent?.abort();
    this.agent = undefined;
  }

  private async initialize(): Promise<void> {
    await invoke("configure_ai_profile", {
      profile: {
        id: this.options.profile.id,
        baseUrl: this.options.profile.baseUrl,
        credentialId: this.options.profile.credentialId,
        allowInsecureHttp: this.options.profile.allowInsecureHttp
      }
    });
    const [core, ai, api, toolModule] = await Promise.all([
      import("@earendil-works/pi-agent-core"),
      import("@earendil-works/pi-ai"),
      import("@earendil-works/pi-ai/api/openai-completions.lazy"),
      import("./tools")
    ]);
    this.runtime = {
      Agent: core.Agent as unknown as AgentRuntime["Agent"],
      createModels: ai.createModels as unknown as AgentRuntime["createModels"],
      createProvider: ai.createProvider as unknown as AgentRuntime["createProvider"],
      openAICompletionsApi: api.openAICompletionsApi
    };
    const model = createModel(this.options.profile);
    const models = this.runtime.createModels();
    const provider = this.runtime.createProvider({
      id: this.options.profile.id,
      name: this.options.profile.kind === "deepseek" ? "DeepSeek" : "OpenAI-compatible",
      baseUrl: this.options.profile.baseUrl,
      auth: {
        apiKey: {
          name: "系统凭据库",
          resolve: async () => ({ auth: { apiKey: "tauri-managed" }, source: "系统凭据库" })
        }
      },
      models: [model],
      api: this.runtime.openAICompletionsApi()
    });
    models.setProvider(provider);
    const tools = this.options.profile.toolCalling === "unsupported"
      ? []
      : toolModule.createCardAgentTools({
          getSnapshot: this.options.getSnapshot,
          getSessionId: () => this.options.sessionId,
          allowedPaths: this.options.allowedPaths ?? [...DEFAULT_AGENT_ALLOWED_PATHS],
          setProposal: this.options.onProposal
        });
    const streamFn = createStreamFn(models, this.options.profile);
    const systemPrompt = buildSystemPrompt(this.options.profile);
    const agent = new this.runtime.Agent({
      initialState: {
        systemPrompt,
        model,
        thinkingLevel: this.options.profile.thinkingLevel as ThinkingLevel,
        tools,
        messages: []
      },
      sessionId: this.options.sessionId,
      streamFn,
      toolExecution: "sequential",
      steeringMode: "one-at-a-time",
      followUpMode: "all",
      transformContext: async (messages: AgentMessage[]) => compactMessages(messages, this.options.profile.contextWindow, this.options.reserveTokens ?? DEFAULT_RESERVE_TOKENS),
      beforeToolCall: async ({ toolCall }: BeforeToolCallContext) => {
        if (this.options.profile.toolCalling === "unsupported") {
          return { block: true, reason: "当前模型未通过工具调用探针，已禁用卡片工具。" };
        }
        this.emit({ type: "status", message: `执行工具：${toolCall.name}` });
        return undefined;
      }
    });
    this.agent = agent;
    this.unsubscribe = agent.subscribe(async (event) => {
      this.emit({ type: event.type, event });
      if (event.type === "agent_end") {
        this.emit({ type: "status", message: "Agent 运行完成。" });
      }
    });
    this.emit({ type: "status", message: "Agent Studio 已就绪。" });
  }

  private emit(event: AgentControllerEvent): void {
    this.options.onEvent?.(event);
  }
}

function createModel(profile: AiConnectionProfile): Model<"openai-completions"> {
  return {
    id: profile.model,
    name: profile.model,
    api: "openai-completions",
    provider: profile.id,
    baseUrl: profile.baseUrl,
    reasoning: profile.thinkingLevel !== "off",
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: profile.contextWindow,
    maxTokens: profile.maxOutputTokens,
    compat: profile.kind === "deepseek" ? { thinkingFormat: "deepseek" } : undefined
  };
}

function createStreamFn(models: ModelsLike, profile: AiConnectionProfile): StreamFn {
  return (model, context, options) => models.streamSimple(model, context, {
    ...options,
    apiKey: "tauri-managed",
    fetch: createTauriFetch(profile),
    transport: "sse",
    headers: {
      ...(options?.headers ?? {}),
      "x-card-agent-profile": profile.id,
      "x-card-agent-credential": profile.credentialId
    },
    timeoutMs: profile.timeoutMs,
    temperature: profile.temperature,
    maxTokens: profile.maxOutputTokens
  });
}

function createTauriFetch(profile: AiConnectionProfile): typeof globalThis.fetch {
  return async (input, init) => {
    const { tauriFetch } = await import("./tauriFetch");
    return tauriFetch(input, {
      ...init,
      profileId: profile.id,
      allowInsecureHttp: profile.allowInsecureHttp
    });
  };
}

function createUserMessage(content: string): AgentMessage {
  return { role: "user", content, timestamp: Date.now() };
}

function buildSystemPrompt(profile: AiConnectionProfile): string {
  const tools = profile.toolCalling === "unsupported"
    ? "当前模型不支持工具调用，只能进行普通问答。"
    : "你可以使用卡片读取工具，并通过 propose_card_changes 创建待审核提案。绝不直接声称已经修改卡片。";
  return [
    "你是 SillyTavern Card Creator 的卡片工坊 Agent。",
    "你的权限边界是只读当前卡片、校验和统计；所有修改必须通过 propose_card_changes，并等待用户确认。",
    "每次创建提案前先读取当前卡片并携带读取到的 cardRevision。严格遵守用户的 @目标、排除路径和字段范围。",
    "不要请求、输出或记录 API 密钥，不要访问文件系统，不要执行任意代码。",
    tools
  ].join("\n");
}

function compactMessages(messages: AgentMessage[], contextWindow: number, reserveTokens: number): AgentMessage[] {
  const budget = Math.max(4_000, Math.min(TAIL_TOKEN_LIMIT, contextWindow - reserveTokens));
  if (estimateMessagesTokens(messages) <= budget) {
    return messages;
  }
  const first = messages[0];
  const tail: AgentMessage[] = [];
  let used = first ? estimateMessagesTokens([first]) : 0;
  for (let index = messages.length - 1; index >= (first ? 1 : 0); index -= 1) {
    const candidate = messages[index];
    const cost = estimateMessagesTokens([candidate]);
    if (used + cost > budget) {
      break;
    }
    tail.unshift(candidate);
    used += cost;
  }
  const omitted = messages.length - tail.length - (first ? 1 : 0);
  const summary: AgentMessage = {
    role: "user",
    content: `[上下文已压缩：省略 ${Math.max(0, omitted)} 条较旧消息；保留当前卡片边界与最近对话。]`,
    timestamp: Date.now()
  };
  return first ? [first, summary, ...tail] : [summary, ...tail];
}

function estimateMessagesTokens(messages: AgentMessage[]): number {
  return messages.reduce((total, message) => total + Math.ceil(JSON.stringify(message).length / 4), 0);
}
