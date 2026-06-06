import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, RotateCcw, Sparkles, X } from "lucide-react";
import { Button } from "./Button";
import { useCardStore } from "../app/store";
import { sendAiChat } from "../lib/ai";
import { buildAiAgentMessages } from "../lib/aiAgentPrompts";
import {
  createAiAgentPreviewForTarget,
  createEditTargetFromFieldTarget,
  parseAiAgentResponse,
  toNormalizedAiCard,
  type AiAgentPreview,
  type AiFieldAction,
  type AiFieldTarget
} from "../lib/aiAgent";
import { useAiFieldContext } from "../lib/aiFieldContext";
import { useContextMenuTarget } from "../lib/contextMenuTargets";
import { useI18n } from "../lib/i18n";

interface AiFieldAssistantProps {
  target: Extract<AiFieldTarget, { kind: "field" | "selection" }>;
  children: React.ReactNode;
  onApply: (value: string) => void;
}

const defaultActions: Array<{ action: AiFieldAction; labelKey: string }> = [
  { action: "polish_expand", labelKey: "aiField.polishExpand" },
  { action: "rewrite", labelKey: "aiField.rewrite" }
];

const moreActions: Array<{ action: AiFieldAction; labelKey: string }> = [
  { action: "complete", labelKey: "aiField.complete" },
  { action: "shorten", labelKey: "aiField.shorten" },
  { action: "translate", labelKey: "aiField.translate" },
  { action: "character_voice", labelKey: "aiField.characterVoice" },
  { action: "conflict_check", labelKey: "aiField.conflictCheck" },
  { action: "extract_keywords", labelKey: "aiField.extractKeywords" },
  { action: "variants", labelKey: "aiField.variants" }
];

export function AiFieldAssistant({ target, children, onApply }: AiFieldAssistantProps) {
  const { locale, t } = useI18n();
  const card = useCardStore((state) => state.card);
  const report = useCardStore((state) => state.report);
  const aiSettings = useCardStore((state) => state.aiSettings);
  const setCurrentTarget = useAiFieldContext((state) => state.setCurrentTarget);
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<AiAgentPreview | undefined>();
  const blurTimer = useRef<number | undefined>(undefined);
  const ready = aiSettings.enabled && aiSettings.apiKey.trim() && aiSettings.baseUrl.trim() && aiSettings.model.trim();
  const recommendedAction = useMemo(() => {
    if (!target.value.trim()) {
      return "complete" as AiFieldAction;
    }
    if (target.value.length > 1400) {
      return "shorten" as AiFieldAction;
    }
    return undefined;
  }, [target.value]);

  const runAction = async (action: AiFieldAction) => {
    if (busy) {
      return;
    }
    if (!ready) {
      setError(t("aiChat.openSettingsFirst"));
      return;
    }
    const editTarget = createEditTargetFromFieldTarget(target);
    const instruction = t(`aiField.prompt.${action}` as never, { field: target.label });
    setBusy(true);
    setError("");
    setMenuOpen(false);
    try {
      const result = await sendAiChat(
        {
          ...aiSettings,
          maxOutputTokens: Math.max(aiSettings.maxOutputTokens, 4096),
          timeoutMs: Math.max(aiSettings.timeoutMs, 90_000)
        },
        buildAiAgentMessages({
          userInstruction: instruction,
          currentCard: toNormalizedAiCard(card),
          validationReport: report,
          locale,
          isBlankCard: false,
          editTarget,
          fieldTarget: target,
          fieldAction: action,
          allowedPaths: editTarget.editablePaths
        })
      );
      const response = parseAiAgentResponse(result.content);
      setPreview(createAiAgentPreviewForTarget(card, response, editTarget));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setBusy(false);
    }
  };

  const applyPreview = () => {
    if (!preview) {
      return;
    }
    const nextValue = readTargetValue(preview, target.path);
    if (typeof nextValue === "string") {
      onApply(nextValue);
    }
    setPreview(undefined);
  };

  const contextTargetId = useContextMenuTarget(() => ({
    kind: "ai-field",
    label: target.label,
    path: target.path,
    value: target.value,
    ready: Boolean(ready),
    busy,
    runAction: (action) => void runAction(action)
  }));

  return (
    <div
      className="ai-field-shell"
      data-context-menu="ai-field"
      data-context-target-id={contextTargetId}
      onFocus={() => {
        window.clearTimeout(blurTimer.current);
        setFocused(true);
        setCurrentTarget(target);
      }}
      onBlur={() => {
        blurTimer.current = window.setTimeout(() => setFocused(false), 160);
      }}
    >
      {children}
      {(focused || preview || menuOpen) ? (
        <div className="ai-field-actions">
          {recommendedAction ? (
            <Button disabled={busy} icon={<Sparkles size={14} />} onClick={() => void runAction(recommendedAction)}>
              {t(`aiField.${actionKey(recommendedAction)}` as never)}
            </Button>
          ) : null}
          {defaultActions.map((item) => (
            <Button disabled={busy} icon={<Sparkles size={14} />} key={item.action} onClick={() => void runAction(item.action)}>
              {t(item.labelKey as never)}
            </Button>
          ))}
          <div className="ai-field-more">
            <Button disabled={busy} icon={<ChevronDown size={14} />} variant="ghost" onClick={() => setMenuOpen((open) => !open)}>
              {t("aiField.more" as never)}
            </Button>
            {menuOpen ? (
              <div className="ai-field-menu">
                {moreActions.map((item) => (
                  <button key={item.action} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => void runAction(item.action)}>
                    {t(item.labelKey as never)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {preview ? (
        <div className="ai-field-preview">
          <strong>{t("aiField.preview" as never)}</strong>
          <div className="ai-field-preview-grid">
            <pre>{target.value || t("common.none")}</pre>
            <pre>{readTargetValue(preview, target.path) ?? t("common.none")}</pre>
          </div>
          <div className="ai-field-preview-actions">
            <Button icon={<RotateCcw size={14} />} variant="ghost" onClick={() => setPreview(undefined)}>
              {t("common.discard")}
            </Button>
            <Button icon={<X size={14} />} variant="ghost" onClick={() => setPreview(undefined)}>
              {t("common.close")}
            </Button>
            <Button icon={<Check size={14} />} variant="primary" onClick={applyPreview}>
              {t("common.apply")}
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <div className="ai-field-error">{error}</div> : null}
    </div>
  );
}

function readTargetValue(preview: AiAgentPreview, path: string): string | undefined {
  const normalized = preview.afterNormalized as unknown as Record<string, unknown>;
  const value = path
    .slice(1)
    .split("/")
    .reduce<unknown>((current, segment) => {
      if (current && typeof current === "object") {
        return (current as Record<string, unknown>)[segment];
      }
      return undefined;
    }, normalized);
  return typeof value === "string" ? value : undefined;
}

function actionKey(action: AiFieldAction): string {
  switch (action) {
    case "polish_expand":
      return "polishExpand";
    case "character_voice":
      return "characterVoice";
    case "conflict_check":
      return "conflictCheck";
    case "extract_keywords":
      return "extractKeywords";
    default:
      return action;
  }
}
