import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, RotateCcw, Sparkles, X } from "lucide-react";
import { Button } from "./Button";
import { useCardStore } from "../app/store";
import { applyCardProposal, type CardProposal } from "../lib/agent/contracts";
import { CardAgentController } from "../lib/agent/controller";
import { toNormalizedAiCard } from "../lib/aiAgent";
import { useAiFieldContext } from "../lib/aiFieldContext";
import { useContextMenuTarget } from "../lib/contextMenuTargets";
import { useI18n } from "../lib/i18n";
import type { AiFieldAction, AiFieldTarget } from "../lib/aiAgent";

interface AiFieldAssistantProps {
  target: Extract<AiFieldTarget, { kind: "field" | "selection" }>;
  children: React.ReactNode;
  onApply: (value: string) => void;
}

const defaultActions: Array<{ action: AiFieldAction; label: string }> = [
  { action: "polish_expand", label: "润色扩写" },
  { action: "rewrite", label: "重写" }
];

const moreActions: Array<{ action: AiFieldAction; label: string }> = [
  { action: "complete", label: "补全" },
  { action: "shorten", label: "缩短" },
  { action: "translate", label: "翻译" },
  { action: "character_voice", label: "角色语气" },
  { action: "conflict_check", label: "冲突检查" },
  { action: "extract_keywords", label: "提取关键词" },
  { action: "variants", label: "生成变体" }
];

interface FieldProposalPreview {
  proposal: CardProposal;
  before: string;
  after: string;
}

export function AiFieldAssistant({ target, children, onApply }: AiFieldAssistantProps) {
  const { t } = useI18n();
  const card = useCardStore((state) => state.card);
  const aiSettings = useCardStore((state) => state.aiSettings);
  const workspaceId = useCardStore((state) => state.workspaceId);
  const cardRevision = useCardStore((state) => state.cardRevision);
  const setCurrentTarget = useAiFieldContext((state) => state.setCurrentTarget);
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<FieldProposalPreview>();
  const blurTimer = useRef<number | undefined>(undefined);
  const controllerRef = useRef<CardAgentController | undefined>(undefined);
  const ready = aiSettings.enabled && aiSettings.baseUrl.trim() && aiSettings.model.trim();
  const recommendedAction = useMemo(() => {
    if (!target.value.trim()) return "complete" as AiFieldAction;
    if (target.value.length > 1400) return "shorten" as AiFieldAction;
    return undefined;
  }, [target.value]);

  const runAction = async (action: AiFieldAction) => {
    if (busy) return;
    if (!ready) {
      setError("请先在设置中配置模型连接和系统凭据。");
      return;
    }
    setBusy(true);
    setError("");
    setMenuOpen(false);
    const sessionId = "field-" + workspaceId;
    const controller = new CardAgentController({
      profile: {
        id: aiSettings.profileId,
        kind: aiSettings.providerProfile,
        baseUrl: aiSettings.baseUrl,
        model: aiSettings.model,
        credentialId: aiSettings.credentialId,
        contextWindow: aiSettings.contextWindow,
        maxOutputTokens: Math.max(aiSettings.maxOutputTokens, 4096),
        timeoutMs: Math.max(aiSettings.timeoutMs, 90_000),
        temperature: aiSettings.temperature,
        thinkingLevel: aiSettings.thinkingMode === "disabled" ? "off" : aiSettings.thinkingLevel,
        toolCalling: aiSettings.toolCalling,
        allowInsecureHttp: aiSettings.allowInsecureHttp
      },
      sessionId,
      allowedPaths: [target.path],
      getSnapshot: () => ({ card: useCardStore.getState().card, workspaceId: useCardStore.getState().workspaceId, cardRevision: useCardStore.getState().cardRevision, report: useCardStore.getState().report }),
      onProposal: (proposal) => {
        const outcome = applyCardProposal(proposal, useCardStore.getState().card);
        if (outcome.state === "applied") {
          setPreview({ proposal, before: target.value, after: readPathValue(outcome.card, target.path) ?? "" });
        } else {
          setError(outcome.reasons.join(" "));
        }
      }
    });
    controllerRef.current = controller;
    try {
      await controller.send("对字段 " + target.label + " 执行“" + action + "”。只允许修改 " + target.path + "，先读取当前卡片 revision " + cardRevision + "，然后使用 propose_card_changes 创建待审核提案。");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      controller.dispose();
      controllerRef.current = undefined;
      setBusy(false);
    }
  };

  const applyPreview = () => {
    if (!preview) return;
    const outcome = applyCardProposal(preview.proposal, useCardStore.getState().card);
    if (outcome.state === "applied") {
      onApply(readPathValue(outcome.card, target.path) ?? preview.after);
      setPreview(undefined);
    } else {
      setError(outcome.reasons.join(" "));
    }
  };

  const contextTargetId = useContextMenuTarget(() => ({ kind: "ai-field", label: target.label, path: target.path, value: target.value, ready: Boolean(ready), busy, runAction: (action: AiFieldAction) => void runAction(action) }));

  return <div className="ai-field-shell" data-context-menu="ai-field" data-context-target-id={contextTargetId} onFocus={() => { window.clearTimeout(blurTimer.current); setFocused(true); setCurrentTarget(target); }} onBlur={() => { blurTimer.current = window.setTimeout(() => setFocused(false), 160); }}>
    {children}
    {(focused || preview || menuOpen) ? <div className="ai-field-actions">
      {recommendedAction ? <Button disabled={busy} icon={<Sparkles size={14} />} onClick={() => void runAction(recommendedAction)}>{actionLabel(recommendedAction)}</Button> : null}
      {defaultActions.map((item) => <Button disabled={busy} icon={<Sparkles size={14} />} key={item.action} onClick={() => void runAction(item.action)}>{item.label}</Button>)}
      <div className="ai-field-more"><Button disabled={busy} icon={<ChevronDown size={14} />} variant="ghost" onClick={() => setMenuOpen((open) => !open)}>更多</Button>{menuOpen ? <div className="ai-field-menu">{moreActions.map((item) => <button key={item.action} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => void runAction(item.action)}>{item.label}</button>)}</div> : null}</div>
    </div> : null}
    {preview ? <div className="ai-field-preview"><strong>Agent 提案预览</strong><div className="ai-field-preview-grid"><pre>{preview.before || t("common.none")}</pre><pre>{preview.after || t("common.none")}</pre></div><div className="ai-field-preview-actions"><Button icon={<RotateCcw size={14} />} variant="ghost" onClick={() => setPreview(undefined)}>丢弃</Button><Button icon={<X size={14} />} variant="ghost" onClick={() => setPreview(undefined)}>关闭</Button><Button icon={<Check size={14} />} variant="primary" onClick={applyPreview}>确认应用</Button></div></div> : null}
    {error ? <div className="ai-field-error">{error}</div> : null}
  </div>;
}

function readPathValue(card: ReturnType<typeof useCardStore.getState>["card"], path: string): string | undefined {
  const segments = path.replace(/^\/+/, "").split("/");
  let current: unknown = toNormalizedAiCard(card);
  for (const segment of segments) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" ? current : undefined;
}

function actionLabel(action: AiFieldAction): string {
  if (action === "polish_expand") return "润色扩写";
  return action;
}
