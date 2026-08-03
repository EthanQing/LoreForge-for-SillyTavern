import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ChevronRight, CircleStop, FolderOpen, MessageSquarePlus, PanelRight, Pencil, Plus, RefreshCw, Send, Settings2, ShieldCheck, Sparkles, SquarePen } from "lucide-react";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { useCardStore } from "../../app/store";
import { useProjectActions } from "../../app/useProjectActions";
import { getCardDisplayName } from "../../app/cardIdentity";
import { Button } from "../../components/Button";
import { MarkdownMessage } from "../../components/MarkdownMessage";
import { buildCardTokenStats } from "../../lib/tokenStats";
import { toAiConnectionProfile } from "../../lib/ai";
import { applyCardProposal, type CardProposal } from "../../lib/agent/contracts";
import { CardAgentController, type AgentControllerEvent } from "../../lib/agent/controller";
import { getConversationActionTarget, getLatestTurnToolCallIds, getMessagesBeforeLastUser } from "../../lib/agent/conversationActions";
import { getProposalStateLabel, getProposalSummary, isReviewableProposal } from "../../lib/agent/proposalPresentation";
import { buildAgentTranscript, formatAgentToolContent, readAgentMessageContent, type AgentTranscriptTool, type AgentTranscriptTurn } from "../../lib/agent/transcript";
import type { CharacterCardV3 } from "../../lib/schema";
import { useI18n } from "../../lib/i18n";
import { AgentSessionHistory } from "./AgentSessionHistory";
import type { AgentSessionHistoryRecord } from "../../lib/agent/sessionHistory";
import { AgentStudioContext, buildFieldActionInstruction, resolveFieldActionPermission, type AgentFieldAction, type AgentFieldTarget } from "../../lib/agent/uiContext";
import {
  decodeAgentRequest,
  describeAgentPermission,
  encodeAgentRequest,
  permissionForPreset,
  resolveAgentRequest,
  resolveReplacementAgentRequest,
  type AgentScopePreset
} from "../../lib/agent/permissions";
import {
  hydrateAgentProposals,
  hydrateAgentSession,
  hydrateAgentSessionHistory,
  persistAgentBranch,
  persistAgentEvent,
  persistAgentProposal,
  persistAgentSessionTitle,
  persistWorkspace
} from "../../lib/agent/persistence";
import { generateAgentSessionTitle, getAgentSessionTitleSource, PENDING_AGENT_SESSION_TITLE } from "../../lib/agent/sessionTitle";
import { ProposalCard } from "./ProposalCard";
import { AgentMentionMenu, AGENT_MENTION_LISTBOX_ID, getAgentMentionOptionId } from "./AgentMentionMenu";
import { findLorebookMentionRange, getLorebookMentionOptions, insertLorebookMention, type LorebookMentionOption, type LorebookMentionRange } from "./agentMention";

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
type ConversationOperation = "idle" | "regenerating" | "resending";

interface ConversationSnapshot {
  mode: Exclude<ConversationOperation, "idle">;
  messages: AgentMessage[];
  streamingMessage?: AgentMessage;
  proposals: CardProposal[];
  card: CharacterCardV3;
  cardRevision: number;
}

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
  const { openCard, saveCardSnapshot } = useProjectActions();
  const cardName = getCardDisplayName(card, t);
  const [sessionId, setSessionId] = useState(() => readSessionId(workspaceId));
  const [input, setInput] = useState("");
  const [mentionRange, setMentionRange] = useState<LorebookMentionRange>();
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [requestScope, setRequestScope] = useState<AgentScopePreset>("card");
  const [messages, setMessages] = useState<unknown[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<unknown>();
  const [events, setEvents] = useState<AgentControllerEvent[]>([]);
  const [proposals, setProposals] = useState<CardProposal[]>([]);
  const [sessionHistory, setSessionHistory] = useState<AgentSessionHistoryRecord[]>([]);
  const [generatingTitleSessionIds, setGeneratingTitleSessionIds] = useState<Set<string>>(() => new Set());
  const [rightOpen, setRightOpen] = useState(true);
  const [inspectorWidth, setInspectorWidth] = useState(560);
  const [focusedEditor, setFocusedEditor] = useState<StudioEditorTab | null>(null);
  const [conversationOperation, setConversationOperation] = useState<ConversationOperation>("idle");
  const [editingLastUser, setEditingLastUser] = useState(false);
  const [editedUserText, setEditedUserText] = useState("");
  const controllerRef = useRef<CardAgentController | null>(null);
  const inspectorRef = useRef<HTMLElement | null>(null);
  const inspectorCloseRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const actionLockRef = useRef(false);
  const conversationSnapshotsRef = useRef<ConversationSnapshot[]>([]);
  const titleAttemptedSessionIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const nextSessionId = readSessionId(workspaceId);
    setSessionId(nextSessionId);
    setMessages([]);
    setStreamingMessage(undefined);
    setEvents([]);
    setProposals([]);
    setConversationOperation("idle");
    setEditingLastUser(false);
    setEditedUserText("");
    setRequestScope("card");
    setMentionRange(undefined);
    actionLockRef.current = false;
    conversationSnapshotsRef.current = [];
    controllerRef.current?.dispose();
    controllerRef.current = null;
  }, [workspaceId]);

  useEffect(() => {
    const record = sessionHistory.find((item) => item.id === sessionId);
    if (!record || record.title.trim() !== PENDING_AGENT_SESSION_TITLE || titleAttemptedSessionIdsRef.current.has(sessionId)) return;
    const source = getAgentSessionTitleSource(messages as AgentMessage[]);
    if (!source || !aiSettings.enabled || !aiSettings.baseUrl.trim() || !aiSettings.model.trim()) return;

    titleAttemptedSessionIdsRef.current.add(sessionId);
    setGeneratingTitleSessionIds((current) => new Set(current).add(sessionId));
    void generateAgentSessionTitle(toAiConnectionProfile(aiSettings), source)
      .then(async (title) => {
        if (!await persistAgentSessionTitle(sessionId, title)) return;
        setSessionHistory((current) => current.map((item) => item.id === sessionId ? { ...item, title } : item));
      })
      .catch(() => undefined)
      .finally(() => {
        setGeneratingTitleSessionIds((current) => {
          const next = new Set(current);
          next.delete(sessionId);
          return next;
        });
      });
  }, [aiSettings, messages, sessionHistory, sessionId]);

  useEffect(() => {
    let active = true;
    void hydrateAgentSession(sessionId).then((stored) => {
      if (!active) return;
      controllerRef.current?.restoreMessages(stored as AgentMessage[]);
      if (stored.length === 0) return;
      setMessages(stored);
    });
    void hydrateAgentProposals(workspaceId).then((stored) => {
      if (!active || stored.length === 0) return;
      setProposals(stored.filter((proposal) => proposal.sessionId === sessionId));
    });
    return () => { active = false; };
  }, [sessionId, workspaceId]);

  useEffect(() => {
    let active = true;
    void hydrateAgentSessionHistory().then((stored) => {
      if (active) setSessionHistory(stored);
    });
    return () => { active = false; };
  }, [workspaceId]);

  useEffect(() => {
    void persistWorkspace(workspaceId, currentPath, cardRevision, cardName);
  }, [cardName, cardRevision, currentPath, workspaceId]);

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
        thinkingLevel: aiSettings.thinkingLevel,
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
        void persistAgentEvent(workspaceId, sessionId, event).then(() => hydrateAgentSessionHistory()).then(setSessionHistory);
      },
      onProposal: (proposal) => {
        setProposals((current) => [...current.filter((item) => item.id !== proposal.id), proposal]);
        void persistAgentProposal(proposal);
      }
    });
    controllerRef.current = next;
    return next;
  }, [aiSettings, sessionId, workspaceId]);

  useEffect(() => () => controller.dispose(), [controller]);

  useEffect(() => {
    controller.restoreMessages(messages as AgentMessage[]);
  }, [controller]);

  const mentionOptions = useMemo(
    () => mentionRange ? getLorebookMentionOptions(card, mentionRange.query) : [],
    [card, mentionRange]
  );
  const activeMentionIndex = Math.min(mentionActiveIndex, Math.max(0, mentionOptions.length - 1));
  const activeMention = mentionOptions[activeMentionIndex];

  const syncMention = (value: string, cursor: number | null) => {
    const nextRange = cursor === null ? undefined : findLorebookMentionRange(value, cursor);
    const unchanged = nextRange?.start === mentionRange?.start
      && nextRange?.end === mentionRange?.end
      && nextRange?.query === mentionRange?.query;
    setMentionRange(nextRange);
    if (!unchanged) {
      setMentionActiveIndex(0);
    }
  };

  const selectMention = (option: LorebookMentionOption) => {
    if (!mentionRange) return;
    const next = insertLorebookMention(input, mentionRange, option);
    setInput(next.value);
    setMentionRange(undefined);
    setMentionActiveIndex(0);
    setRequestScope("worldbook");
    requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(next.cursor, next.cursor);
    });
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionRange && mentionOptions.length > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setMentionActiveIndex((current) => (current + direction + mentionOptions.length) % mentionOptions.length);
      return;
    }
    if (mentionRange && activeMention && event.key === "Tab") {
      event.preventDefault();
      selectMention(activeMention);
      return;
    }
    if (mentionRange && event.key === "Escape") {
      event.preventDefault();
      setMentionRange(undefined);
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  };

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
    if (!message || editingLastUser || conversationOperation !== "idle") return;
    try {
      const request = resolveAgentRequest(message, useCardStore.getState().card, requestScope);
      if (!request.instruction) throw new Error("请在目标范围后输入具体指令。");
      setInput("");
      setMentionRange(undefined);
      setEvents((current) => [...current, { type: "status", message: `正在运行 Agent · ${describeAgentPermission(request.permission)}` }]);
      await controller.send(encodeAgentRequest(request.permission, message), request.permission);
      setMessages([...controller.messages]);
      setStreamingMessage(controller.streamingMessage);
      saveSessionId(workspaceId, sessionId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, [controller, conversationOperation, editingLastUser, input, requestScope, sessionId, setStatus, workspaceId]);

  const queueFollowUp = useCallback(async () => {
    const message = input.trim();
    if (!message || editingLastUser || conversationOperation !== "idle") return;
    try {
      const request = resolveAgentRequest(message, useCardStore.getState().card, requestScope);
      if (!request.instruction) throw new Error("请在目标范围后输入具体指令。");
      setInput("");
      setMentionRange(undefined);
      await controller.continueAfterRun(encodeAgentRequest(request.permission, message), request.permission);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, [controller, conversationOperation, editingLastUser, input, requestScope, setStatus]);

  const applyProposal = useCallback(async (proposal: CardProposal) => {
    if (actionLockRef.current || conversationOperation !== "idle") return;
    const current = useCardStore.getState();
    const outcome = applyCardProposal(proposal, current.card, current.cardRevision, proposal.selectedCandidateIds);
    if (outcome.state !== "applied") {
      const blockedProposal = { ...proposal, state: outcome.state === "conflicted" ? "conflicted" as const : "pending" as const, updatedAt: Date.now() };
      setProposals((items) => items.map((item) => item.id === proposal.id ? blockedProposal : item));
      void persistAgentProposal(blockedProposal);
      setStatus(outcome.reasons.join(" "));
      return;
    }
    applyAgentCard(outcome.card, "已应用 Agent 提案，等待保存。");
    const appliedProposal = { ...proposal, rollbackCard: cloneValue(current.card), state: "applied" as const, saveState: "not-needed" as const, updatedAt: Date.now() };
    setProposals((items) => items.map((item) => item.id === proposal.id ? appliedProposal : item));
    const saveState = await saveCardSnapshot(outcome.card, { promptIfUnbound: false, savedStatus: "Agent 提案已应用。" });
    const savedProposal = { ...appliedProposal, saveState, updatedAt: Date.now() };
    setProposals((items) => items.map((item) => item.id === proposal.id ? savedProposal : item));
    void persistAgentProposal(savedProposal);
  }, [applyAgentCard, conversationOperation, saveCardSnapshot, setStatus]);

  const toggleCandidate = useCallback((proposal: CardProposal, candidateId: string, selected: boolean) => {
    if (proposal.state !== "pending" || conversationOperation !== "idle") return;
    const nextIds = selected
      ? [...new Set([...proposal.selectedCandidateIds, candidateId])]
      : proposal.selectedCandidateIds.filter((id) => id !== candidateId);
    const updated = { ...proposal, selectedCandidateIds: nextIds, updatedAt: Date.now() };
    setProposals((items) => items.map((item) => item.id === proposal.id ? updated : item));
    void persistAgentProposal(updated);
  }, [conversationOperation]);

  const discardProposal = useCallback((proposal: CardProposal) => {
    if (actionLockRef.current || conversationOperation !== "idle") return;
    const discardedProposal = { ...proposal, state: "discarded" as const, updatedAt: Date.now() };
    setProposals((items) => items.map((item) => item.id === proposal.id ? discardedProposal : item));
    void persistAgentProposal(discardedProposal);
  }, [conversationOperation]);

  const scrollTranscriptToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const transcriptElement = transcriptRef.current;
      if (!transcriptElement) return;
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      transcriptElement.scrollTo({ top: transcriptElement.scrollHeight, behavior: reducedMotion ? "auto" : "smooth" });
    });
  }, []);

  const beginEditLastUser = useCallback(() => {
    if (actionLockRef.current || conversationOperation !== "idle" || controller.isStreaming) return;
    const target = getConversationActionTarget(messages as AgentMessage[], streamingMessage as AgentMessage | undefined);
    if (!target.lastUserMessage) return;
    setEditedUserText(decodeAgentRequest(readMessageText(target.lastUserMessage)).instruction);
    setEditingLastUser(true);
  }, [conversationOperation, controller, messages, streamingMessage]);

  const cancelEditLastUser = useCallback(() => {
    if (conversationOperation !== "idle") return;
    setEditingLastUser(false);
    setEditedUserText("");
  }, [conversationOperation]);

  const rollbackRelatedProposals = useCallback(async (relatedProposals: CardProposal[], originalCard: CharacterCardV3) => {
    const appliedProposals = relatedProposals.filter((proposal) => proposal.state === "applied");
    if (appliedProposals.length > 0) {
      const firstApplied = [...appliedProposals].sort((left, right) => left.createdAt - right.createdAt)[0];
      if (!firstApplied.rollbackCard) {
        throw new Error("上一轮 Agent 提案缺少回退快照，无法安全重新生成。");
      }
      const rollbackCard = cloneValue(firstApplied.rollbackCard);
      applyAgentCard(rollbackCard, "正在回退上一轮 Agent 应用。");
      const saveState = await saveCardSnapshot(rollbackCard, { promptIfUnbound: false, savedStatus: "已回退上一轮 Agent 应用。" });
      if (saveState === "failed") {
        applyAgentCard(originalCard, "回退保存失败，已恢复重新生成前的卡片状态。");
        throw new Error("上一轮 Agent 应用已回退到内存，但保存回退结果失败，已停止重新生成。");
      }
    }

    const discardedProposals = relatedProposals.map((proposal) => ({ ...proposal, state: "discarded" as const, updatedAt: Date.now() }));
    setProposals((items) => items.map((item) => discardedProposals.find((discarded) => discarded.id === item.id) ?? item));
    await Promise.all(discardedProposals.map((proposal) => persistAgentProposal(proposal)));
  }, [applyAgentCard, saveCardSnapshot]);

  const replaceConversation = useCallback(async (mode: Exclude<ConversationOperation, "idle">, replacementText?: string) => {
    if (actionLockRef.current || conversationOperation !== "idle" || controller.isStreaming) return;

    const currentMessages = messages as AgentMessage[];
    const target = getConversationActionTarget(currentMessages, streamingMessage as AgentMessage | undefined);
    if (!target.lastUserMessage || (mode === "regenerating" && !target.canRegenerate)) return;

    let replacementRequest;
    try {
      replacementRequest = resolveReplacementAgentRequest(readMessageText(target.lastUserMessage), requestScope, replacementText);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      return;
    }
    const { instruction: userText, permission } = replacementRequest;
    if (!userText.trim()) return;
    const encodedRequest = encodeAgentRequest(permission, userText);

    const baseMessages = getMessagesBeforeLastUser(currentMessages);
    const toolCallIds = getLatestTurnToolCallIds(currentMessages);
    const relatedProposals = proposals.filter((proposal) => proposal.sessionId === sessionId && toolCallIds.includes(proposal.toolCallId) && proposal.state !== "discarded");
    const snapshot: ConversationSnapshot = {
      mode,
      messages: cloneValue(currentMessages),
      streamingMessage: streamingMessage ? cloneValue(streamingMessage as AgentMessage) : undefined,
      proposals: cloneValue(proposals),
      card: cloneValue(useCardStore.getState().card),
      cardRevision: useCardStore.getState().cardRevision
    };
    conversationSnapshotsRef.current = [...conversationSnapshotsRef.current.slice(-7), snapshot];
    actionLockRef.current = true;
    setConversationOperation(mode);
    setEditingLastUser(false);
    setEditedUserText("");
    setInput("");
    const permissionLabel = describeAgentPermission(permission);
    setEvents([{ type: "status", message: `${mode === "regenerating" ? "正在重新生成最后一条 Agent 消息" : "正在重新发送最后一条用户消息"} · ${permissionLabel}` }]);
    setMessages(baseMessages);
    setStreamingMessage(undefined);
    scrollTranscriptToBottom();

    let branchPrepared = false;
    try {
      await controller.replaceConversation(baseMessages, encodedRequest, permission, async () => {
        await rollbackRelatedProposals(relatedProposals, snapshot.card);
        const persisted = await persistAgentBranch(workspaceId, sessionId, mode, baseMessages, relatedProposals.map((proposal) => proposal.id));
        if (!persisted) {
          setStatus("当前环境无法保存对话分支标记，本次会话仍可继续，但重启后可能无法恢复该分支。");
        }
        branchPrepared = true;
      });
      setMessages([...controller.messages]);
      setStreamingMessage(controller.streamingMessage);
      scrollTranscriptToBottom();
    } catch (error) {
      if (!branchPrepared) {
        controller.restoreMessages(snapshot.messages);
        setMessages(snapshot.messages);
        setStreamingMessage(snapshot.streamingMessage);
        setProposals(snapshot.proposals);
        applyAgentCard(snapshot.card, "重新生成未开始，已恢复原始卡片状态。");
      } else {
        setMessages([...controller.messages]);
        setStreamingMessage(controller.streamingMessage);
      }
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      actionLockRef.current = false;
      setConversationOperation("idle");
    }
  }, [applyAgentCard, conversationOperation, controller, messages, proposals, requestScope, rollbackRelatedProposals, sessionId, setStatus, streamingMessage, workspaceId, scrollTranscriptToBottom]);

  const selectSession = useCallback(async (record: AgentSessionHistoryRecord) => {
    if (actionLockRef.current || conversationOperation !== "idle") return;
    if (record.workspaceId === workspaceId) {
      saveSessionId(workspaceId, record.id);
      if (record.id === sessionId) return;
      controllerRef.current?.dispose();
      controllerRef.current = null;
      setSessionId(record.id);
      setMessages([]);
      setStreamingMessage(undefined);
      setEvents([]);
      setProposals([]);
      setEditingLastUser(false);
      setEditedUserText("");
      conversationSnapshotsRef.current = [];
      return;
    }
    if (!record.currentPath) {
      setStatus("该角色卡没有可重新打开的文件路径，无法切换会话。");
      return;
    }
    saveSessionId(record.workspaceId, record.id);
    await openCard(record.currentPath);
  }, [conversationOperation, openCard, sessionId, setStatus, workspaceId]);

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

  const agentReady = Boolean(aiSettings.enabled && aiSettings.baseUrl.trim() && aiSettings.model.trim());
  const runFieldAction = useCallback(async (target: AgentFieldTarget, action: AgentFieldAction) => {
    if (!agentReady) throw new Error("请先配置可用的 Agent 模型与系统凭据。");
    if (conversationOperation !== "idle" || controller.isStreaming) throw new Error("Agent 正在处理另一项请求，请稍后重试。");
    const currentCard = useCardStore.getState().card;
    const permission = resolveFieldActionPermission(currentCard, target);
    const instruction = buildFieldActionInstruction(target, action);
    setFocusedEditor(null);
    setRightOpen(false);
    setEvents((current) => [...current, { type: "status", message: `字段请求已发送 · ${describeAgentPermission(permission)}` }]);
    await controller.send(encodeAgentRequest(permission, instruction), permission);
    setMessages([...controller.messages]);
    setStreamingMessage(controller.streamingMessage);
    saveSessionId(workspaceId, sessionId);
    scrollTranscriptToBottom();
  }, [agentReady, controller, conversationOperation, scrollTranscriptToBottom, sessionId, workspaceId]);

  const prepareLorebookRequest = useCallback(() => {
    setRequestScope("worldbook");
    setFocusedEditor(null);
    setRightOpen(false);
    setInput("");
    setMentionRange(undefined);
    requestAnimationFrame(() => composerRef.current?.focus());
  }, []);

  const transcript = buildAgentTranscript(messages, streamingMessage);
  const actionTarget = getConversationActionTarget(messages as AgentMessage[], streamingMessage as AgentMessage | undefined);
  const latestUserTurnIndex = transcript.reduce((lastIndex, turn, index) => turn.userText ? index : lastIndex, -1);
  const latestAssistantTurnIndex = actionTarget.canRegenerate
    ? transcript.reduce((lastIndex, turn, index) => turn.assistantPresent || turn.streaming ? index : lastIndex, -1)
    : -1;
  const actionBusy = conversationOperation !== "idle" || controller.isStreaming;
  const studioActions = useMemo(() => ({
    ready: agentReady,
    busy: actionBusy,
    runFieldAction,
    prepareLorebookRequest
  }), [actionBusy, agentReady, prepareLorebookRequest, runFieldAction]);

  return (
    <AgentStudioContext.Provider value={studioActions}>
    <section
      className={rightOpen ? "agent-studio agent-studio-inspector-open" : "agent-studio"}
      style={{ "--inspector-width": rightOpen ? `${inspectorWidth}px` : "0px" } as CSSProperties}
      aria-label="Agent Studio"
    >
      <aside className="agent-studio-sidebar">
        <div className="agent-studio-brand"><div className="agent-studio-mark"><Sparkles size={18} /></div><div><strong>Card Workshop</strong><span>AGENT STUDIO</span></div></div>
        <div className="agent-studio-card-summary"><span>当前卡片</span><strong>{cardName}</strong><small>{workspaceId.slice(0, 18)} · rev {cardRevision}</small></div>
        <AgentSessionHistory
          records={sessionHistory}
          current={{ workspaceId, sessionId, cardName, currentPath }}
          generatingTitleSessionIds={generatingTitleSessionIds}
          onSelectSession={selectSession}
        />
        <Button className="agent-studio-new-session" variant="ghost" icon={<Plus size={15} />} disabled={actionBusy} onClick={() => { const next = createSessionId(); saveSessionId(workspaceId, next); setSessionId(next); setMessages([]); setStreamingMessage(undefined); setEvents([]); setProposals([]); setEditingLastUser(false); setEditedUserText(""); conversationSnapshotsRef.current = []; }}>新建会话</Button>
        <nav className="agent-studio-nav" aria-label="卡片编辑入口">
          <button type="button" onClick={() => openEditor("home")}><FolderOpen size={15} />资源与文件</button>
          <button type="button" onClick={() => openEditor("preview")}><PanelRight size={15} />预览</button>
          <button type="button" onClick={() => openEditor("settings")}><Settings2 size={15} />设置</button>
        </nav>
      </aside>

      <section className="agent-studio-main">
        <header className="agent-studio-header"><div><span className="agent-studio-eyebrow">当前工作区</span><h2>{getCardDisplayName(card, t)}</h2></div><div className="agent-studio-header-status"><span className={report.valid ? "agent-status-chip" : "agent-status-chip danger"}><ShieldCheck size={14} />{report.valid ? "校验通过" : report.errors.length + " 个阻塞错误"}</span><span className="agent-status-chip">rev {cardRevision}</span><button type="button" className="agent-stop-button" onClick={() => controller.abort()} disabled={!controller.isStreaming}><CircleStop size={15} />停止</button>{!rightOpen ? <Button className="agent-inspector-toggle" variant="ghost" icon={<PanelRight size={15} />} onClick={reopenInspector}>打开纲要</Button> : null}</div></header>
        <div ref={transcriptRef} className="agent-studio-transcript" aria-live="polite">
          {transcript.length === 0 ? <div className="agent-empty-state"><div className="agent-empty-icon"><Sparkles size={24} /></div><h3>从卡片事实开始</h3><p>先读取当前卡片、校验或 Token 统计，再让 Agent 创建待审核提案。用户确认前不会修改卡片或文件。</p><div className="agent-suggestion-row">{["检查这张卡的问题", "读取提示词和开场白", "优化 Token 占用"].map((suggestion) => <button type="button" key={suggestion} onClick={() => setInput(suggestion)}>{suggestion}</button>)}</div></div> : transcript.map((turn, index) => <AgentTranscriptTurnView
            key={`${turn.userText}-${index}`}
            turn={turn}
            isLatestUser={index === latestUserTurnIndex}
            isLatestAssistant={index === latestAssistantTurnIndex}
            editingUser={editingLastUser && index === latestUserTurnIndex}
            editedUserText={editedUserText}
            actionBusy={actionBusy}
            operation={conversationOperation}
            onStartEdit={beginEditLastUser}
            onEditedUserTextChange={setEditedUserText}
            onCancelEdit={cancelEditLastUser}
            onResend={() => void replaceConversation("resending", editedUserText)}
            onRegenerate={() => void replaceConversation("regenerating")}
          />)}
          {events.filter((event) => event.type === "status").slice(-3).map((event, index) => <div className={`agent-runtime-status${event.statusTone ? ` is-${event.statusTone}` : ""}`} role={event.statusTone === "error" ? "alert" : "status"} key={(event.message ?? "status") + "-" + index}>{event.message}</div>)}
          {proposals.filter((proposal) => proposal.state === "pending" || proposal.state === "conflicted").map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} disabled={actionBusy} onApply={() => void applyProposal(proposal)} onDiscard={() => discardProposal(proposal)} onToggleCandidate={(candidateId, selected) => toggleCandidate(proposal, candidateId, selected)} />)}
        </div>
        <form className="agent-composer" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <div className="agent-composer-scope-row">
            <label htmlFor="agent-request-scope">权限范围</label>
            <select id="agent-request-scope" value={requestScope} onChange={(event) => setRequestScope(event.currentTarget.value as AgentScopePreset)} disabled={controller.isStreaming}>
              <option value="card">整张卡片</option><option value="basic">基础信息</option><option value="prompts">提示词</option><option value="greetings">开场白</option><option value="worldbook">世界书</option>
            </select>
            <span className="agent-scope-pill">{describeAgentPermission(permissionForPreset(requestScope))}</span>
          </div>
          {mentionRange ? (
            <AgentMentionMenu
              options={mentionOptions}
              activeIndex={activeMentionIndex}
              onActiveIndexChange={setMentionActiveIndex}
              onSelect={selectMention}
            />
          ) : null}
          <textarea
            ref={composerRef}
            role="combobox"
            aria-autocomplete="list"
            aria-controls={mentionRange ? AGENT_MENTION_LISTBOX_ID : undefined}
            aria-expanded={Boolean(mentionRange)}
            aria-activedescendant={mentionRange && activeMention ? getAgentMentionOptionId(activeMention.entryIndex) : undefined}
            aria-haspopup="listbox"
            aria-label="Agent 请求"
            aria-multiline="true"
            value={input}
            placeholder="描述你想检查、整理或提出的修改… 输入 @ 后选择世界书条目"
            rows={3}
            disabled={editingLastUser || conversationOperation !== "idle"}
            onBlur={() => setMentionRange(undefined)}
            onChange={(event) => {
              setInput(event.currentTarget.value);
              syncMention(event.currentTarget.value, event.currentTarget.selectionStart);
            }}
            onKeyDown={handleComposerKeyDown}
            onSelect={(event) => syncMention(event.currentTarget.value, event.currentTarget.selectionStart)}
          />
          <div className="agent-composer-footer"><span><SquarePen size={14} />前端固定权限 · 用户确认后写入</span><div className="agent-composer-actions"><Button type="button" variant="ghost" icon={<MessageSquarePlus size={14} />} disabled={!input.trim() || !controller.isStreaming || editingLastUser || conversationOperation !== "idle"} onClick={() => void queueFollowUp()}>完成后继续</Button><Button type="submit" icon={<Send size={15} />} disabled={!input.trim() || editingLastUser || conversationOperation !== "idle"}>发送</Button></div></div>
        </form>
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
    </AgentStudioContext.Provider>
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
  const reviewableProposals = proposals.filter(isReviewableProposal);
  return <div className="agent-inspector-overview"><section className="agent-inspector-block"><span className="agent-inspector-label">CCv3 索引</span><div className="agent-index-grid">{[["基础", "basic"], ["提示词", "prompts"], ["开场白", "greetings"], ["世界书", "lorebook"], ["资源", "assets"]].map(([label, tab]) => <button type="button" key={tab} onClick={() => onOpenEditor(tab as StudioEditorTab)}><span>{label}</span><ChevronRight size={13} /></button>)}</div></section><section className="agent-inspector-block"><div className="agent-block-title"><span>待审核修改</span><b aria-label={`${reviewableProposals.length} 个待审核修改`}>{reviewableProposals.length}</b></div><p className="agent-muted">Agent 只能创建修改提案；确认后才会写入卡片。</p>{reviewableProposals.length === 0 ? <p className="agent-muted">暂无待审核修改。</p> : reviewableProposals.slice(-3).map((proposal) => <div className="agent-mini-proposal" key={proposal.id}><strong>{getProposalSummary(proposal.summary)}</strong><span>{proposal.diffs.length} 个字段 · {getProposalStateLabel(proposal.state)}</span></div>)}</section><section className="agent-inspector-block"><div className="agent-block-title"><span>状态</span><button type="button" onClick={() => onOpenEditor("validation")}><ChevronRight size={13} /></button></div><p className={report.valid ? "agent-good" : "agent-danger"}>{report.valid ? "当前卡片通过前端校验" : report.errors.length + " 个错误需要处理"}</p><p className="agent-muted">{report.warnings.length} 个警告 · {stats.totalTokens.toLocaleString()} estimated tokens</p></section></div>;
}

interface AgentTranscriptTurnViewProps {
  turn: AgentTranscriptTurn;
  isLatestUser: boolean;
  isLatestAssistant: boolean;
  editingUser: boolean;
  editedUserText: string;
  actionBusy: boolean;
  operation: ConversationOperation;
  onStartEdit: () => void;
  onEditedUserTextChange: (value: string) => void;
  onCancelEdit: () => void;
  onResend: () => void;
  onRegenerate: () => void;
}

function AgentTranscriptTurnView({
  turn,
  isLatestUser,
  isLatestAssistant,
  editingUser,
  editedUserText,
  actionBusy,
  operation,
  onStartEdit,
  onEditedUserTextChange,
  onCancelEdit,
  onResend,
  onRegenerate
}: AgentTranscriptTurnViewProps) {
  const hasAssistantContent = turn.assistantPresent || Boolean(turn.assistantText || turn.tools.length > 0 || turn.streaming);
  const resendDisabled = actionBusy || !editedUserText.trim();
  return <div className="agent-transcript-turn">
    {turn.userText ? <div className="agent-message agent-message-user">
      <span className="agent-message-role">你</span>
      {editingUser ? <>
        <textarea
          className="agent-message-edit-input"
          value={editedUserText}
          onChange={(event) => onEditedUserTextChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancelEdit();
            }
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              if (!resendDisabled) onResend();
            }
          }}
          aria-label="编辑最后一条用户消息"
          rows={4}
          autoFocus
        />
        <div className="agent-message-actions agent-message-actions-user">
          <button type="button" className="agent-message-action-button" onClick={onCancelEdit} disabled={actionBusy}>取消</button>
          <button type="button" className="agent-message-action-button primary" onClick={onResend} disabled={resendDisabled} aria-busy={operation === "resending"}>
            {operation === "resending" ? <RefreshCw className="agent-action-spinner" size={13} /> : <Send size={13} />}
            {operation === "resending" ? "重新发送中…" : "重新发送"}
          </button>
        </div>
      </> : <>
        <MarkdownMessage className="agent-message-content" text={turn.userText} />
        {isLatestUser ? <div className="agent-message-actions agent-message-actions-user"><button type="button" className="agent-message-action-button" onClick={onStartEdit} disabled={actionBusy}><Pencil size={13} />编辑</button></div> : null}
      </>}
    </div> : null}
    {hasAssistantContent ? <article className="agent-message agent-message-assistant" aria-busy={turn.streaming}>
      <span className="agent-message-role">Agent</span>
      {turn.assistantStatus ? <div className={`agent-message-content agent-message-outcome is-${turn.assistantStatus}`} role="alert"><strong>{turn.assistantStatus === "aborted" ? "本轮生成已中断" : turn.assistantStatus === "incomplete" ? "本轮生成未完成" : "本轮生成失败"}</strong>{turn.assistantError ? <span>{turn.assistantError}</span> : <span>{turn.assistantStatus === "aborted" ? "可以重新生成本轮 Agent 消息。" : "未收到有效的 Agent 回复，可以重新生成。"}</span>}</div> : null}
      {turn.assistantText ? <><MarkdownMessage className="agent-message-content" text={turn.assistantText} />{turn.streaming ? <span className="agent-message-caret" aria-label="正在生成">▍</span> : null}</> : <div className="agent-message-content agent-message-placeholder">正在读取卡片信息…</div>}
      {turn.tools.length > 0 ? <AgentToolTrace tools={turn.tools} /> : null}
      {isLatestAssistant && !editingUser ? <div className="agent-message-actions agent-message-actions-agent"><button type="button" className="agent-message-action-button" onClick={onRegenerate} disabled={actionBusy} aria-busy={operation === "regenerating"}>
        {operation === "regenerating" ? <RefreshCw className="agent-action-spinner" size={13} /> : <RefreshCw size={13} />}
        {operation === "regenerating" ? "重新生成中…" : "重新生成"}
      </button></div> : null}
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

function readSessionId(workspaceId: string): string {
  if (typeof localStorage === "undefined") return createSessionId();
  localStorage.removeItem("sillytavern-card-creator:agent-session:" + workspaceId);
  return localStorage.getItem("sillytavern-card-creator:agent-v3-session:" + workspaceId) || createSessionId();
}

function saveSessionId(workspaceId: string, sessionId: string): void {
  if (typeof localStorage !== "undefined") localStorage.setItem("sillytavern-card-creator:agent-v3-session:" + workspaceId, sessionId);
}

function createSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? "agent-session-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

function readMessageText(message: AgentMessage): string {
  return readAgentMessageContent("content" in message ? message.content : "");
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
