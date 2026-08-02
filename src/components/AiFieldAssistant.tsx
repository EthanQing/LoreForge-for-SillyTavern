import { useMemo, useRef, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { Button } from "./Button";
import { useContextMenuTarget } from "../lib/contextMenuTargets";
import { useAgentStudioActions, type AgentFieldAction, type AgentFieldTarget } from "../lib/agent/uiContext";

interface AiFieldAssistantProps {
  target: AgentFieldTarget;
  children: React.ReactNode;
}

const defaultActions: Array<{ action: AgentFieldAction; label: string }> = [
  { action: "polish_expand", label: "润色扩写" },
  { action: "rewrite", label: "重写" }
];

const moreActions: Array<{ action: AgentFieldAction; label: string }> = [
  { action: "complete", label: "补全" },
  { action: "shorten", label: "缩短" },
  { action: "translate", label: "翻译" },
  { action: "character_voice", label: "角色语气" },
  { action: "conflict_check", label: "冲突检查" },
  { action: "extract_keywords", label: "提取关键词" },
  { action: "variants", label: "生成变体" }
];

export function AiFieldAssistant({ target, children }: AiFieldAssistantProps) {
  const studio = useAgentStudioActions();
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [message, setMessage] = useState("");
  const blurTimer = useRef<number | undefined>(undefined);
  const recommendedAction = useMemo<AgentFieldAction | undefined>(() => {
    if (!target.value.trim()) return "complete";
    if (target.value.length > 1400) return "shorten";
    return undefined;
  }, [target.value]);
  const ready = Boolean(studio?.ready);
  const busy = Boolean(studio?.busy);

  const runAction = async (action: AgentFieldAction) => {
    if (!studio || busy) return;
    if (!studio.ready) {
      setMessage("请先在设置中配置可用的 Agent 模型与系统凭据。");
      return;
    }
    setMenuOpen(false);
    setMessage("已发送到当前 Agent 会话，修改将在对话区生成待审核提案。");
    try {
      await studio.runFieldAction(target, action);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const contextTargetId = useContextMenuTarget(() => ({
    kind: "ai-field",
    label: target.label,
    path: target.path,
    value: target.value,
    ready,
    busy,
    runAction
  }));

  return <div
    className="ai-field-shell"
    data-context-menu="ai-field"
    data-context-target-id={contextTargetId}
    onFocus={() => { window.clearTimeout(blurTimer.current); setFocused(true); }}
    onBlur={() => { blurTimer.current = window.setTimeout(() => setFocused(false), 160); }}
  >
    {children}
    {(focused || menuOpen) ? <div className="ai-field-actions">
      {recommendedAction ? <Button disabled={busy} icon={<Sparkles size={14} />} onClick={() => void runAction(recommendedAction)}>{actionLabel(recommendedAction)}</Button> : null}
      {defaultActions.map((item) => <Button disabled={busy} icon={<Sparkles size={14} />} key={item.action} onClick={() => void runAction(item.action)}>{item.label}</Button>)}
      <div className="ai-field-more">
        <Button disabled={busy} icon={<ChevronDown size={14} />} variant="ghost" onClick={() => setMenuOpen((open) => !open)}>更多</Button>
        {menuOpen ? <div className="ai-field-menu">{moreActions.map((item) => <button key={item.action} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => void runAction(item.action)}>{item.label}</button>)}</div> : null}
      </div>
    </div> : null}
    {message ? <div className="ai-field-feedback" role="status">{message}</div> : null}
  </div>;
}

function actionLabel(action: AgentFieldAction): string {
  return action === "polish_expand" ? "润色扩写" : action === "complete" ? "补全" : "缩短";
}
