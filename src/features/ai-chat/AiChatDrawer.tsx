import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Bot, BrainCircuit, Check, ChevronDown, History, PanelRightClose, PenLine, Plus, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "../../components/Button";
import { AutoResizeTextarea } from "../../components/Field";
import { useCardStore } from "../../app/store";
import { useI18n } from "../../lib/i18n";
import { sendAiChat, type AiModel, type AiThinkingEffort, type AiThinkingMode } from "../../lib/ai";
import { buildAiAgentMessages, buildAiGuideMessages } from "../../lib/aiAgentPrompts";
import {
  createAiAgentPreviewForTarget,
  createEditTargetFromFieldTarget,
  emptyFieldPaths,
  filterAiPatchesByDeniedPaths,
  parseAiAgentResponse,
  parseAiAgentEditTarget,
  toNormalizedAiCard,
  weakFieldPaths,
  type AiAgentDiff,
  type AiAgentEditTarget,
  type AiAgentPreview,
  type AiAgentResponse,
  type AiWorkflowAction
} from "../../lib/aiAgent";
import { createBlankCard, type CharacterCardV3 } from "../../lib/schema";
import { deriveLorebookEntryComment } from "../../lib/lorebookCompat";
import { validateCard } from "../../lib/validation";
import { useAiFieldContext } from "../../lib/aiFieldContext";
import {
  deleteAiChatSession,
  listAiChatSessions,
  loadAiChatSession,
  saveAiChatSession,
  type AiChatHistoryMessage,
  type AiChatSessionSummary
} from "../../lib/aiChatHistory";

interface AiChatDrawerProps {
  open: boolean;
  onClose: () => void;
}

type ChatMessage = AiChatHistoryMessage;

type Translator = ReturnType<typeof useI18n>["t"];
type AiChatMode = "guide" | "edit";

interface MentionTarget {
  label: string;
  value: string;
  description: string;
  aliases: string[];
}

interface MentionQuery {
  start: number;
  end: number;
  query: string;
}

export interface WorkflowCommandQuery {
  start: number;
  end: number;
  query: string;
}

const AGENT_MIN_OUTPUT_TOKENS = 8192;
const AGENT_MIN_TIMEOUT_MS = 120_000;
const GUIDE_MIN_TIMEOUT_MS = 90_000;
const workflowActions: AiWorkflowAction[] = [
  "diagnose",
  "complete_draft",
  "extract_source",
  "consistency_repair",
  "token_optimize",
  "worldbook_build",
  "import_cleanup"
];

export function AiChatDrawer({ open, onClose }: AiChatDrawerProps) {
  const { locale, t } = useI18n();
  const card = useCardStore((state) => state.card);
  const report = useCardStore((state) => state.report);
  const aiSettings = useCardStore((state) => state.aiSettings);
  const currentFieldTarget = useAiFieldContext((state) => state.currentTarget);
  const applyAgentCard = useCardStore((state) => state.applyAgentCard);
  const setActiveTab = useCardStore((state) => state.setActiveTab);
  const updateAiSettings = useCardStore((state) => state.updateAiSettings);
  const [sessionId, setSessionId] = useState(() => createSessionId());
  const [sessionCreatedAt, setSessionCreatedAt] = useState(() => Date.now());
  const [history, setHistory] = useState<AiChatSessionSummary[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historySaving, setHistorySaving] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<AiChatMode>("guide");
  const [includeCard, setIncludeCard] = useState(true);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [mentionMenuSuppressed, setMentionMenuSuppressed] = useState(false);
  const [workflowMenuOpen, setWorkflowMenuOpen] = useState(false);
  const [workflowMenuSuppressed, setWorkflowMenuSuppressed] = useState(false);
  const [workflowActiveIndex, setWorkflowActiveIndex] = useState(0);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const skipNextHistorySaveRef = useRef(false);
  const ready = aiSettings.enabled && aiSettings.apiKey.trim() && aiSettings.baseUrl.trim() && aiSettings.model.trim();
  const mentionTargets = useMemo(() => buildMentionTargets(card), [card]);
  const mentionQuery = mode === "edit" ? findActiveMentionQuery(draft, composerRef.current?.selectionStart ?? draft.length) : undefined;
  const mentionSuggestions = useMemo(
    () => filterMentionTargets(mentionTargets, mentionQuery?.query ?? "").slice(0, 8),
    [mentionQuery?.query, mentionTargets]
  );
  const workflowQuery = mode === "edit" ? findActiveWorkflowQuery(draft, composerRef.current?.selectionStart ?? draft.length) : undefined;
  const workflowSuggestions = useMemo(
    () => filterWorkflowActions(workflowActions, workflowQuery?.query ?? "", (action) => t(`aiWorkflow.${action}` as never)),
    [t, workflowQuery?.query]
  );
  const showWorkflowMenu =
    mode === "edit" && !workflowMenuSuppressed && (workflowMenuOpen || Boolean(workflowQuery)) && workflowSuggestions.length > 0;
  const showMentionSuggestions = !showWorkflowMenu && !mentionMenuSuppressed && Boolean(mentionQuery && mentionSuggestions.length > 0);
  const modelOptions = useMemo(() => buildModelOptions(aiSettings.model, aiSettings.availableModels), [aiSettings.availableModels, aiSettings.model]);
  const thinkingLabel = formatThinkingLabel(aiSettings.thinkingMode, aiSettings.thinkingEffort, t);

  useEffect(() => {
    setMentionActiveIndex(0);
  }, [mentionQuery?.query, mentionTargets]);

  useEffect(() => {
    setWorkflowActiveIndex(0);
  }, [workflowMenuOpen, workflowQuery?.query]);

  useEffect(() => {
    if (mode !== "edit") {
      setWorkflowMenuOpen(false);
      setWorkflowMenuSuppressed(false);
      setWorkflowActiveIndex(0);
    }
  }, [mode]);

  useEffect(() => {
    if (!open) {
      return;
    }
    void refreshHistory();
  }, [open]);

  useEffect(() => {
    if (!open || messages.length === 0) {
      return;
    }
    if (skipNextHistorySaveRef.current) {
      skipNextHistorySaveRef.current = false;
      return;
    }

    const saveTimer = window.setTimeout(() => {
      setHistorySaving(true);
      void saveAiChatSession({
        id: sessionId,
        title: buildSessionTitle(messages),
        createdAt: sessionCreatedAt,
        updatedAt: Date.now(),
        messages
      })
        .then((saved) => {
          setSessionCreatedAt(saved.createdAt);
          return listAiChatSessions();
        })
        .then(setHistory)
        .catch((saveError) => {
          setError(saveError instanceof Error ? saveError.message : String(saveError));
        })
        .finally(() => setHistorySaving(false));
    }, busy ? 1000 : 350);

    return () => window.clearTimeout(saveTimer);
  }, [busy, messages, open, sessionCreatedAt, sessionId]);

  const refreshHistory = async () => {
    try {
      setHistory(await listAiChatSessions());
    } catch (historyError) {
      setHistory([]);
      setError(historyError instanceof Error ? historyError.message : String(historyError));
    }
  };

  const runGuideRequest = async (prompt: string, assistantId: string, conversationMessages: ChatMessage[]) => {
    const sourceCard = includeCard ? card : createBlankCard();
    const sourceReport = includeCard ? report : validateCard(sourceCard);
    const guideSettings = {
      ...aiSettings,
      timeoutMs: Math.max(aiSettings.timeoutMs, GUIDE_MIN_TIMEOUT_MS)
    };
    const requestMessages = buildAiGuideMessages({
      userInstruction: prompt,
      currentCard: toNormalizedAiCard(sourceCard),
      validationReport: sourceReport,
      locale,
      conversation: buildConversation(conversationMessages)
    });

    const result = await sendAiChat(guideSettings, requestMessages, (event) => {
      if (event.event !== "delta") {
        return;
      }
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: message.content + event.contentDelta,
                reasoning: (message.reasoning ?? "") + event.reasoningDelta
              }
            : message
        )
      );
      queueMicrotask(scrollToBottom);
    });

    setMessages((current) =>
      current.map((message) =>
        message.id === assistantId
          ? {
              ...message,
              content: result.content.trim(),
              reasoning: result.reasoning
            }
          : message
      )
    );
  };

  const runAgentRequest = async (prompt: string, assistantId: string, conversationMessages: ChatMessage[]) => {
    const sourceCard = includeCard ? card : createBlankCard();
    const sourceReport = includeCard ? report : validateCard(sourceCard);
    const normalizedCard = toNormalizedAiCard(sourceCard);
    const specialTarget = resolveSpecialEditTarget(prompt, normalizedCard, currentFieldTarget, sourceReport);
    const deniedPaths = parseDeniedMentionPaths(prompt);
    const editTarget = specialTarget.target ?? parseAiAgentEditTarget(prompt, normalizedCard);
    const userInstruction = editTarget?.instruction ?? prompt;
    const allowedPaths = specialTarget.allowedPaths;
    const requestMessages = buildAiAgentMessages({
      userInstruction,
      currentCard: normalizedCard,
      validationReport: sourceReport,
      locale,
      isBlankCard: isBlankCard(sourceCard),
      editTarget,
      deniedPaths,
      allowedPaths,
      conversation: buildConversation(conversationMessages)
    });
    const agentSettings = {
      ...aiSettings,
      maxOutputTokens: Math.max(aiSettings.maxOutputTokens, AGENT_MIN_OUTPUT_TOKENS),
      timeoutMs: Math.max(aiSettings.timeoutMs, AGENT_MIN_TIMEOUT_MS)
    };
    const result = await sendAiChat(agentSettings, requestMessages, (event) => {
      if (event.event !== "delta") {
        return;
      }
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: message.content + event.contentDelta,
                reasoning: (message.reasoning ?? "") + event.reasoningDelta
              }
            : message
        )
      );
      queueMicrotask(scrollToBottom);
    });
    const response = parseAiAgentResponse(result.content);
    const deniedFiltered = filterAiPatchesByDeniedPaths(response.patches, deniedPaths);
    const scopedResponse = deniedFiltered.rejected.length
      ? {
          ...response,
          summary: [...response.summary, `Ignored denied patches: ${deniedFiltered.rejected.join(", ")}`],
          patches: deniedFiltered.accepted
        }
      : response;
    const preview = scopedResponse.patches.length > 0 ? createAiAgentPreviewForTarget(sourceCard, scopedResponse, editTarget) : undefined;

    setMessages((current) =>
      current.map((message) =>
        message.id === assistantId
          ? {
              ...message,
              content: renderAgentMessage(scopedResponse, editTarget),
              reasoning: result.reasoning,
              preview,
              previewState: preview ? "pending" : undefined
            }
          : message
      )
    );
  };

  const send = async () => {
    const prompt = draft.trim();
    if (!prompt || busy) {
      return;
    }
    if (!ready) {
      setError(t("aiChat.openSettingsFirst"));
      return;
    }

    const now = Date.now();
    const userMessage: ChatMessage = { id: createMessageId(), role: "user", content: prompt, createdAt: now };
    const assistantId = createMessageId();
    const assistantMessage: ChatMessage = { id: assistantId, role: "assistant", content: "", reasoning: "", createdAt: now + 1 };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setDraft("");
    setSettingsMenuOpen(false);
    setBusy(true);
    setActiveAssistantId(assistantId);
    setError("");
    queueMicrotask(scrollToBottom);

    try {
      if (mode === "edit") {
        await runAgentRequest(prompt, assistantId, [...messages, userMessage]);
      } else {
        await runGuideRequest(prompt, assistantId, [...messages, userMessage]);
      }
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : String(requestError);
      setError(message);
      setMessages((current) => current.filter((item) => item.id !== assistantId));
    } finally {
      setBusy(false);
      setActiveAssistantId(null);
      queueMicrotask(scrollToBottom);
    }
  };

  const regenerateAssistant = async (assistantId: string) => {
    if (busy) {
      return;
    }
    if (!ready) {
      setError(t("aiChat.openSettingsFirst"));
      return;
    }

    const assistantIndex = messages.findIndex((message) => message.id === assistantId);
    const previousAssistant = messages[assistantIndex];
    const userMessage = messages
      .slice(0, assistantIndex)
      .reverse()
      .find((message) => message.role === "user");
    if (assistantIndex < 0 || !previousAssistant || !userMessage) {
      return;
    }

    setMessages((current) =>
      current.map((message) =>
        message.id === assistantId
          ? {
              ...message,
              content: "",
              reasoning: "",
              preview: undefined,
              previewState: undefined
            }
          : message
      )
    );
    setBusy(true);
    setActiveAssistantId(assistantId);
    setError("");
    queueMicrotask(scrollToBottom);

    try {
      if (mode === "edit") {
        await runAgentRequest(userMessage.content, assistantId, messages.slice(0, assistantIndex));
      } else {
        await runGuideRequest(userMessage.content, assistantId, messages.slice(0, assistantIndex));
      }
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : String(requestError);
      setError(message);
      setMessages((current) => current.map((item) => (item.id === assistantId ? previousAssistant : item)));
    } finally {
      setBusy(false);
      setActiveAssistantId(null);
      queueMicrotask(scrollToBottom);
    }
  };

  const startNewSession = () => {
    if (busy || historyBusy) {
      return;
    }
    setSessionId(createSessionId());
    setSessionCreatedAt(Date.now());
    setMessages([]);
    setDraft("");
    setWorkflowMenuOpen(false);
    setWorkflowMenuSuppressed(false);
    setWorkflowActiveIndex(0);
    setSettingsMenuOpen(false);
    setError("");
  };

  const runWorkflow = async (workflowAction: AiWorkflowAction) => {
    if (busy) {
      return;
    }
    if (!ready) {
      setError(t("aiChat.openSettingsFirst"));
      return;
    }
    const prompt = t(`aiWorkflow.prompt.${workflowAction}` as never);
    const now = Date.now();
    const userMessage: ChatMessage = { id: createMessageId(), role: "user", content: t(`aiWorkflow.${workflowAction}` as never), createdAt: now };
    const assistantId = createMessageId();
    const assistantMessage: ChatMessage = { id: assistantId, role: "assistant", content: "", reasoning: "", createdAt: now + 1 };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setBusy(true);
    setActiveAssistantId(assistantId);
    setError("");
    try {
      const sourceCard = includeCard ? card : createBlankCard();
      const sourceReport = includeCard ? report : validateCard(sourceCard);
      const result = await sendAiChat(
        {
          ...aiSettings,
          maxOutputTokens: Math.max(aiSettings.maxOutputTokens, AGENT_MIN_OUTPUT_TOKENS),
          timeoutMs: Math.max(aiSettings.timeoutMs, AGENT_MIN_TIMEOUT_MS)
        },
        buildAiAgentMessages({
          userInstruction: prompt,
          currentCard: toNormalizedAiCard(sourceCard),
          validationReport: sourceReport,
          locale,
          isBlankCard: isBlankCard(sourceCard),
          workflowAction,
          conversation: buildConversation(messages)
        })
      );
      const response = parseAiAgentResponse(result.content);
      const preview = response.patches.length > 0 ? createAiAgentPreviewForTarget(sourceCard, response, undefined) : undefined;
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: renderAgentMessage(response, undefined),
                reasoning: result.reasoning,
                preview,
                previewState: preview ? "pending" : undefined
              }
            : message
        )
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
      setMessages((current) => current.filter((item) => item.id !== assistantId));
    } finally {
      setBusy(false);
      setActiveAssistantId(null);
      queueMicrotask(scrollToBottom);
    }
  };

  const appendMention = (mention: string) => {
    setMode("edit");
    setWorkflowMenuOpen(false);
    setWorkflowMenuSuppressed(false);
    setDraft((current) => {
      const trimmed = current.trimStart();
      if (trimmed.startsWith(mention)) {
        return current;
      }
      return current.trim() ? `${mention} ${current}` : `${mention} `;
    });
  };

  const runWorkflowFromMenu = (workflowAction: AiWorkflowAction) => {
    setWorkflowMenuOpen(false);
    setWorkflowMenuSuppressed(false);
    setWorkflowActiveIndex(0);
    setSettingsMenuOpen(false);
    setDraft("");
    void runWorkflow(workflowAction);
  };

  const applyMentionSuggestion = (target: MentionTarget) => {
    if (!mentionQuery) {
      appendMention(target.value);
      return;
    }
    const nextDraft = `${draft.slice(0, mentionQuery.start)}${target.value} ${draft.slice(mentionQuery.end)}`;
    const nextCursor = mentionQuery.start + target.value.length + 1;
    setMentionMenuSuppressed(true);
    setDraft(nextDraft);
    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const loadHistorySession = async (nextSessionId: string) => {
    if (!nextSessionId || nextSessionId === sessionId || busy || historyBusy) {
      return;
    }
    setHistoryBusy(true);
    setError("");
    try {
      const session = await loadAiChatSession(nextSessionId);
      setSessionId(session.id);
      setSessionCreatedAt(session.createdAt);
      skipNextHistorySaveRef.current = true;
      setMessages(session.messages);
      setDraft("");
      queueMicrotask(scrollToBottom);
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : String(historyError));
    } finally {
      setHistoryBusy(false);
    }
  };

  const deleteCurrentSession = async () => {
    if (busy || historyBusy || messages.length === 0) {
      return;
    }
    setHistoryBusy(true);
    setError("");
    try {
      await deleteAiChatSession(sessionId);
      setHistory(await listAiChatSessions());
      setSessionId(createSessionId());
      setSessionCreatedAt(Date.now());
      setMessages([]);
      setDraft("");
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : String(historyError));
    } finally {
      setHistoryBusy(false);
    }
  };

  const applyPreview = (messageId: string, preview: AiAgentPreview) => {
    applyAgentCard(preview.after, t("status.aiAgentApplied"));
    setMessages((current) =>
      current.map((message) => (message.id === messageId ? { ...message, previewState: "applied" } : message))
    );
    const nextTab = tabForDiff(preview.diffs[0]);
    if (nextTab) {
      setActiveTab(nextTab);
    }
  };

  const discardPreview = (messageId: string) => {
    setMessages((current) =>
      current.map((message) => (message.id === messageId ? { ...message, previewState: "discarded" } : message))
    );
  };

  if (!open) {
    return null;
  }

  return (
    <div className="ai-chat-layer" role="dialog" aria-modal="true" aria-label={t("a11y.aiChat")}>
      <button className="ai-chat-scrim" type="button" aria-label={t("a11y.closeAiChat")} onClick={onClose} />
      <aside className="ai-chat-drawer">
        <header className="ai-chat-header">
          <div>
            <span className="ai-chat-kicker">
              <Sparkles size={14} aria-hidden="true" /> {t("aiChat.globalAssistant")}
            </span>
            <h2>{t("aiChat.title")}</h2>
          </div>
          <Button icon={<PanelRightClose size={18} />} variant="ghost" onClick={onClose}>
            {t("common.close")}
          </Button>
        </header>

        <div className="ai-chat-options">
          <div className="ai-chat-mode-switch" role="group" aria-label={t("aiChat.mode")}>
            <button
              className={mode === "guide" ? "active" : ""}
              type="button"
              onClick={() => setMode("guide")}
            >
              <BrainCircuit size={16} aria-hidden="true" />
              <span>{t("aiChat.guideMode")}</span>
            </button>
            <button
              className={mode === "edit" ? "active" : ""}
              type="button"
              onClick={() => setMode("edit")}
            >
              <PenLine size={16} aria-hidden="true" />
              <span>{t("aiChat.editMode")}</span>
            </button>
          </div>
          <label className="toggle-row">
            <input checked={includeCard} type="checkbox" onChange={(event) => setIncludeCard(event.currentTarget.checked)} />
            <span>{t("aiChat.useCurrentCard")}</span>
          </label>
          <Button
            icon={<Bot size={18} />}
            variant="ghost"
            onClick={() => {
              setActiveTab("settings");
              onClose();
            }}
          >
            {t("common.settings")}
          </Button>
          <Button disabled={busy || historyBusy} icon={<Plus size={18} />} variant="ghost" onClick={startNewSession}>
            {t("aiChat.newConversation")}
          </Button>
        </div>

        <div className="ai-chat-status">
          <span className={ready ? "state-pill" : "state-pill state-pill-hot"}>
            {ready ? t("aiChat.modelReady", { model: aiSettings.model }) : t("aiChat.configureFirst")}
          </span>
          <span className="state-pill">{mode === "edit" ? t("aiAgent.structuredMode") : t("aiChat.guideModeStatus")}</span>
          {aiSettings.providerProfile === "deepseek" ? (
            <span className="state-pill">
              {t("aiChat.thinking", {
                value:
                  aiSettings.thinkingMode === "enabled"
                    ? aiSettings.thinkingEffort === "max"
                      ? t("common.max")
                      : t("common.high")
                    : t("common.disabled")
              })}
            </span>
          ) : null}
        </div>

        <div className="ai-chat-historybar">
          <label className="ai-chat-history-select">
            <History size={16} aria-hidden="true" />
            <select
              className="input"
              disabled={busy || historyBusy || history.length === 0}
              value={history.some((session) => session.id === sessionId) ? sessionId : ""}
              onChange={(event) => void loadHistorySession(event.currentTarget.value)}
            >
              <option value="">{history.length === 0 ? t("aiChat.noHistory") : t("aiChat.currentConversation")}</option>
              {history.map((session) => (
                <option key={session.id} title={session.lastMessagePreview} value={session.id}>
                  {session.title} - {formatHistoryTime(session.updatedAt, locale)}
                </option>
              ))}
            </select>
          </label>
          <span className="state-pill">
            {historySaving ? t("aiChat.historySaving") : t("aiChat.historySaved")}
          </span>
          <Button disabled={busy || historyBusy || messages.length === 0} icon={<Trash2 size={16} />} variant="ghost" onClick={() => void deleteCurrentSession()}>
            {t("aiChat.deleteConversation")}
          </Button>
        </div>

        <div className="ai-chat-messages" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="ai-chat-empty">
              <BrainCircuit size={28} aria-hidden="true" />
              <p>{t("aiChat.emptyHelp")}</p>
            </div>
          ) : null}
          {messages.map((message) => {
            const isActiveAssistant = busy && activeAssistantId === message.id;
            const showReasoningPanel =
              message.role === "assistant" &&
              aiSettings.showReasoning &&
              (Boolean(message.reasoning?.trim()) || isActiveAssistant);
            return (
              <article className={`ai-message ai-message-${message.role}`} key={message.id}>
                <div className="ai-message-heading">
                  <strong>{message.role === "user" ? t("aiChat.you") : t("aiChat.ai")}</strong>
                  {message.role === "assistant" ? (
                    <Button
                      className="ai-message-regenerate"
                      disabled={busy || !ready}
                      icon={<RotateCcw size={14} />}
                      variant="ghost"
                      onClick={() => void regenerateAssistant(message.id)}
                    >
                      {t("common.regenerate")}
                    </Button>
                  ) : null}
                </div>
                {showReasoningPanel ? (
                  <details className="ai-reasoning-panel">
                    <summary>{t("aiChat.reasoningTitle")}</summary>
                    <pre className="ai-reasoning">{message.reasoning || t("aiChat.thinkingPlaceholder")}</pre>
                  </details>
                ) : null}
                <pre>{message.content || (isActiveAssistant ? t("aiChat.thinkingPlaceholder") : "")}</pre>
                {message.preview ? (
                  <AiAgentPreviewBlock
                    preview={message.preview}
                    state={message.previewState ?? "pending"}
                    t={t}
                    onApply={() => applyPreview(message.id, message.preview!)}
                    onDiscard={() => discardPreview(message.id)}
                  />
                ) : null}
              </article>
            );
          })}
        </div>

        {error ? <div className="ai-chat-error">{error}</div> : null}

        <footer className="ai-chat-composer">
          <div className="ai-chat-composer-input">
            {showMentionSuggestions ? (
              <div className="ai-mention-menu" role="listbox" aria-label={t("aiChat.mentionTargets")}>
                {mentionSuggestions.map((target, index) => (
                  <button
                    aria-selected={index === mentionActiveIndex}
                    className={index === mentionActiveIndex ? "active" : ""}
                    key={target.value}
                    role="option"
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      applyMentionSuggestion(target);
                    }}
                  >
                    <strong>{target.label}</strong>
                    <span>{target.description}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <AutoResizeTextarea
              ref={composerRef}
              disabled={busy}
              placeholder={mode === "edit" ? t("aiChat.editPlaceholder") : t("aiChat.placeholder")}
              value={draft}
              onChange={(event) => {
                const nextDraft = event.currentTarget.value;
                const nextCursor = event.currentTarget.selectionStart ?? nextDraft.length;
                setMentionMenuSuppressed(false);
                setWorkflowMenuSuppressed(false);
                setDraft(nextDraft);
                if (!findActiveWorkflowQuery(nextDraft, nextCursor)) {
                  setWorkflowMenuOpen(false);
                }
              }}
              onKeyDown={(event) => {
                if (showWorkflowMenu) {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setWorkflowActiveIndex((current) => (current + 1) % workflowSuggestions.length);
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setWorkflowActiveIndex((current) => (current - 1 + workflowSuggestions.length) % workflowSuggestions.length);
                    return;
                  }
                  if (event.key === "Tab" || event.key === "Enter") {
                    event.preventDefault();
                    runWorkflowFromMenu(workflowSuggestions[workflowActiveIndex] ?? workflowSuggestions[0]);
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setWorkflowMenuOpen(false);
                    setWorkflowMenuSuppressed(true);
                    setWorkflowActiveIndex(0);
                    return;
                  }
                }
                if (showMentionSuggestions) {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setMentionActiveIndex((current) => (current + 1) % mentionSuggestions.length);
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setMentionActiveIndex((current) => (current - 1 + mentionSuggestions.length) % mentionSuggestions.length);
                    return;
                  }
                  if (event.key === "Tab" || event.key === "Enter") {
                    event.preventDefault();
                    applyMentionSuggestion(mentionSuggestions[mentionActiveIndex] ?? mentionSuggestions[0]);
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setMentionMenuSuppressed(true);
                    setMentionActiveIndex(0);
                    return;
                  }
                }
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
          </div>
          <div className="ai-chat-composer-toolbar">
            <div className="ai-chat-composer-tools">
              {mode === "edit" ? (
                <div className="ai-workflow-shell">
                  {showWorkflowMenu ? (
                    <div className="ai-workflow-menu" role="listbox" aria-label={t("aiWorkflow.title" as never)}>
                      {workflowSuggestions.map((action, index) => (
                        <button
                          aria-selected={index === workflowActiveIndex}
                          className={index === workflowActiveIndex ? "active" : ""}
                          disabled={busy}
                          key={action}
                          role="option"
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            runWorkflowFromMenu(action);
                          }}
                        >
                          {t(`aiWorkflow.${action}` as never)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <button
                    className="ai-workflow-trigger"
                    disabled={busy}
                    type="button"
                    aria-label={t("aiWorkflow.title" as never)}
                    title={t("aiWorkflow.title" as never)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      const nextOpen = !showWorkflowMenu;
                      setSettingsMenuOpen(false);
                      setMentionMenuSuppressed(true);
                      setWorkflowMenuSuppressed(!nextOpen && Boolean(workflowQuery));
                      setWorkflowMenuOpen(nextOpen);
                      setWorkflowActiveIndex(0);
                      window.requestAnimationFrame(() => composerRef.current?.focus());
                    }}
                  >
                    <Plus size={16} aria-hidden="true" />
                  </button>
                </div>
              ) : null}
            </div>
            <div className="ai-chat-composer-actions">
              <div className="ai-model-menu-shell">
                <button
                  className="ai-model-menu-trigger"
                  type="button"
                  aria-expanded={settingsMenuOpen}
                  aria-label={`${t("settings.model" as never)} / ${t("settings.thinkingEffort" as never)}`}
                  onClick={() => {
                    setWorkflowMenuOpen(false);
                    setSettingsMenuOpen((current) => !current);
                  }}
                >
                  <span>{compactModelLabel(aiSettings.model)}</span>
                  <span>{thinkingLabel}</span>
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
                {settingsMenuOpen ? (
                  <div className="ai-model-menu">
                    <label className="field">
                      <span>{t("settings.model" as never)}</span>
                      <select
                        className="input"
                        value={aiSettings.model}
                        onChange={(event) => updateAiSettings({ model: event.currentTarget.value })}
                      >
                        {modelOptions.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="ai-thinking-picker" aria-label={t("settings.thinkingEffort" as never)}>
                      <span>{t("settings.thinkingEffort" as never)}</span>
                      <div className="ai-thinking-options">
                        <button
                          className={aiSettings.thinkingMode === "disabled" ? "active" : ""}
                          type="button"
                          onClick={() => updateAiSettings({ thinkingMode: "disabled" })}
                        >
                          {t("common.disabled")}
                        </button>
                        {(["high", "max"] as const).map((effort) => (
                          <button
                            className={aiSettings.thinkingMode === "enabled" && aiSettings.thinkingEffort === effort ? "active" : ""}
                            key={effort}
                            type="button"
                            onClick={() => updateAiSettings({ thinkingMode: "enabled", thinkingEffort: effort })}
                          >
                            {formatThinkingEffort(effort, t)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
              <button className="ai-send-button" disabled={busy || !draft.trim()} type="button" aria-label={t("common.send")} onClick={() => void send()}>
                <ArrowUp size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        </footer>
      </aside>
    </div>
  );

  function scrollToBottom() {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }
}

function AiAgentPreviewBlock({
  preview,
  state,
  onApply,
  onDiscard,
  t
}: {
  preview: AiAgentPreview;
  state: "pending" | "applied" | "discarded";
  onApply: () => void;
  onDiscard: () => void;
  t: Translator;
}) {
  const errors = preview.validationReport.errors.length;
  const warnings = preview.validationReport.warnings.length;
  const canApply = state === "pending" && errors === 0 && preview.diffs.length > 0;
  const responseJson = preview.rejectedPatches?.length
    ? { ...preview.response, rejectedPatches: preview.rejectedPatches }
    : preview.response;

  return (
    <div className="ai-agent-preview">
      <div className="ai-agent-preview-heading">
        <strong>{t("aiAgent.previewTitle")}</strong>
        <span className={errors > 0 ? "state-pill state-pill-hot" : "state-pill"}>
          {t("aiAgent.validationSummary", { errors, warnings })}
        </span>
      </div>

      <div className="ai-agent-json-list">
        <JsonPreviewDetails
          label={t("aiAgent.responseJson")}
          meta={t("aiAgent.patchCount", { count: preview.response.patches.length })}
          value={responseJson}
          open
        />
        <JsonPreviewDetails label={t("aiAgent.afterJson")} meta="normalized" value={preview.afterNormalized} />
      </div>

      {preview.response.summary.length > 0 ? (
        <ul className="ai-agent-summary">
          {preview.response.summary.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : null}

      {preview.diffs.length > 0 ? (
        <div className="ai-agent-changed-paths">
          <span>{t("aiAgent.changedPaths")}</span>
          {preview.diffs.map((diff) => (
            <code key={diff.path}>{diff.path}</code>
          ))}
        </div>
      ) : (
        <p className="muted ai-agent-no-diff">{t("aiAgent.noDiff")}</p>
      )}

      {errors > 0 ? <p className="ai-agent-warning">{t("aiAgent.validationBlocked")}</p> : null}

      <div className="ai-agent-actions">
        <span className="muted">{previewStateLabel(state, t)}</span>
        <div className="spacer" />
        <Button disabled={state !== "pending"} icon={<X size={16} />} variant="ghost" onClick={onDiscard}>
          {t("common.discard")}
        </Button>
        <Button disabled={!canApply} icon={<Check size={16} />} variant="primary" onClick={onApply}>
          {state === "applied" ? t("aiAgent.applied") : t("common.apply")}
        </Button>
      </div>
    </div>
  );
}

function JsonPreviewDetails({
  label,
  meta,
  value,
  open = false
}: {
  label: string;
  meta?: string;
  value: unknown;
  open?: boolean;
}) {
  return (
    <details className="ai-agent-json" open={open}>
      <summary>
        <span>{label}</span>
        {meta ? <code>{meta}</code> : null}
      </summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

function renderAgentMessage(response: AiAgentResponse, target: AiAgentEditTarget | undefined): string {
  const prefix = target ? `[${target.label}] ` : "";
  if (response.message.trim()) {
    return `${prefix}${response.message.trim()}`;
  }
  return response.patches.length > 0 ? `${prefix}Prepared card changes for review.` : `${prefix}No card changes are needed.`;
}

function resolveSpecialEditTarget(
  prompt: string,
  normalizedCard: ReturnType<typeof toNormalizedAiCard>,
  currentFieldTarget: ReturnType<typeof useAiFieldContext.getState>["currentTarget"],
  report: ReturnType<typeof validateCard>
): { target?: AiAgentEditTarget; allowedPaths?: string[] } {
  if (prompt.includes("@当前字段") || prompt.includes("@选中文本")) {
    return currentFieldTarget ? { target: createEditTargetFromFieldTarget(currentFieldTarget) } : {};
  }
  if (prompt.includes("@空字段")) {
    return { allowedPaths: emptyFieldPaths(normalizedCard) };
  }
  if (prompt.includes("@弱字段")) {
    return { allowedPaths: weakFieldPaths(normalizedCard) };
  }
  if (prompt.includes("@错误")) {
    const paths = [...report.errors, ...report.warnings].map((issue) => validationPathToNormalizedPath(issue.path)).filter(Boolean);
    return { allowedPaths: [...new Set(paths)] };
  }
  return {};
}

function parseDeniedMentionPaths(prompt: string): string[] {
  const denied = [...prompt.matchAll(/@不要改([^\s@，。！？、；：,.!?;:]*)/gu)].map((match) => match[1]).filter(Boolean);
  return denied.flatMap((mention) => {
    const normalized = mention.trim();
    if (["基础", "基本"].includes(normalized)) {
      return ["/name", "/creator", "/characterVersion", "/tags", "/creatorNotes"];
    }
    if (["提示词", "提示"].includes(normalized)) {
      return ["/description", "/personality", "/scenario", "/exampleDialogue", "/systemPrompt", "/postHistoryInstructions"];
    }
    if (["开场白", "开场"].includes(normalized)) {
      return ["/firstMessage", "/alternateGreetings"];
    }
    if (["世界书", "世界"].includes(normalized)) {
      return ["/worldBook"];
    }
    return [];
  });
}

function validationPathToNormalizedPath(path: string): string {
  const normalized = path.replace(/^data\./, "");
  const map: Record<string, string> = {
    name: "/name",
    description: "/description",
    personality: "/personality",
    scenario: "/scenario",
    first_mes: "/firstMessage",
    alternate_greetings: "/alternateGreetings",
    mes_example: "/exampleDialogue",
    creator_notes: "/creatorNotes",
    system_prompt: "/systemPrompt",
    post_history_instructions: "/postHistoryInstructions",
    tags: "/tags",
    creator: "/creator",
    character_version: "/characterVersion",
    character_book: "/worldBook",
    assets: ""
  };
  return map[normalized] ?? "";
}

export function buildMentionTargets(card: CharacterCardV3): MentionTarget[] {
  const targets = [
    {
      label: "@基础",
      value: "@基础",
      description: "名称、创作者、版本、标签、创作者备注",
      aliases: ["基础", "基本", "basic", "info", "name", "tags"]
    },
    {
      label: "@提示词",
      value: "@提示词",
      description: "角色描述、性格、场景、示例对话、系统提示词",
      aliases: ["提示词", "提示", "prompt", "prompts", "persona", "description"]
    },
    {
      label: "@开场白",
      value: "@开场白",
      description: "第一条消息和备用开场白",
      aliases: ["开场白", "开场", "问候", "greeting", "greetings", "firstmessage"]
    },
    {
      label: "@世界书",
      value: "@世界书",
      description: "世界书整体设置和条目",
      aliases: ["世界书", "世界", "条目", "lorebook", "worldbook", "entry"]
    }
  ];

  const entries = card.data.character_book?.entries ?? [];
  return [
    ...targets,
    ...entries.slice(0, 8).map((entry, index) => {
      const memo = deriveLorebookEntryComment(entry, index);
      const mention = memo.replace(/\s+/g, "_");
      return {
        label: `@${memo}`,
        value: `@${mention}`,
        description: `世界书条目 #${index + 1}${entry.keys.length ? ` · ${entry.keys.slice(0, 3).join(", ")}` : ""}`,
        aliases: [
          memo,
          `条目${index + 1}`,
          `entry${index + 1}`,
          `#${index + 1}`,
          entry.id === undefined ? "" : String(entry.id),
          entry.comment ?? "",
          ...entry.keys
        ].filter(Boolean)
      };
    })
  ];
}

export function findActiveMentionQuery(value: string, cursor: number): MentionQuery | undefined {
  const beforeCursor = value.slice(0, cursor);
  const match = beforeCursor.match(/(^|\s)@([^\s@，。！？、；：,.!?;:]*)$/u);
  if (!match || match.index === undefined) {
    return undefined;
  }
  const prefixLength = match[1].length;
  const start = match.index + prefixLength;
  return {
    start,
    end: cursor,
    query: match[2] ?? ""
  };
}

export function findActiveWorkflowQuery(value: string, cursor: number): WorkflowCommandQuery | undefined {
  const beforeCursor = value.slice(0, cursor);
  const match = beforeCursor.match(/(^|\s)\/([^\r\n]*)$/u);
  if (!match || match.index === undefined) {
    return undefined;
  }
  const prefixLength = match[1].length;
  const start = match.index + prefixLength;
  return {
    start,
    end: cursor,
    query: match[2] ?? ""
  };
}

export function filterMentionTargets(targets: MentionTarget[], query: string): MentionTarget[] {
  const normalizedQuery = normalizeMentionText(query);
  if (!normalizedQuery) {
    return targets;
  }
  return targets
    .map((target) => ({ target, score: mentionMatchScore(target, normalizedQuery) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => a.score - b.score)
    .map((item) => item.target);
}

export function filterWorkflowActions(
  actions: AiWorkflowAction[],
  query: string,
  getLabel: (action: AiWorkflowAction) => string
): AiWorkflowAction[] {
  const normalizedQuery = normalizeWorkflowCommandText(query);
  if (!normalizedQuery) {
    return actions;
  }
  return actions
    .map((action, index) => ({ action, index, score: workflowActionMatchScore(action, normalizedQuery, getLabel) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((item) => item.action);
}

function mentionMatchScore(target: MentionTarget, normalizedQuery: string): number {
  const candidates = [target.label, target.value, ...target.aliases].map(normalizeMentionText).filter(Boolean);
  if (candidates.some((candidate) => candidate === normalizedQuery)) {
    return 0;
  }
  if (candidates.some((candidate) => candidate.startsWith(normalizedQuery))) {
    return 1;
  }
  if (candidates.some((candidate) => candidate.includes(normalizedQuery))) {
    return 2;
  }
  return -1;
}

function workflowActionMatchScore(
  action: AiWorkflowAction,
  normalizedQuery: string,
  getLabel: (action: AiWorkflowAction) => string
): number {
  const candidates = [action, getLabel(action), ...action.split("_")].map(normalizeWorkflowCommandText).filter(Boolean);
  if (candidates.some((candidate) => candidate === normalizedQuery)) {
    return 0;
  }
  if (candidates.some((candidate) => candidate.startsWith(normalizedQuery))) {
    return 1;
  }
  if (candidates.some((candidate) => candidate.includes(normalizedQuery))) {
    return 2;
  }
  return -1;
}

function normalizeMentionText(value: string): string {
  return value
    .trim()
    .replace(/^@/u, "")
    .replace(/[\s_\-:：/\\]+/gu, "")
    .toLowerCase();
}

function normalizeWorkflowCommandText(value: string): string {
  return value
    .trim()
    .replace(/^\/+/u, "")
    .replace(/[\s_\-:：\/\\]+/gu, "")
    .toLowerCase();
}

function buildModelOptions(currentModel: string, models: AiModel[]): AiModel[] {
  const options = currentModel.trim() ? [...models, { id: currentModel.trim() }] : models;
  const seen = new Set<string>();
  return options.filter((model) => {
    const id = model.id.trim();
    if (!id || seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}

function compactModelLabel(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) {
    return "model";
  }
  const leaf = trimmed.split("/").filter(Boolean).pop() ?? trimmed;
  const compact = leaf.replace(/^deepseek-/iu, "");
  return compact.length > 18 ? `${compact.slice(0, 15)}...` : compact;
}

function formatThinkingEffort(effort: AiThinkingEffort, t: Translator): string {
  return effort === "max" ? t("common.max") : t("common.high");
}

function formatThinkingLabel(mode: AiThinkingMode, effort: AiThinkingEffort, t: Translator): string {
  return mode === "disabled" ? t("common.disabled") : formatThinkingEffort(effort, t);
}

function buildConversation(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.content.trim().length > 0)
    .slice(-8)
    .map((message) => ({
      role: message.role,
      content: message.content
    }));
}

function buildSessionTitle(messages: ChatMessage[]): string {
  const firstUserMessage = messages.find((message) => message.role === "user")?.content ?? "";
  const normalized = firstUserMessage.replace(/\s+/g, " ").trim();
  return normalized ? truncateText(normalized, 48) : "AI Chat";
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function formatHistoryTime(value: number, locale: string): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }
  return new Date(value).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function isBlankCard(card: CharacterCardV3): boolean {
  const normalized = toNormalizedAiCard(card);
  return (
    !normalized.name.trim() &&
    !normalized.description.trim() &&
    !normalized.personality.trim() &&
    !normalized.scenario.trim() &&
    !normalized.firstMessage.trim() &&
    !normalized.exampleDialogue.trim() &&
    normalized.alternateGreetings.length === 0 &&
    normalized.tags.length === 0 &&
    (normalized.worldBook?.entries.length ?? 0) === 0
  );
}

function tabForDiff(diff: AiAgentDiff | undefined): string | undefined {
  if (!diff) {
    return undefined;
  }
  if (diff.path.startsWith("/worldBook")) {
    return "lorebook";
  }
  if (diff.path.startsWith("/firstMessage") || diff.path.startsWith("/alternateGreetings")) {
    return "greetings";
  }
  if (
    diff.path.startsWith("/description") ||
    diff.path.startsWith("/personality") ||
    diff.path.startsWith("/scenario") ||
    diff.path.startsWith("/exampleDialogue") ||
    diff.path.startsWith("/systemPrompt") ||
    diff.path.startsWith("/postHistoryInstructions")
  ) {
    return "prompts";
  }
  return "basic";
}

function previewStateLabel(state: "pending" | "applied" | "discarded", t: Translator): string {
  if (state === "applied") {
    return t("aiAgent.applied");
  }
  if (state === "discarded") {
    return t("aiAgent.discarded");
  }
  return t("aiAgent.pendingReview");
}

function createMessageId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `message-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createSessionId(): string {
  if (globalThis.crypto?.randomUUID) {
    return `session-${globalThis.crypto.randomUUID()}`;
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
