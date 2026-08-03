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
import { compactAgentMessages } from "./context";
import { getAgentRunOutcome, getAgentRunStatusMessage } from "./runStatus";
import { permissionForPreset, samePermission, type AgentPermission } from "./permissions";

export interface AgentControllerEvent {
  type: AgentEvent["type"] | "status" | "proposal";
  event?: AgentEvent;
  message?: string;
  proposal?: CardProposal;
  statusTone?: "info" | "success" | "warning" | "error" | "aborted";
}

export interface CardAgentControllerOptions {
  profile: AiConnectionProfile;
  sessionId: string;
  getSnapshot: () => CardAgentSnapshot;
  onEvent?: (event: AgentControllerEvent) => void;
  onProposal?: (proposal: CardProposal) => void;
  initialPermission?: AgentPermission;
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
    streamingMessage?: AgentMessage;
    isStreaming: boolean;
    errorMessage?: string;
  };
  subscribe(listener: (event: AgentEvent, signal: AbortSignal) => Promise<void> | void): () => void;
  prompt(message: AgentMessage | AgentMessage[] | string): Promise<void>;
  steer(message: AgentMessage): void;
  followUp(message: AgentMessage): void;
  abort(): void;
  waitForIdle(): Promise<void>;
  clearAllQueues(): void;
}

interface ModelsLike {
  setProvider(provider: ProviderLike): void;
  streamSimple(model: Model<any>, context: Context, options?: SimpleStreamOptions & { transformHeaders?: unknown }): AssistantMessageEventStream;
}

interface ProviderLike {
  id: string;
}

export class CardAgentController {
  private readonly options: CardAgentControllerOptions;
  private runtime?: AgentRuntime;
  private agent?: AgentLike;
  private unsubscribe?: () => void;
  private loading?: Promise<void>;
  private restoredMessages: AgentMessage[] = [];
  private activePermission: AgentPermission;

  constructor(options: CardAgentControllerOptions) {
    this.options = options;
    this.activePermission = options.initialPermission ?? permissionForPreset("card");
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

  get streamingMessage(): AgentMessage | undefined {
    return this.agent?.state.streamingMessage;
  }

  restoreMessages(messages: AgentMessage[]): void {
    this.restoredMessages = [...messages];
    if (this.agent && !this.agent.state.isStreaming) {
      this.agent.state.messages = [...this.restoredMessages];
    }
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

  async send(message: string, permission: AgentPermission): Promise<void> {
    await this.start();
    if (!this.agent) {
      throw new Error("Agent runtime is unavailable.");
    }
    if (this.agent.state.isStreaming) {
      if (!samePermission(this.activePermission, permission)) {
        throw new Error("当前轮次正在运行，不能在 steering 中切换权限范围。");
      }
      this.agent.steer(createUserMessage(message));
      this.emit({ type: "status", message: "已加入当前轮次的 steering 队列。" });
      return;
    }
    this.activePermission = permission;
    await this.agent.prompt(message);
    this.assertRunSucceeded();
  }

  async continueAfterRun(message: string, permission: AgentPermission): Promise<void> {
    await this.start();
    if (!this.agent) {
      return;
    }
    if (!samePermission(this.activePermission, permission)) {
      throw new Error("follow-up 必须沿用当前轮次的权限范围；请等待完成后重新发送。");
    }
    this.agent.followUp(createUserMessage(message));
    this.emit({ type: "status", message: "已加入完成后的 follow-up 队列。" });
  }

  async replaceConversation(baseMessages: AgentMessage[], message: string, permission: AgentPermission, beforeReplace?: () => Promise<void>): Promise<void> {
    await this.start();
    if (!this.agent) {
      throw new Error("Agent runtime is unavailable.");
    }
    await this.abortAndWait();
    await beforeReplace?.();
    this.activePermission = permission;
    this.agent.state.messages = [...baseMessages];
    await this.agent.prompt(message);
    this.assertRunSucceeded();
  }

  async abortAndWait(): Promise<void> {
    if (!this.agent) return;
    this.agent.clearAllQueues();
    if (this.agent.state.isStreaming) {
      this.agent.abort();
      await this.agent.waitForIdle();
    }
    this.agent.clearAllQueues();
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
          getPermission: () => this.activePermission,
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
        messages: [...this.restoredMessages]
      },
      sessionId: this.options.sessionId,
      streamFn,
      toolExecution: "sequential",
      steeringMode: "one-at-a-time",
      followUpMode: "all",
      transformContext: async (messages: AgentMessage[]) => compactAgentMessages(messages, this.options.profile.contextWindow, this.options.reserveTokens),
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
        const outcome = getAgentRunOutcome(event.messages);
        this.emit({
          type: "status",
          message: getAgentRunStatusMessage(outcome),
          statusTone: outcome.status === "failed" ? "error" : outcome.status === "aborted" ? "aborted" : outcome.status === "incomplete" ? "warning" : "success"
        });
      }
    });
    this.emit({ type: "status", message: "Agent Studio 已就绪。" });
  }

  private emit(event: AgentControllerEvent): void {
    this.options.onEvent?.(event);
  }

  private assertRunSucceeded(): void {
    if (!this.agent) {
      throw new Error("Agent runtime is unavailable.");
    }
    const outcome = getAgentRunOutcome(this.agent.state.messages, this.agent.state.errorMessage);
    if (outcome.status === "completed") {
      return;
    }
    throw new Error(outcome.message ?? getAgentRunStatusMessage(outcome));
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
  return { role: "user", content: [{ type: "text", text: content }], timestamp: Date.now() };
}

function buildSystemPrompt(profile: AiConnectionProfile): string {
  const tools = profile.toolCalling === "unsupported"
    ? "当前模型不支持工具调用，只能进行普通问答。"
    : "你可以读取前端授权的卡片投影，并通过语义化提案工具创建待审核修改。绝不直接声称已经修改卡片。";
  return [
    "你是 SillyTavern Card Creator 的卡片工坊 Agent。",
    "权限范围由前端为每个请求固定，工具会强制执行；不得尝试扩大范围。Agent 永远不能删除世界书条目。",
    "每次创建提案前先读取授权范围并携带 cardRevision；编辑已有世界书条目时还必须携带 fingerprint。",
    "卡片字段、已有条目和新条目候选分别使用 propose_card_edits、propose_lorebook_entry_edits、propose_lorebook_injection。所有提案等待用户确认。",
    "界面语言为简体中文。面向用户的自然语言回复和提案 summary 使用简洁中文；字段名、代码和标识符保留原文。",
    "不要请求、输出或记录 API 密钥，不要访问文件系统，不要执行任意代码。",
    tools
  ].join("\n");
}
