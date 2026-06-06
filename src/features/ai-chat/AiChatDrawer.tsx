import { useEffect, useRef, useState } from "react";
import { Bot, BrainCircuit, Check, History, PanelRightClose, Plus, RotateCcw, Send, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "../../components/Button";
import { AutoResizeTextarea } from "../../components/Field";
import { useCardStore } from "../../app/store";
import { useI18n } from "../../lib/i18n";
import { sendAiChat } from "../../lib/ai";
import { buildAiAgentMessages } from "../../lib/aiAgentPrompts";
import {
  createAiAgentPreview,
  parseAiAgentResponse,
  toNormalizedAiCard,
  type AiAgentDiff,
  type AiAgentPreview,
  type AiAgentResponse
} from "../../lib/aiAgent";
import { createBlankCard, type CharacterCardV3 } from "../../lib/schema";
import { validateCard } from "../../lib/validation";
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

const AGENT_MIN_OUTPUT_TOKENS = 8192;
const AGENT_MIN_TIMEOUT_MS = 120_000;

export function AiChatDrawer({ open, onClose }: AiChatDrawerProps) {
  const { locale, t } = useI18n();
  const card = useCardStore((state) => state.card);
  const report = useCardStore((state) => state.report);
  const aiSettings = useCardStore((state) => state.aiSettings);
  const applyAgentCard = useCardStore((state) => state.applyAgentCard);
  const setActiveTab = useCardStore((state) => state.setActiveTab);
  const [sessionId, setSessionId] = useState(() => createSessionId());
  const [sessionCreatedAt, setSessionCreatedAt] = useState(() => Date.now());
  const [history, setHistory] = useState<AiChatSessionSummary[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historySaving, setHistorySaving] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [includeCard, setIncludeCard] = useState(true);
  const [busy, setBusy] = useState(false);
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const skipNextHistorySaveRef = useRef(false);
  const ready = aiSettings.enabled && aiSettings.apiKey.trim() && aiSettings.baseUrl.trim() && aiSettings.model.trim();

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

  const runAgentRequest = async (prompt: string, assistantId: string, conversationMessages: ChatMessage[]) => {
    const sourceCard = includeCard ? card : createBlankCard();
    const sourceReport = includeCard ? report : validateCard(sourceCard);
    const requestMessages = buildAiAgentMessages({
      userInstruction: prompt,
      currentCard: toNormalizedAiCard(sourceCard),
      validationReport: sourceReport,
      locale,
      isBlankCard: isBlankCard(sourceCard),
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
    const preview = response.patches.length > 0 ? createAiAgentPreview(sourceCard, response) : undefined;

    setMessages((current) =>
      current.map((message) =>
        message.id === assistantId
          ? {
              ...message,
              content: renderAgentMessage(response),
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
    setBusy(true);
    setActiveAssistantId(assistantId);
    setError("");
    queueMicrotask(scrollToBottom);

    try {
      await runAgentRequest(prompt, assistantId, [...messages, userMessage]);
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
      await runAgentRequest(userMessage.content, assistantId, messages.slice(0, assistantIndex));
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
    setError("");
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
          <span className="state-pill">{t("aiAgent.structuredMode")}</span>
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
          <AutoResizeTextarea
            disabled={busy}
            placeholder={t("aiChat.placeholder")}
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <Button disabled={busy || !draft.trim()} icon={<Send size={18} />} variant="primary" onClick={() => void send()}>
            {t("common.send")}
          </Button>
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

  return (
    <div className="ai-agent-preview">
      <div className="ai-agent-preview-heading">
        <strong>{t("aiAgent.previewTitle")}</strong>
        <span className={errors > 0 ? "state-pill state-pill-hot" : "state-pill"}>
          {t("aiAgent.validationSummary", { errors, warnings })}
        </span>
      </div>

      {preview.response.summary.length > 0 ? (
        <ul className="ai-agent-summary">
          {preview.response.summary.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : null}

      {preview.diffs.length > 0 ? (
        <div className="ai-agent-diffs">
          {preview.diffs.map((diff) => (
            <details className="ai-agent-diff" key={diff.path} open={preview.diffs.length <= 3}>
              <summary>
                <span>{diff.label}</span>
                <code>{diff.path}</code>
              </summary>
              <div className="ai-agent-diff-grid">
                <DiffValue label={t("aiAgent.before")} value={diff.before} />
                <DiffValue label={t("aiAgent.after")} value={diff.after} />
              </div>
            </details>
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

function DiffValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <pre>{value}</pre>
    </div>
  );
}

function renderAgentMessage(response: AiAgentResponse): string {
  if (response.message.trim()) {
    return response.message.trim();
  }
  return response.patches.length > 0 ? "Prepared card changes for review." : "No card changes are needed.";
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
