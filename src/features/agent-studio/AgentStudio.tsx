import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ChevronRight, CircleStop, FolderOpen, MessageSquarePlus, Moon, PanelRight, Pencil, Plus, RefreshCw, Send, Settings2, ShieldCheck, Sparkles, SquarePen, Sun } from "lucide-react";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { useCardStore } from "../../app/store";
import { useProjectActions } from "../../app/useProjectActions";
import { getCardDisplayName, getCardIdentity } from "../../app/cardIdentity";
import { Button } from "../../components/Button";
import { MarkdownMessage } from "../../components/MarkdownMessage";
import { useContextMenuTarget } from "../../lib/contextMenuTargets";
import { buildCardTokenStats } from "../../lib/tokenStats";
import { toAiConnectionProfile } from "../../lib/ai";
import { applyCardProposal, type CardProposal } from "../../lib/agent/contracts";
import { CardAgentController, type AgentControllerEvent } from "../../lib/agent/controller";
import { getConversationActionTarget, getLatestTurnToolCallIds, getMessagesBeforeLastUser } from "../../lib/agent/conversationActions";
import { buildAgentTranscript, formatAgentToolContent, readAgentMessageContent, type AgentTranscriptTool, type AgentTranscriptTurn } from "../../lib/agent/transcript";
import type { CharacterCardV3, ValidationIssue, ValidationReport } from "../../lib/schema";
import { useI18n } from "../../lib/i18n";
import { buildValidationAgentInstruction, dispatchValidationNavigation, getValidationEditorTab, getValidationTargetPaths, listenForValidationNavigation, resolveValidationIssuePermission } from "../../lib/validationIssueNavigation";
import { AgentSessionHistory } from "./AgentSessionHistory";
import {
  getAdjacentAgentSession,
  isAgentSessionSelectable,
  type AgentSessionHistoryRecord,
  type CurrentAgentSession
} from "../../lib/agent/sessionHistory";
import { AgentStudioContext, buildFieldActionInstruction, resolveFieldActionPermission, type AgentFieldAction, type AgentFieldTarget } from "../../lib/agent/uiContext";
import {
  decodeAgentRequest,
  describeAgentPermission,
  encodeAgentRequest,
  getAllowedAgentScopePresets,
  getEffectiveAgentMentionSurface,
  permissionForPreset,
  resolveAgentRequest,
  resolveReplacementAgentRequest,
  type AgentMentionSurface,
  type AgentScopePreset
} from "../../lib/agent/permissions";
import {
  hydrateAgentProposals,
  hydrateAgentSession,
  hydrateAgentSessionHistory,
  deleteAgentSession,
  persistNewAgentSession,
  persistAgentBranch,
  persistAgentEvent,
  persistAgentProposal,
  persistAgentSessionTitle,
  persistWorkspace,
  setAgentSessionPinned,
  setAgentSessionRead
} from "../../lib/agent/persistence";
import { generateAgentSessionTitle, getAgentSessionTitleSource, PENDING_AGENT_SESSION_TITLE } from "../../lib/agent/sessionTitle";
import { ProposalCard } from "./ProposalCard";
import { AgentMentionMenu, AGENT_MENTION_LISTBOX_ID, getAgentMentionOptionId } from "./AgentMentionMenu";
import { findLorebookMentionRange, getAgentMentionOptions, insertAgentMention, type AgentMentionOption, type LorebookMentionRange } from "./agentMention";

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

interface MessageDetails {
  role: "user" | "assistant";
  text: string;
  turnIndex: number;
}

export function AgentStudio(): ReactNode {
  const { t } = useI18n();
  const card = useCardStore((state) => state.card);
  const cardOrigin = useCardStore((state) => state.cardOrigin);
  const report = useCardStore((state) => state.report);
  const workspaceId = useCardStore((state) => state.workspaceId);
  const cardRevision = useCardStore((state) => state.cardRevision);
  const currentPath = useCardStore((state) => state.currentPath);
  const theme = useCardStore((state) => state.theme);
  const setTheme = useCardStore((state) => state.setTheme);
  const aiSettings = useCardStore((state) => state.aiSettings);
  const setStatus = useCardStore((state) => state.setStatus);
  const applyAgentCard = useCardStore((state) => state.applyAgentCard);
  const { copyArbitraryText, openCard, saveCardSnapshot } = useProjectActions();
  const cardName = getCardDisplayName(card, t);
  const cardIdentity = getCardIdentity(cardOrigin, currentPath, t);
  const nextTheme = theme === "dark" ? "light" : "dark";
  const themeLabel = t("a11y.switchTheme", { theme: theme === "dark" ? t("theme.light") : t("theme.dark") });
  const [sessionId, setSessionId] = useState(() => readSessionId(workspaceId));
  const [input, setInput] = useState("");
  const [mentionRange, setMentionRange] = useState<LorebookMentionRange>();
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [mentionSurface, setMentionSurface] = useState<AgentMentionSurface>("card");
  const [requestScope, setRequestScope] = useState<AgentScopePreset>("card");
  const [messages, setMessages] = useState<unknown[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<unknown>();
  const [events, setEvents] = useState<AgentControllerEvent[]>([]);
  const [proposals, setProposals] = useState<CardProposal[]>([]);
  const [sessionHistory, setSessionHistory] = useState<AgentSessionHistoryRecord[]>([]);
  const [generatingTitleSessionIds, setGeneratingTitleSessionIds] = useState<Set<string>>(() => new Set());
  const [rightOpen, setRightOpen] = useState(true);
  const [inspectorWidth, setInspectorWidth] = useState(560);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(() => new Set());
  const [hiddenMessageIds, setHiddenMessageIds] = useState<Set<string>>(() => new Set());
  const [messageDetails, setMessageDetails] = useState<MessageDetails | null>(null);
  const [toolbarCompact, setToolbarCompact] = useState(false);
  const [focusedEditor, setFocusedEditor] = useState<StudioEditorTab | null>(null);
  const [pendingValidationPath, setPendingValidationPath] = useState<string>();
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
    setInput("");
    setMessages([]);
    setStreamingMessage(undefined);
    setEvents([]);
    setProposals([]);
    setConversationOperation("idle");
    setEditingLastUser(false);
    setEditedUserText("");
    setSelectedMessageIds(new Set());
    setHiddenMessageIds(new Set());
    setMessageDetails(null);
    setSessionBusy(false);
    setMentionSurface("card");
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
    void persistNewAgentSession(workspaceId, sessionId, cardName, currentPath).then((record) => {
      setSessionHistory((current) => current.some((item) => item.id === record.id) ? current : [record, ...current]);
    });
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

  const effectiveMentionSurface = getEffectiveAgentMentionSurface(mentionSurface, requestScope);
  const mentionOptions = useMemo(
    () => mentionRange ? getAgentMentionOptions(card, effectiveMentionSurface, mentionRange.query) : [],
    [card, effectiveMentionSurface, mentionRange]
  );
  const activeMentionIndex = Math.min(mentionActiveIndex, Math.max(0, mentionOptions.length - 1));
  const activeMention = mentionOptions[activeMentionIndex];
  const requestScopeOptions = getAllowedAgentScopePresets(mentionSurface);

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

  const selectMention = (option: AgentMentionOption) => {
    if (!mentionRange) return;
    const next = insertAgentMention(input, mentionRange, option);
    setInput(next.value);
    setMentionRange(undefined);
    setMentionActiveIndex(0);
    setRequestScope(option.preset);
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
      event.stopPropagation();
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
      const request = resolveAgentRequest(message, useCardStore.getState().card, requestScope, effectiveMentionSurface);
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
  }, [controller, conversationOperation, editingLastUser, effectiveMentionSurface, input, requestScope, sessionId, setStatus, workspaceId]);

  const queueFollowUp = useCallback(async () => {
    const message = input.trim();
    if (!message || editingLastUser || conversationOperation !== "idle") return;
    try {
      const request = resolveAgentRequest(message, useCardStore.getState().card, requestScope, effectiveMentionSurface);
      if (!request.instruction) throw new Error("请在目标范围后输入具体指令。");
      setInput("");
      setMentionRange(undefined);
      await controller.continueAfterRun(encodeAgentRequest(request.permission, message), request.permission);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, [controller, conversationOperation, editingLastUser, effectiveMentionSurface, input, requestScope, setStatus]);

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

  const resetConversationView = useCallback(() => {
    setInput("");
    setMessages([]);
    setStreamingMessage(undefined);
    setEvents([]);
    setProposals([]);
    setMentionRange(undefined);
    setEditingLastUser(false);
    setEditedUserText("");
    setSelectedMessageIds(new Set());
    setHiddenMessageIds(new Set());
    setMessageDetails(null);
    conversationSnapshotsRef.current = [];
  }, []);

  const selectSession = useCallback(async (record: AgentSessionHistoryRecord) => {
    if (actionLockRef.current || conversationOperation !== "idle" || controller.isStreaming || sessionBusy) return;
    const currentSession: CurrentAgentSession = { workspaceId, sessionId, cardName, currentPath };
    if (!isAgentSessionSelectable(record, currentSession)) return;
    actionLockRef.current = true;
    setSessionBusy(true);
    try {
      if (record.workspaceId === workspaceId) {
        saveSessionId(workspaceId, record.id);
        if (record.id === sessionId) {
          setSessionHistory((current) => current.map((item) => item.id === record.id ? { ...item, isRead: true } : item));
          void setAgentSessionRead(record.id, true);
          return;
        }
        controllerRef.current?.dispose();
        controllerRef.current = null;
        setSessionId(record.id);
        resetConversationView();
        setSessionHistory((current) => current.map((item) => item.id === record.id ? { ...item, isRead: true } : item));
        void setAgentSessionRead(record.id, true);
        return;
      }
      if (!record.currentPath) {
        setStatus("该角色卡没有可重新打开的文件路径，无法切换会话。");
        return;
      }
      saveSessionId(record.workspaceId, record.id);
      await openCard(record.currentPath, record.workspaceId);
    } finally {
      actionLockRef.current = false;
      setSessionBusy(false);
    }
  }, [cardName, controller, conversationOperation, currentPath, openCard, resetConversationView, sessionBusy, sessionId, setStatus, workspaceId]);

  const openEditor = (tab: StudioEditorTab) => {
    lastFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const nextSurface = mentionSurfaceForEditor(tab);
    setMentionSurface(nextSurface);
    setRequestScope(nextSurface === "none" ? "card" : nextSurface);
    setPendingValidationPath(undefined);
    setFocusedEditor(tab);
    setRightOpen(true);
    requestAnimationFrame(() => inspectorCloseRef.current?.focus());
  };

  const closeInspector = () => {
    setRightOpen(false);
    setPendingValidationPath(undefined);
    setFocusedEditor(null);
    lastFocusRef.current?.focus();
  };

  const reopenInspector = () => {
    if (mentionSurface === "none") {
      setMentionSurface("card");
      setRequestScope("card");
    }
    setRightOpen(true);
    requestAnimationFrame(() => inspectorCloseRef.current?.focus());
  };

  const returnToOverview = () => {
    setMentionSurface("card");
    setRequestScope("card");
    setPendingValidationPath(undefined);
    setFocusedEditor(null);
    requestAnimationFrame(() => inspectorCloseRef.current?.focus());
  };

  useEffect(() => listenForValidationNavigation(({ path }) => {
    setPendingValidationPath(path);
    const nextEditor = getValidationEditorTab(path);
    const nextSurface = mentionSurfaceForEditor(nextEditor);
    setMentionSurface(nextSurface);
    setRequestScope(nextSurface === "none" ? "card" : nextSurface);
    setFocusedEditor(nextEditor);
    setRightOpen(true);
  }), []);

  useEffect(() => {
    if (!pendingValidationPath || !focusedEditor) {
      return undefined;
    }

    let attempts = 0;
    let timer: number | undefined;
    let cancelled = false;
    const locate = () => {
      if (cancelled) {
        return;
      }
      const targets = getValidationTargetPaths(pendingValidationPath);
      const findTarget = (path: string) => Array.from(document.querySelectorAll<HTMLElement>("[data-validation-path]"))
        .find((element) => element.dataset.validationPath === path);
      const exactTarget = findTarget(targets[0]);
      if (!exactTarget && attempts < 8) {
        attempts += 1;
        dispatchValidationNavigation(pendingValidationPath);
        timer = window.setTimeout(locate, 80);
        return;
      }
      const target = exactTarget ?? targets.map(findTarget).find(Boolean);
      setPendingValidationPath(undefined);
      if (!target) {
        return;
      }
      const targetDetails = target.closest<HTMLDetailsElement>("details");
      if (targetDetails && !targetDetails.open) {
        targetDetails.open = true;
      }
      target.scrollIntoView({ block: "center", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      const focusTarget = target.matches("input, select, textarea, button, [contenteditable='true'], [tabindex]:not([tabindex='-1'])")
        ? target
        : target.querySelector<HTMLElement>("input, select, textarea, button, [contenteditable='true'], [tabindex]:not([tabindex='-1'])");
      focusTarget?.focus({ preventScroll: true });
      target.classList.add("validation-target-highlight");
      window.setTimeout(() => target.classList.remove("validation-target-highlight"), 1800);
    };
    const frame = requestAnimationFrame(locate);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [focusedEditor, pendingValidationPath]);

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

  const runValidationAction = useCallback(async (validationReport: ValidationReport, issue?: ValidationIssue) => {
    if (!agentReady) throw new Error("请先配置可用的 Agent 模型与系统凭据。");
    if (conversationOperation !== "idle" || controller.isStreaming) throw new Error("Agent 正在处理另一项请求，请稍后重试。");
    const currentCard = useCardStore.getState().card;
    const permission = resolveValidationIssuePermission(currentCard, issue);
    const instruction = buildValidationAgentInstruction(validationReport, issue);
    setFocusedEditor(null);
    setRightOpen(false);
    setEvents((current) => [...current, { type: "status", message: `校验诊断已发送 · ${describeAgentPermission(permission)}` }]);
    await controller.send(encodeAgentRequest(permission, instruction), permission);
    setMessages([...controller.messages]);
    setStreamingMessage(controller.streamingMessage);
    saveSessionId(workspaceId, sessionId);
    scrollTranscriptToBottom();
  }, [agentReady, controller, conversationOperation, scrollTranscriptToBottom, sessionId, workspaceId]);

  const prepareLorebookRequest = useCallback(() => {
    setMentionSurface("worldbook");
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

  const createSession = useCallback(async () => {
    if (actionLockRef.current || actionBusy || sessionBusy) return;
    actionLockRef.current = true;
    setSessionBusy(true);
    try {
      const nextSessionId = createSessionId();
      const record = await persistNewAgentSession(workspaceId, nextSessionId, cardName, currentPath);
      setSessionHistory((current) => [record, ...current.filter((item) => item.id !== record.id)]);
      saveSessionId(workspaceId, nextSessionId);
      controllerRef.current?.dispose();
      controllerRef.current = null;
      setSessionId(nextSessionId);
      resetConversationView();
    } finally {
      actionLockRef.current = false;
      setSessionBusy(false);
    }
  }, [actionBusy, cardName, currentPath, resetConversationView, sessionBusy, workspaceId]);

  const selectAdjacentSession = useCallback((direction: -1 | 1) => {
    const currentSession: CurrentAgentSession = { workspaceId, sessionId, cardName, currentPath };
    const next = getAdjacentAgentSession(sessionHistory, currentSession, direction);
    if (next && next.id !== sessionId) void selectSession(next);
  }, [cardName, currentPath, sessionHistory, selectSession, sessionId, workspaceId]);

  const renameSession = useCallback(async (record: AgentSessionHistoryRecord) => {
    const currentTitle = record.title.trim() || "新会话";
    const nextTitle = window.prompt("重命名会话", currentTitle)?.trim();
    if (!nextTitle || nextTitle === currentTitle) return;
    if ([...nextTitle].length > 24) {
      setStatus("会话名称不能超过 24 个字符。");
      return;
    }
    if (!await persistAgentSessionTitle(record.id, nextTitle)) {
      setStatus("会话重命名失败，请稍后重试。");
      return;
    }
    setSessionHistory((current) => current.map((item) => item.id === record.id ? { ...item, title: nextTitle } : item));
  }, [setStatus]);

  const deleteSession = useCallback(async (record: AgentSessionHistoryRecord) => {
    if (actionLockRef.current || actionBusy || sessionBusy) return;
    if (!window.confirm(`确定删除会话“${record.title.trim() || "新会话"}”吗？聊天记录也会被删除。`)) return;
    actionLockRef.current = true;
    setSessionBusy(true);
    try {
      if (!await deleteAgentSession(record.id)) {
        setStatus("会话删除失败，请稍后重试。");
        return;
      }
      setSessionHistory((current) => current.filter((item) => item.id !== record.id));
      if (record.id !== sessionId) return;
      const replacement = await persistNewAgentSession(workspaceId, createSessionId(), cardName, currentPath);
      saveSessionId(workspaceId, replacement.id);
      controllerRef.current?.dispose();
      controllerRef.current = null;
      setSessionId(replacement.id);
      setSessionHistory((current) => [replacement, ...current]);
      resetConversationView();
    } finally {
      actionLockRef.current = false;
      setSessionBusy(false);
    }
  }, [actionBusy, cardName, currentPath, resetConversationView, sessionBusy, sessionId, setStatus, workspaceId]);

  const toggleSessionPinned = useCallback(async (record: AgentSessionHistoryRecord) => {
    const pinned = !Boolean(record.pinned);
    if (!await setAgentSessionPinned(record.id, pinned)) {
      setStatus("会话置顶状态更新失败，请稍后重试。");
      return;
    }
    setSessionHistory((current) => current.map((item) => item.id === record.id ? { ...item, pinned } : item));
  }, [setStatus]);

  const toggleSessionRead = useCallback(async (record: AgentSessionHistoryRecord) => {
    const isRead = record.isRead === false;
    if (!await setAgentSessionRead(record.id, isRead)) {
      setStatus("会话已读状态更新失败，请稍后重试。");
      return;
    }
    setSessionHistory((current) => current.map((item) => item.id === record.id ? { ...item, isRead } : item));
  }, [setStatus]);

  const exportSession = useCallback(async (record: AgentSessionHistoryRecord) => {
    const storedMessages = await hydrateAgentSession(record.id);
    const exportPayload = {
      title: record.title.trim() || "新会话",
      sessionId: record.id,
      workspaceId: record.workspaceId,
      exportedAt: new Date().toISOString(),
      messages: storedMessages
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFileName(exportPayload.title)}-${record.id.slice(0, 8)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  const appendComposerText = useCallback((text: string) => {
    setInput((current) => current ? `${current}\n\n${text}` : text);
    requestAnimationFrame(() => composerRef.current?.focus());
  }, []);

  const messageKey = (turnIndex: number, role: "user" | "assistant") => `${turnIndex}:${role}`;
  const toggleMessageSelection = useCallback((turnIndex: number, role: "user" | "assistant") => {
    const id = messageKey(turnIndex, role);
    setSelectedMessageIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const deleteMessage = useCallback((turnIndex: number, role: "user" | "assistant") => {
    const id = messageKey(turnIndex, role);
    setHiddenMessageIds((current) => new Set(current).add(id));
    setSelectedMessageIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  const selectAllMessages = useCallback(() => {
    const next = new Set<string>();
    transcript.forEach((turn, index) => {
      if (turn.userText && !hiddenMessageIds.has(messageKey(index, "user"))) next.add(messageKey(index, "user"));
      if ((turn.assistantText || turn.assistantPresent || turn.tools.length > 0 || turn.streaming) && !hiddenMessageIds.has(messageKey(index, "assistant"))) {
        next.add(messageKey(index, "assistant"));
      }
    });
    setSelectedMessageIds(next);
  }, [hiddenMessageIds, transcript]);

  const clearMessageSelection = useCallback(() => setSelectedMessageIds(new Set()), []);

  const copyCurrentSession = useCallback(async () => {
    const text = transcript.map((turn) => [
      turn.userText ? `用户：${turn.userText}` : "",
      turn.assistantText ? `Agent：${turn.assistantText}` : "",
      ...turn.tools.map((tool) => `工具 ${tool.toolName}：${tool.content}`)
    ].filter(Boolean).join("\n")).filter(Boolean).join("\n\n");
    await copyArbitraryText(text || "当前会话暂无消息");
  }, [copyArbitraryText, transcript]);

  const showMessageDetails = useCallback((role: "user" | "assistant", text: string, turnIndex: number) => {
    setMessageDetails({ role, text, turnIndex });
  }, []);

  useEffect(() => {
    const handleSessionShortcut = (event: globalThis.KeyboardEvent) => {
      if (!event.ctrlKey || !["Tab", "PageUp", "PageDown"].includes(event.key) || event.isComposing) return;
      if (event.target instanceof Element && (event.target.matches("input, textarea, select, [contenteditable='true']") || event.target.closest("[data-context-menu-root]"))) return;
      if (actionBusy || sessionBusy) return;
      event.preventDefault();
      const direction: -1 | 1 = event.key === "PageUp" || (event.key === "Tab" && event.shiftKey) ? -1 : 1;
      selectAdjacentSession(direction);
    };
    document.addEventListener("keydown", handleSessionShortcut);
    return () => document.removeEventListener("keydown", handleSessionShortcut);
  }, [actionBusy, selectAdjacentSession, sessionBusy]);

  const toolbarContextTargetId = useContextMenuTarget(() => ({
    kind: "agent-toolbar" as const,
    createSession,
    customizeToolbar: () => {
      setToolbarCompact((current) => !current);
      setStatus("工具栏布局已切换。");
    },
    toggleInspector: () => rightOpen ? closeInspector() : reopenInspector(),
    stopGeneration: () => controller.abort(),
    openSettings: () => openEditor("settings"),
    canStop: controller.isStreaming
  }));

  const chatContextTargetId = useContextMenuTarget(() => ({
    kind: "agent-chat" as const,
    copySession: copyCurrentSession,
    selectAllMessages,
    clearMessageSelection,
    scrollToTop: () => transcriptRef.current?.scrollTo({ top: 0, behavior: "smooth" }),
    scrollToBottom: () => scrollTranscriptToBottom(),
    regenerate: () => void replaceConversation("regenerating"),
    canRegenerate: actionTarget.canRegenerate && !actionBusy
  }));

  const composerContextTargetId = useContextMenuTarget(() => ({
    kind: "agent-composer" as const,
    clearInput: () => setInput(""),
    send: () => void submit(),
    continueAfterGeneration: () => void queueFollowUp(),
    canSend: Boolean(input.trim()) && !actionBusy && !editingLastUser,
    canContinue: Boolean(input.trim()) && controller.isStreaming && conversationOperation === "idle" && !editingLastUser
  }));

  const studioActions = useMemo(() => ({
    ready: agentReady,
    busy: actionBusy,
    runFieldAction,
    runValidationAction,
    prepareLorebookRequest
  }), [actionBusy, agentReady, prepareLorebookRequest, runFieldAction, runValidationAction]);

  return (
    <AgentStudioContext.Provider value={studioActions}>
    <section
      className={rightOpen ? "agent-studio agent-studio-inspector-open" : "agent-studio"}
      style={{ "--inspector-width": rightOpen ? `${inspectorWidth}px` : "0px" } as CSSProperties}
      aria-label="Agent Studio"
    >
      <aside className="agent-studio-sidebar">
        <div className="agent-studio-brand"><div className="agent-studio-mark"><Sparkles size={18} /></div><div><strong>Card Workshop</strong><span>AGENT STUDIO</span></div></div>
        <div className="agent-studio-card-summary"><span>当前项目</span><strong>{cardName}</strong><small title={cardIdentity.detail}>{cardIdentity.label} · rev {cardRevision}</small></div>
        <AgentSessionHistory
          records={sessionHistory}
          current={{ workspaceId, sessionId, cardName, currentPath }}
          generatingTitleSessionIds={generatingTitleSessionIds}
          busy={actionBusy || sessionBusy}
          onSelectSession={selectSession}
          onSelectPrevious={() => selectAdjacentSession(-1)}
          onSelectNext={() => selectAdjacentSession(1)}
          onCreateSession={createSession}
          onRenameSession={renameSession}
          onDeleteSession={deleteSession}
          onTogglePinned={toggleSessionPinned}
          onToggleRead={toggleSessionRead}
          onExportSession={exportSession}
        />
        <Button className="agent-studio-new-session" variant="ghost" icon={<Plus size={15} />} disabled={actionBusy || sessionBusy} onClick={() => void createSession()}>新建会话</Button>
        <div className="agent-studio-sidebar-footer">
          <nav className="agent-studio-nav" aria-label="卡片编辑入口">
            <button type="button" aria-label="项目文件" title="项目文件" onClick={() => openEditor("home")}><FolderOpen size={15} /><span className="agent-nav-copy"><strong>项目文件</strong><small>打开、保存与导出</small></span></button>
            <button type="button" aria-label="预览" title="预览" onClick={() => openEditor("preview")}><PanelRight size={15} /><span className="agent-nav-copy"><strong>预览</strong><small>查看当前卡片</small></span></button>
            <button type="button" aria-label="设置" title="设置" onClick={() => openEditor("settings")}><Settings2 size={15} /><span className="agent-nav-copy"><strong>设置</strong><small>配置应用与 Agent</small></span></button>
          </nav>
          <Button className="agent-studio-theme-button" variant="ghost" aria-label={themeLabel} title={themeLabel} icon={theme === "dark" ? <Sun size={15} /> : <Moon size={15} />} onClick={() => setTheme(nextTheme)}>
            {theme === "dark" ? t("theme.lightAction") : t("theme.darkAction")}
          </Button>
        </div>
      </aside>

      <section className="agent-studio-main">
        <header className={toolbarCompact ? "agent-studio-header agent-toolbar-compact" : "agent-studio-header"} data-context-menu="agent-toolbar" data-context-target-id={toolbarContextTargetId}><div><span className="agent-studio-eyebrow">当前工作区</span><h2>{getCardDisplayName(card, t)}</h2></div><div className="agent-studio-header-status"><span className={report.valid ? "agent-status-chip" : "agent-status-chip danger"}><ShieldCheck size={14} /><span className="agent-toolbar-label">{report.valid ? "校验通过" : report.errors.length + " 个阻塞错误"}</span></span><span className="agent-status-chip"><span className="agent-toolbar-label">rev {cardRevision}</span></span><button type="button" className="agent-stop-button" onClick={() => controller.abort()} disabled={!controller.isStreaming}><CircleStop size={15} /><span className="agent-toolbar-label">停止</span></button>{!rightOpen ? <Button className="agent-inspector-toggle" variant="ghost" icon={<PanelRight size={15} />} onClick={reopenInspector}>打开纲要</Button> : null}</div></header>
        <div ref={transcriptRef} className="agent-studio-transcript" aria-live="polite" data-context-menu="agent-chat" data-context-target-id={chatContextTargetId}>
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
            turnIndex={index}
            userSelected={selectedMessageIds.has(messageKey(index, "user"))}
            assistantSelected={selectedMessageIds.has(messageKey(index, "assistant"))}
            hideUser={hiddenMessageIds.has(messageKey(index, "user"))}
            hideAssistant={hiddenMessageIds.has(messageKey(index, "assistant"))}
            onCopyMessage={(text) => void copyArbitraryText(text)}
            onQuoteMessage={(text) => appendComposerText(`> ${text.split("\n").join("\n> ")}`)}
            onForwardMessage={(text) => appendComposerText(`转发：\n${text}`)}
            onDeleteMessage={deleteMessage}
            onToggleMessageSelection={toggleMessageSelection}
            onShowMessageDetails={showMessageDetails}
          />)}
          {events.filter((event) => event.type === "status").slice(-3).map((event, index) => <div className={`agent-runtime-status${event.statusTone ? ` is-${event.statusTone}` : ""}`} role={event.statusTone === "error" ? "alert" : "status"} key={(event.message ?? "status") + "-" + index}>{event.message}</div>)}
          {proposals.filter((proposal) => proposal.state === "pending" || proposal.state === "conflicted").map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} disabled={actionBusy} onApply={() => void applyProposal(proposal)} onDiscard={() => discardProposal(proposal)} onToggleCandidate={(candidateId, selected) => toggleCandidate(proposal, candidateId, selected)} />)}
        </div>
        <form className="agent-composer" data-context-menu="agent-composer" data-context-target-id={composerContextTargetId} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <div className="agent-composer-scope-row">
            <label htmlFor="agent-request-scope">权限范围</label>
            <select id="agent-request-scope" value={requestScope} onChange={(event) => setRequestScope(event.currentTarget.value as AgentScopePreset)} disabled={controller.isStreaming}>
              {requestScopeOptions.map((scope) => <option value={scope} key={scope}>{describeAgentPermission(permissionForPreset(scope))}</option>)}
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
            aria-activedescendant={mentionRange && activeMention ? getAgentMentionOptionId(activeMention.optionId) : undefined}
            aria-haspopup="listbox"
            aria-label="Agent 请求"
            aria-multiline="true"
            value={input}
            placeholder="描述你想检查、整理或提出的修改… 输入 @ 后选择当前页面目标"
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
        {focusedEditor ? <Suspense fallback={<div className="agent-inspector-loading">正在加载编辑台…</div>}><EditorPanel tab={focusedEditor} /></Suspense> : <InspectorOverview card={card} report={report} onOpenEditor={openEditor} />}
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
      {messageDetails ? <div className="agent-message-details-backdrop" data-context-menu-root onMouseDown={() => setMessageDetails(null)}>
        <section className="agent-message-details" role="dialog" aria-modal="true" aria-labelledby="agent-message-details-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="agent-message-details-heading"><div><span className="agent-studio-eyebrow">消息详情</span><h3 id="agent-message-details-title">{messageDetails.role === "user" ? "用户消息" : "Agent 消息"}</h3></div><button type="button" aria-label="关闭消息详情" onClick={() => setMessageDetails(null)}>×</button></div>
          <dl><div><dt>轮次</dt><dd>{messageDetails.turnIndex + 1}</dd></div><div><dt>字符数</dt><dd>{messageDetails.text.length}</dd></div></dl>
          <pre>{messageDetails.text || "（无文本内容）"}</pre>
        </section>
      </div> : null}
    </section>
    </AgentStudioContext.Provider>
  );
}

function mentionSurfaceForEditor(tab: StudioEditorTab): AgentMentionSurface {
  if (tab === "basic" || tab === "prompts" || tab === "greetings" || tab === "lorebook") return tab === "lorebook" ? "worldbook" : tab;
  return "none";
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
    case "home": return "项目文件";
    case "basic": return "基础信息";
    case "prompts": return "提示词";
    case "greetings": return "开场白";
    case "lorebook": return "世界书";
    case "assets": return "卡片资源";
    case "preview": return "预览";
    case "tokenStats": return "Token 统计";
    case "validation": return "校验";
    case "settings": return "设置";
  }
}

function InspectorOverview({ card, report, onOpenEditor }: { card: ReturnType<typeof useCardStore.getState>["card"]; report: ReturnType<typeof useCardStore.getState>["report"]; onOpenEditor: (tab: StudioEditorTab) => void }) {
  const stats = buildCardTokenStats(card);
  const fieldEditors: Array<[string, StudioEditorTab]> = [
    ["基础", "basic"],
    ["提示词", "prompts"],
    ["开场白", "greetings"],
    ["世界书", "lorebook"],
    ["卡片资源", "assets"]
  ];
  return (
    <div className="agent-inspector-overview">
      <section className="agent-inspector-block">
        <div className="agent-inspector-section-heading">
          <div className="agent-inspector-section-title">
            <span className="agent-inspector-section-icon" aria-hidden="true"><Pencil size={14} /></span>
            <div>
              <strong>编辑卡片</strong>
              <span>CCv3 字段</span>
            </div>
          </div>
          <span className="agent-inspector-section-index">01</span>
        </div>
        <p className="agent-inspector-hint">这里编辑当前卡片的数据字段；项目文件用于打开、保存和导出卡片。</p>
        <div className="agent-index-grid">
          {fieldEditors.map(([label, tab]) => (
            <button className={tab === "assets" ? "agent-index-entry agent-index-entry-wide" : "agent-index-entry"} type="button" key={tab} onClick={() => onOpenEditor(tab)}>
              <span className="agent-index-entry-copy"><strong>{label}</strong></span>
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
      <section className="agent-inspector-block">
        <div className="agent-inspector-section-heading">
          <div className="agent-inspector-section-title">
            <span className="agent-inspector-section-icon" aria-hidden="true"><PanelRight size={14} /></span>
            <div>
              <strong>预览效果</strong>
              <span>只读查看</span>
            </div>
          </div>
          <span className="agent-inspector-section-index">02</span>
        </div>
        <p className="agent-inspector-hint">查看当前卡片的头像、开场白和实际 Prompt 效果。</p>
        <div className="agent-index-grid agent-index-grid-single">
          <button className="agent-index-entry" type="button" onClick={() => onOpenEditor("preview")}>
            <span className="agent-index-entry-copy"><strong>预览</strong><small>头像、开场白与实际 Prompt</small></span>
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
      </section>
      <section className="agent-inspector-block">
        <div className="agent-inspector-section-heading">
          <div className="agent-inspector-section-title">
            <span className="agent-inspector-section-icon" aria-hidden="true"><ShieldCheck size={14} /></span>
            <div>
              <strong>卡片状态</strong>
              <span>校验与用量</span>
            </div>
          </div>
          <span className="agent-inspector-section-index">03</span>
        </div>
        <div className="agent-status-grid">
          <button className={report.valid ? "agent-status-card is-success" : "agent-status-card is-danger"} type="button" onClick={() => onOpenEditor("validation")}>
            <span className="agent-status-card-heading"><span>校验</span><ChevronRight size={14} aria-hidden="true" /></span>
            <strong className={report.valid ? "agent-good" : "agent-danger"}>{report.valid ? "校验通过" : report.errors.length + " 个阻塞错误"}</strong>
            <small>{report.warnings.length ? report.warnings.length + " 个警告" : "没有待处理警告"}</small>
          </button>
          <button className="agent-status-card" type="button" onClick={() => onOpenEditor("tokenStats")}>
            <span className="agent-status-card-heading"><span>Token 统计</span><ChevronRight size={14} aria-hidden="true" /></span>
            <strong>{stats.totalTokens.toLocaleString()}</strong>
            <small>estimated tokens</small>
          </button>
        </div>
      </section>
    </div>
  );
}

interface AgentTranscriptTurnViewProps {
  turn: AgentTranscriptTurn;
  turnIndex: number;
  isLatestUser: boolean;
  isLatestAssistant: boolean;
  userSelected: boolean;
  assistantSelected: boolean;
  hideUser: boolean;
  hideAssistant: boolean;
  editingUser: boolean;
  editedUserText: string;
  actionBusy: boolean;
  operation: ConversationOperation;
  onStartEdit: () => void;
  onEditedUserTextChange: (value: string) => void;
  onCancelEdit: () => void;
  onResend: () => void;
  onRegenerate: () => void;
  onCopyMessage: (text: string) => void;
  onQuoteMessage: (text: string) => void;
  onForwardMessage: (text: string) => void;
  onDeleteMessage: (turnIndex: number, role: "user" | "assistant") => void;
  onToggleMessageSelection: (turnIndex: number, role: "user" | "assistant") => void;
  onShowMessageDetails: (role: "user" | "assistant", text: string, turnIndex: number) => void;
}

function AgentTranscriptTurnView({
  turn,
  turnIndex,
  isLatestUser,
  isLatestAssistant,
  userSelected,
  assistantSelected,
  hideUser,
  hideAssistant,
  editingUser,
  editedUserText,
  actionBusy,
  operation,
  onStartEdit,
  onEditedUserTextChange,
  onCancelEdit,
  onResend,
  onRegenerate,
  onCopyMessage,
  onQuoteMessage,
  onForwardMessage,
  onDeleteMessage,
  onToggleMessageSelection,
  onShowMessageDetails
}: AgentTranscriptTurnViewProps) {
  const hasUserContent = Boolean(turn.userText) && !hideUser;
  const hasAssistantContent = !hideAssistant && (turn.assistantPresent || Boolean(turn.assistantText || turn.tools.length > 0 || turn.streaming));
  const assistantMessageText = turn.assistantText || turn.tools.map((tool) => tool.content).filter(Boolean).join("\n\n");
  const userContextTargetId = useContextMenuTarget(() => ({
    kind: "agent-message" as const,
    role: "user" as const,
    text: turn.userText,
    selected: userSelected,
    canDelete: hasUserContent,
    copyMessage: onCopyMessage,
    quoteMessage: () => onQuoteMessage(turn.userText),
    forwardMessage: () => onForwardMessage(turn.userText),
    deleteMessage: () => onDeleteMessage(turnIndex, "user"),
    toggleSelection: () => onToggleMessageSelection(turnIndex, "user"),
    showDetails: () => onShowMessageDetails("user", turn.userText, turnIndex)
  }));
  const assistantContextTargetId = useContextMenuTarget(() => ({
    kind: "agent-message" as const,
    role: "assistant" as const,
    text: assistantMessageText,
    selected: assistantSelected,
    canDelete: hasAssistantContent,
    copyMessage: onCopyMessage,
    quoteMessage: () => onQuoteMessage(assistantMessageText),
    forwardMessage: () => onForwardMessage(assistantMessageText),
    deleteMessage: () => onDeleteMessage(turnIndex, "assistant"),
    toggleSelection: () => onToggleMessageSelection(turnIndex, "assistant"),
    showDetails: () => onShowMessageDetails("assistant", assistantMessageText, turnIndex)
  }));
  const resendDisabled = actionBusy || !editedUserText.trim();
  return <div className="agent-transcript-turn">
    {hasUserContent ? <div className={userSelected ? "agent-message agent-message-user is-selected" : "agent-message agent-message-user"} data-context-menu="agent-message" data-context-target-id={userContextTargetId}>
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
    {hasAssistantContent ? <article className={assistantSelected ? "agent-message agent-message-assistant is-selected" : "agent-message agent-message-assistant"} aria-busy={turn.streaming} data-context-menu="agent-message" data-context-target-id={assistantContextTargetId}>
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

function safeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim() || "agent-session";
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
