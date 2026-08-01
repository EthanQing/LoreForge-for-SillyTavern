import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Check, ChevronRight, CircleStop, FileText, FolderOpen, MessageSquarePlus, PanelRight, Plus, Send, Settings2, ShieldCheck, Sparkles, SquarePen } from "lucide-react";
import { useCardStore } from "../../app/store";
import { useProjectActions } from "../../app/useProjectActions";
import { getCardDisplayName } from "../../app/cardIdentity";
import { Button } from "../../components/Button";
import { MarkdownMessage } from "../../components/MarkdownMessage";
import { buildCardTokenStats } from "../../lib/tokenStats";
import { applyCardProposal, type CardProposal } from "../../lib/agent/contracts";
import { CardAgentController, type AgentControllerEvent } from "../../lib/agent/controller";
import { buildAgentTranscript, formatAgentToolContent, type AgentTranscriptTool, type AgentTranscriptTurn } from "../../lib/agent/transcript";
import { useI18n } from "../../lib/i18n";
import { invoke } from "@tauri-apps/api/core";

const BasicInfoPanel = lazy(() => import("../card-editor/BasicInfoPanel").then((module) => ({ default: module.BasicInfoPanel })));
const PromptPanel = lazy(() => import("../card-editor/PromptPanel").then((module) => ({ default: module.PromptPanel })));
const GreetingsPanel = lazy(() => import("../card-editor/GreetingsPanel").then((module) => ({ default: module.GreetingsPanel })));
const LorebookPanel = lazy(() => import("../lorebook/LorebookPanel").then((module) => ({ default: module.LorebookPanel })));
const AssetsPanel = lazy(() => import("../assets/AssetsPanel").then((module) => ({ default: module.AssetsPanel })));
const PreviewPanel = lazy(() => import("../card-editor/PreviewPanel").then((module) => ({ default: module.PreviewPanel })));
const ValidationPanel = lazy(() => import("../card-editor/ValidationPanel").then((module) => ({ default: module.ValidationPanel })));
const TokenStatsPanel = lazy(() => import("../card-editor/TokenStatsPanel").then((module) => ({ default: module.TokenStatsPanel })));
const SettingsPanel = lazy(() => import("../settings/SettingsPanel").then((module) => ({ default: module.SettingsPanel })));
const ImportExportPanel = lazy(() => import("../import-export/ImportExportPanel").then((module) => ({ default: module.ImportExportPanel })));

type StudioEditorTab = "basic" | "prompts" | "greetings" | "lorebook" | "assets" | "preview" | "tokenStats" | "validation" | "settings" | "home";

export function AgentStudio(): ReactNode {
  const { t } = useI18n();
  const card = useCardStore((state) => state.card);
  const report = useCardStore((state) => state.report);
  const workspaceId = useCardStore((state) => state.workspaceId);
  const cardRevision = useCardStore((state) => state.cardRevision);
  const currentPath = useCardStore((state) => state.currentPath);
  const aiSettings = useCardStore((state) => state.aiSettings);
  const setStatus = useCardStore((state) => state.setStatus);
  const applyAgentCard = useCardStore((state) => state.applyAgentCard);
  const { saveCardSnapshot } = useProjectActions();
  const [sessionId, setSessionId] = useState(() => readSessionId(workspaceId));
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<unknown[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<unknown>();
  const [events, setEvents] = useState<AgentControllerEvent[]>([]);
  const [proposals, setProposals] = useState<CardProposal[]>([]);
  const [rightOpen, setRightOpen] = useState(true);
  const [inspectorWidth, setInspectorWidth] = useState(560);
  const [focusedEditor, setFocusedEditor] = useState<StudioEditorTab | null>(null);
  const controllerRef = useRef<CardAgentController | null>(null);
  const inspectorRef = useRef<HTMLElement | null>(null);
  const inspectorCloseRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const nextSessionId = readSessionId(workspaceId);
    setSessionId(nextSessionId);
    setMessages([]);
    setStreamingMessage(undefined);
    setProposals([]);
    controllerRef.current?.dispose();
    controllerRef.current = null;
  }, [workspaceId]);

  useEffect(() => {
    let active = true;
    void hydrateAgentSession(sessionId).then((stored) => {
      if (!active || stored.length === 0) return;
      setMessages(stored);
    });
    void hydrateAgentProposals(workspaceId).then((stored) => {
      if (!active || stored.length === 0) return;
      setProposals(stored.filter((proposal) => proposal.sessionId === sessionId));
    });
    return () => { active = false; };
  }, [sessionId, workspaceId]);

  useEffect(() => {
    void persistWorkspace(workspaceId, currentPath, cardRevision);
  }, [cardRevision, currentPath, workspaceId]);

  const controller = useMemo(() => {
    const next = new CardAgentController({
      profile: {
        id: aiSettings.profileId,
        kind: aiSettings.providerProfile,
        baseUrl: aiSettings.baseUrl,
        model: aiSettings.model,
        credentialId: aiSettings.credentialId,
        contextWindow: aiSettings.contextWindow,
        maxOutputTokens: aiSettings.maxOutputTokens,
        timeoutMs: aiSettings.timeoutMs,
        temperature: aiSettings.temperature,
        thinkingLevel: aiSettings.thinkingMode === "disabled" ? "off" : aiSettings.thinkingLevel,
        toolCalling: aiSettings.toolCalling,
        allowInsecureHttp: aiSettings.allowInsecureHttp
      },
      sessionId,
      getSnapshot: () => ({
        card: useCardStore.getState().card,
        workspaceId: useCardStore.getState().workspaceId,
        cardRevision: useCardStore.getState().cardRevision,
        report: useCardStore.getState().report
      }),
      onEvent: (event) => {
        setEvents((current) => [...current.slice(-80), event]);
        setMessages([...next.messages]);
        setStreamingMessage(next.streamingMessage);
        void persistAgentEvent(workspaceId, sessionId, event);
      },
      onProposal: (proposal) => {
        setProposals((current) => [...current.filter((item) => item.id !== proposal.id), proposal]);
        void persistAgentProposal(proposal);
      }
    });
    controllerRef.current = next;
    return next;
  }, [aiSettings, sessionId]);

  useEffect(() => () => controller.dispose(), [controller]);

  useEffect(() => {
    if (!rightOpen) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setRightOpen(false);
        setFocusedEditor(null);
        lastFocusRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !inspectorRef.current) return;
      const focusable = Array.from(inspectorRef.current.querySelectorAll<HTMLElement>("button, a, input, select, textarea, [tabindex]:not([tabindex='-1'])"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [rightOpen]);

  const submit = useCallback(async () => {
    const message = input.trim();
    if (!message) return;
    setInput("");
    setEvents((current) => [...current, { type: "status", message: "正在运行 Agent…" }]);
    try {
      await controller.send(message);
      setMessages([...controller.messages]);
      setStreamingMessage(controller.streamingMessage);
      saveSessionId(workspaceId, sessionId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, [controller, input, sessionId, setStatus, workspaceId]);

  const queueFollowUp = useCallback(async () => {
    const message = input.trim();
    if (!message) return;
    setInput("");
    try {
      await controller.continueAfterRun(message);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, [controller, input, setStatus]);

  const applyProposal = useCallback(async (proposal: CardProposal) => {
    const current = useCardStore.getState();
    const outcome = applyCardProposal(proposal, current.card);
    if (outcome.state !== "applied") {
      const blockedProposal = { ...proposal, state: outcome.state === "conflicted" ? "conflicted" as const : "pending" as const, updatedAt: Date.now() };
      setProposals((items) => items.map((item) => item.id === proposal.id ? blockedProposal : item));
      void persistAgentProposal(blockedProposal);
      setStatus(outcome.reasons.join(" "));
      return;
    }
    applyAgentCard(outcome.card, "已应用 Agent 提案，等待保存。");
    const appliedProposal = { ...proposal, state: "applied" as const, saveState: "not-needed" as const, updatedAt: Date.now() };
    setProposals((items) => items.map((item) => item.id === proposal.id ? appliedProposal : item));
    const saveState = await saveCardSnapshot(outcome.card, { promptIfUnbound: false, savedStatus: "Agent 提案已应用。" });
    const savedProposal = { ...appliedProposal, saveState, updatedAt: Date.now() };
    setProposals((items) => items.map((item) => item.id === proposal.id ? savedProposal : item));
    void persistAgentProposal(savedProposal);
  }, [applyAgentCard, saveCardSnapshot, setStatus]);

  const discardProposal = useCallback((proposal: CardProposal) => {
    const discardedProposal = { ...proposal, state: "discarded" as const, updatedAt: Date.now() };
    setProposals((items) => items.map((item) => item.id === proposal.id ? discardedProposal : item));
    void persistAgentProposal(discardedProposal);
  }, []);

  const openEditor = (tab: StudioEditorTab) => {
    lastFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setFocusedEditor(tab);
    setRightOpen(true);
    requestAnimationFrame(() => inspectorCloseRef.current?.focus());
  };

  const closeInspector = () => {
    setRightOpen(false);
    setFocusedEditor(null);
    lastFocusRef.current?.focus();
  };

  const reopenInspector = () => {
    setRightOpen(true);
    requestAnimationFrame(() => inspectorCloseRef.current?.focus());
  };

  const returnToOverview = () => {
    setFocusedEditor(null);
    requestAnimationFrame(() => inspectorCloseRef.current?.focus());
  };

  const handleInspectorResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (window.innerWidth < 1100) return;
    resizeRef.current = { startX: event.clientX, startWidth: inspectorWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
    const handleMove = (moveEvent: PointerEvent) => {
      const resize = resizeRef.current;
      if (!resize) return;
      const nextWidth = clamp(resize.startWidth + resize.startX - moveEvent.clientX, 420, 720);
      setInspectorWidth(nextWidth);
    };
    const handleUp = () => {
      resizeRef.current = null;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  };

  const handleInspectorResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const amount = event.key === "ArrowLeft" ? 24 : -24;
    setInspectorWidth((current) => clamp(current + amount, 420, 720));
  };

  const transcript = buildAgentTranscript(messages, streamingMessage);

  return (
    <section
      className={rightOpen ? "agent-studio agent-studio-inspector-open" : "agent-studio"}
      style={{ "--inspector-width": rightOpen ? `${inspectorWidth}px` : "0px" } as CSSProperties}
      aria-label="Agent Studio"
    >
      <aside className="agent-studio-sidebar">
        <div className="agent-studio-brand"><div className="agent-studio-mark"><Sparkles size={18} /></div><div><strong>Card Workshop</strong><span>AGENT STUDIO</span></div></div>
        <div className="agent-studio-card-summary"><span>当前卡片</span><strong>{getCardDisplayName(card, t)}</strong><small>{workspaceId.slice(0, 18)} · rev {cardRevision}</small></div>
        <button className="agent-studio-session active" type="button"><MessageSquarePlus size={15} /><span>卡片 Agent 会话</span><ChevronRight size={14} /></button>
        <Button className="agent-studio-new-session" variant="ghost" icon={<Plus size={15} />} onClick={() => { const next = createSessionId(); saveSessionId(workspaceId, next); setSessionId(next); setMessages([]); setStreamingMessage(undefined); }}>新建会话</Button>
        <div className="agent-studio-archive"><span className="agent-studio-section-label">只读档案</span><button type="button" className="agent-studio-archive-item" onClick={() => setStatus("旧 Guide/Edit 历史以未绑定只读档案展示。")}><FileText size={14} />旧版历史</button></div>
        <nav className="agent-studio-nav" aria-label="卡片编辑入口">
          <button type="button" onClick={() => openEditor("home")}><FolderOpen size={15} />资源与文件</button>
          <button type="button" onClick={() => openEditor("preview")}><PanelRight size={15} />预览</button>
          <button type="button" onClick={() => openEditor("settings")}><Settings2 size={15} />设置</button>
        </nav>
      </aside>

      <section className="agent-studio-main">
        <header className="agent-studio-header"><div><span className="agent-studio-eyebrow">当前工作区</span><h2>{getCardDisplayName(card, t)}</h2></div><div className="agent-studio-header-status"><span className={report.valid ? "agent-status-chip" : "agent-status-chip danger"}><ShieldCheck size={14} />{report.valid ? "校验通过" : report.errors.length + " 个阻塞错误"}</span><span className="agent-status-chip">rev {cardRevision}</span><button type="button" className="agent-stop-button" onClick={() => controller.abort()} disabled={!controller.isStreaming}><CircleStop size={15} />停止</button>{!rightOpen ? <Button className="agent-inspector-toggle" variant="ghost" icon={<PanelRight size={15} />} onClick={reopenInspector}>打开纲要</Button> : null}</div></header>
        <div className="agent-studio-transcript" aria-live="polite">
          {transcript.length === 0 ? <div className="agent-empty-state"><div className="agent-empty-icon"><Sparkles size={24} /></div><h3>从卡片事实开始</h3><p>先读取当前卡片、校验或 Token 统计，再让 Agent 创建待审核提案。用户确认前不会修改卡片或文件。</p><div className="agent-suggestion-row">{["检查这张卡的问题", "读取提示词和开场白", "优化 Token 占用"].map((suggestion) => <button type="button" key={suggestion} onClick={() => setInput(suggestion)}>{suggestion}</button>)}</div></div> : transcript.map((turn, index) => <AgentTranscriptTurnView key={`${turn.userText}-${index}`} turn={turn} />)}
          {events.filter((event) => event.type === "status").slice(-3).map((event, index) => <div className="agent-runtime-status" key={(event.message ?? "status") + "-" + index}>{event.message}</div>)}
          {proposals.filter((proposal) => proposal.state === "pending" || proposal.state === "conflicted").map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} onApply={() => void applyProposal(proposal)} onDiscard={() => discardProposal(proposal)} />)}
        </div>
        <form className="agent-composer" onSubmit={(event) => { event.preventDefault(); void submit(); }}><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => handleComposerKeyDown(event, submit)} placeholder="描述你想检查、整理或提出的修改… 支持 @目标范围" rows={3} /><div className="agent-composer-footer"><span><SquarePen size={14} />Agent 只读 + 提案模式</span><div className="agent-composer-actions"><Button type="button" variant="ghost" icon={<MessageSquarePlus size={14} />} disabled={!input.trim() || !controller.isStreaming} onClick={() => void queueFollowUp()}>完成后继续</Button><Button type="submit" icon={<Send size={15} />} disabled={!input.trim()}>发送</Button></div></div></form>
      </section>

      {rightOpen ? <button className="agent-inspector-backdrop" type="button" aria-label="关闭编辑台" onClick={closeInspector} /> : null}
      <aside ref={inspectorRef} className="agent-studio-inspector" role={rightOpen ? "dialog" : undefined} aria-modal={rightOpen ? true : undefined} aria-label="卡片纲要与编辑台">
        <div className="agent-inspector-heading"><div className="agent-inspector-heading-copy"><span>{focusedEditor ? getEditorLabel(focusedEditor) : "卡片纲要"}</span>{focusedEditor ? <button className="agent-inspector-overview-button" type="button" onClick={returnToOverview}>返回纲要</button> : null}</div><button ref={inspectorCloseRef} type="button" onClick={closeInspector} aria-label="关闭编辑台">×</button></div>
        {focusedEditor ? <Suspense fallback={<div className="agent-inspector-loading">正在加载编辑台…</div>}><EditorPanel tab={focusedEditor} /></Suspense> : <InspectorOverview card={card} report={report} proposals={proposals} onOpenEditor={openEditor} />}
        <div
          className="agent-inspector-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整编辑台宽度"
          tabIndex={0}
          aria-valuemin={420}
          aria-valuemax={720}
          aria-valuenow={rightOpen ? inspectorWidth : 0}
          onPointerDown={handleInspectorResize}
          onKeyDown={handleInspectorResizeKeyDown}
        />
      </aside>
    </section>
  );
}

function EditorPanel({ tab }: { tab: StudioEditorTab }) {
  switch (tab) {
    case "basic": return <BasicInfoPanel />;
    case "prompts": return <PromptPanel />;
    case "greetings": return <GreetingsPanel />;
    case "lorebook": return <LorebookPanel />;
    case "assets": return <AssetsPanel />;
    case "preview": return <PreviewPanel />;
    case "tokenStats": return <TokenStatsPanel />;
    case "validation": return <ValidationPanel />;
    case "settings": return <SettingsPanel />;
    default: return <ImportExportPanel />;
  }
}

function getEditorLabel(tab: StudioEditorTab): string {
  switch (tab) {
    case "home": return "资源与文件";
    case "basic": return "基础信息";
    case "prompts": return "提示词";
    case "greetings": return "开场白";
    case "lorebook": return "世界书";
    case "assets": return "资源";
    case "preview": return "预览";
    case "tokenStats": return "Token 统计";
    case "validation": return "校验";
    case "settings": return "设置";
  }
}

function InspectorOverview({ card, report, proposals, onOpenEditor }: { card: ReturnType<typeof useCardStore.getState>["card"]; report: ReturnType<typeof useCardStore.getState>["report"]; proposals: CardProposal[]; onOpenEditor: (tab: StudioEditorTab) => void }) {
  const stats = buildCardTokenStats(card);
  return <div className="agent-inspector-overview"><section className="agent-inspector-block"><span className="agent-inspector-label">CCv3 索引</span><div className="agent-index-grid">{[["基础", "basic"], ["提示词", "prompts"], ["开场白", "greetings"], ["世界书", "lorebook"], ["资源", "assets"]].map(([label, tab]) => <button type="button" key={tab} onClick={() => onOpenEditor(tab as StudioEditorTab)}><span>{label}</span><ChevronRight size={13} /></button>)}</div></section><section className="agent-inspector-block"><div className="agent-block-title"><span>待审核修改</span><b>{proposals.filter((proposal) => proposal.state === "pending" || proposal.state === "conflicted").length}</b></div>{proposals.length === 0 ? <p className="agent-muted">暂无提案。Agent 只能创建提案，不能直接写入。</p> : proposals.slice(-3).map((proposal) => <div className="agent-mini-proposal" key={proposal.id}><strong>{proposal.summary}</strong><span>{proposal.diffs.length} 个字段 · {proposal.state}</span></div>)}</section><section className="agent-inspector-block"><div className="agent-block-title"><span>状态</span><button type="button" onClick={() => onOpenEditor("validation")}><ChevronRight size={13} /></button></div><p className={report.valid ? "agent-good" : "agent-danger"}>{report.valid ? "当前卡片通过前端校验" : report.errors.length + " 个错误需要处理"}</p><p className="agent-muted">{report.warnings.length} 个警告 · {stats.totalTokens.toLocaleString()} estimated tokens</p></section></div>;
}

function ProposalCard({ proposal, onApply, onDiscard }: { proposal: CardProposal; onApply: () => void; onDiscard: () => void }) {
  return <article className={proposal.state === "conflicted" ? "agent-proposal-card conflicted" : "agent-proposal-card"}><div className="agent-proposal-heading"><span>{proposal.state === "conflicted" ? "冲突提案" : "待审核提案"}</span><code>{proposal.id.slice(-8)}</code></div><strong>{proposal.summary}</strong><div className="agent-proposal-diffs">{proposal.diffs.slice(0, 4).map((diff) => <div key={diff.path}><code>{diff.path}</code><span>{diff.after}</span></div>)}</div>{proposal.state === "conflicted" ? <p className="agent-danger">当前字段已被修改，请重新读取卡片后生成提案。</p> : null}<div className="agent-proposal-actions"><Button variant="ghost" onClick={onDiscard}>丢弃</Button>{proposal.state === "pending" ? <Button icon={<Check size={14} />} onClick={onApply}>确认应用</Button> : null}</div></article>;
}

function AgentTranscriptTurnView({ turn }: { turn: AgentTranscriptTurn }) {
  const hasAssistantContent = Boolean(turn.assistantText || turn.tools.length > 0 || turn.streaming);
  return <div className="agent-transcript-turn">
    {turn.userText ? <div className="agent-message agent-message-user"><span className="agent-message-role">你</span><MarkdownMessage className="agent-message-content" text={turn.userText} /></div> : null}
    {hasAssistantContent ? <article className="agent-message agent-message-assistant" aria-busy={turn.streaming}>
      <span className="agent-message-role">Agent</span>
      {turn.assistantText ? <><MarkdownMessage className="agent-message-content" text={turn.assistantText} />{turn.streaming ? <span className="agent-message-caret" aria-label="正在生成">▍</span> : null}</> : <div className="agent-message-content agent-message-placeholder">正在读取卡片信息…</div>}
      {turn.tools.length > 0 ? <AgentToolTrace tools={turn.tools} /> : null}
    </article> : null}
  </div>;
}

function AgentToolTrace({ tools }: { tools: AgentTranscriptTool[] }) {
  return <details className="agent-tool-trace">
    <summary><span>工具轨迹</span><span>{tools.length} 次调用</span></summary>
    <div className="agent-tool-trace-list">
      {tools.map((tool, index) => <AgentToolResultView key={`${tool.toolName}-${index}`} tool={tool} />)}
    </div>
  </details>;
}

function AgentToolResultView({ tool }: { tool: AgentTranscriptTool }) {
  const [open, setOpen] = useState(false);
  return <div className={tool.isError ? "agent-tool-result is-error" : "agent-tool-result"}>
    <div className="agent-tool-result-heading"><span>{tool.toolName}</span><span>{tool.isError ? "失败" : "已完成"}</span></div>
    {open && tool.content ? <pre>{formatAgentToolContent(tool.content)}</pre> : <span className="agent-muted">{tool.isError ? "工具执行失败。" : "工具已返回结果。"}</span>}
    <button className="agent-tool-result-toggle" type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}>{open ? "收起结果" : "查看结果"}</button>
  </div>;
}

function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, submit: () => void) {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    submit();
  }
}

function readSessionId(workspaceId: string): string {
  if (typeof localStorage === "undefined") return createSessionId();
  return localStorage.getItem("sillytavern-card-creator:agent-session:" + workspaceId) || createSessionId();
}

function saveSessionId(workspaceId: string, sessionId: string): void {
  if (typeof localStorage !== "undefined") localStorage.setItem("sillytavern-card-creator:agent-session:" + workspaceId, sessionId);
}

function createSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? "agent-session-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

async function persistAgentEvent(workspaceId: string, sessionId: string, event: AgentControllerEvent): Promise<void> {
  if ((event.type !== "message_end" && event.type !== "tool_execution_start" && event.type !== "tool_execution_end") || !event.event) return;
  const message = "message" in event.event ? event.event.message : undefined;
  const now = Date.now();
  try {
    await invoke("save_agent_session", {
      session: {
        id: sessionId,
        workspaceId,
        title: "Card Agent session",
        createdAt: now,
        updatedAt: now,
        summary: message && "content" in message && typeof message.content === "string" ? message.content.slice(0, 240) : null
      }
    });
    await invoke("append_agent_entry", {
      entry: {
        id: createSessionId(),
        workspaceId,
        sessionId,
        role: message?.role ?? (event.type === "tool_execution_end" ? "toolResult" : event.type === "tool_execution_start" ? "toolCall" : "assistant"),
        payload: event.event,
        createdAt: now,
        position: now
      }
    });
  } catch {
    // The browser preview has no SQLite bridge; keep the in-memory transcript usable.
  }
}

async function persistAgentProposal(proposal: CardProposal): Promise<void> {
  try {
    await invoke("save_agent_proposal", {
      proposal: {
        id: proposal.id,
        workspaceId: proposal.workspaceId,
        sessionId: proposal.sessionId,
        state: proposal.state,
        payload: proposal,
        createdAt: proposal.createdAt,
        updatedAt: proposal.updatedAt
      }
    });
  } catch {
    // Keep proposal review available when the desktop bridge is unavailable.
  }
}

async function persistWorkspace(workspaceId: string, currentPath: string | null, cardRevision: number): Promise<void> {
  const now = Date.now();
  try {
    await invoke("save_card_workspace", {
      workspace: {
        id: workspaceId,
        currentPath,
        cardRevision,
        createdAt: now,
        updatedAt: now
      }
    });
  } catch {
    // Workspace identity remains available from the draft metadata in browser preview.
  }
}

async function hydrateAgentSession(sessionId: string): Promise<unknown[]> {
  try {
    const entries = await invoke<Array<{ payload?: unknown }>>("list_agent_entries", { sessionId });
    const inFlight = new Map<string, string>();
    const messages: unknown[] = [];
    entries.forEach((entry) => {
      const payload = entry.payload;
      if (!payload || typeof payload !== "object") return;
      const type = "type" in payload ? (payload as { type?: string }).type : undefined;
      if (type === "tool_execution_start") {
        const tool = payload as { toolCallId?: string; toolName?: string };
        if (tool.toolCallId) inFlight.set(tool.toolCallId, tool.toolName ?? "tool");
        return;
      }
      if (type === "tool_execution_end") {
        const tool = payload as { toolCallId?: string; toolName?: string; result?: unknown; isError?: boolean };
        if (tool.toolCallId) inFlight.delete(tool.toolCallId);
        messages.push({ role: "toolResult", toolName: tool.toolName, isError: tool.isError, content: JSON.stringify(tool.result ?? null) });
        return;
      }
      if ("message" in payload) messages.push((payload as { message: unknown }).message);
    });
    inFlight.forEach((toolName) => messages.push({ role: "toolResult", toolName, isError: true, content: "上次运行在工具返回前中断。" }));
    return messages.filter(Boolean);
  } catch {
    return [];
  }
}

async function hydrateAgentProposals(workspaceId: string): Promise<CardProposal[]> {
  try {
    const records = await invoke<Array<{ payload?: unknown }>>("list_agent_proposals", { workspaceId });
    return records.map((record) => record.payload).filter((payload): payload is CardProposal => Boolean(payload && typeof payload === "object" && "id" in payload && "workspaceId" in payload));
  } catch {
    return [];
  }
}
