import { useEffect, useRef } from "react";
import type { AgentMentionOption } from "./agentMention";

export const AGENT_MENTION_LISTBOX_ID = "agent-mentions";

export function getAgentMentionOptionId(optionId: string | number): string {
  return `agent-mention-${String(optionId).replace(/[^a-zA-Z0-9_-]/gu, "-")}`;
}

interface AgentMentionMenuProps {
  options: AgentMentionOption[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onSelect: (option: AgentMentionOption) => void;
}

export function AgentMentionMenu({ options, activeIndex, onActiveIndexChange, onSelect }: AgentMentionMenuProps) {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div className="agent-mention-popover">
      <div className="agent-mention-heading">
        <strong>选择 @ 目标</strong>
        <span>{options.length > 0 ? `${options.length} 个匹配项` : "无匹配项"}</span>
      </div>
      <div className="agent-mention-list" id={AGENT_MENTION_LISTBOX_ID} role="listbox" aria-label="Agent @ 目标">
        {options.length === 0 ? (
          <div className="agent-mention-empty" role="status">当前页面没有匹配的可 @ 目标。</div>
        ) : options.map((option, index) => (
          <button
            ref={index === activeIndex ? activeRef : undefined}
            className={index === activeIndex ? "agent-mention-option is-active" : "agent-mention-option"}
            id={getAgentMentionOptionId(option.optionId)}
            key={option.optionId}
            role="option"
            type="button"
            tabIndex={-1}
            aria-selected={index === activeIndex}
            onClick={() => onSelect(option)}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => onActiveIndexChange(index)}
          >
            <strong>{option.title}</strong>
            <span>{option.description}</span>
          </button>
        ))}
      </div>
      <div className="agent-mention-hint">↑↓ 选择 · Tab 确认 · Esc 关闭</div>
    </div>
  );
}
