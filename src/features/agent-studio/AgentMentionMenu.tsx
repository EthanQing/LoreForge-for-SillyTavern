import { useEffect, useRef } from "react";
import type { LorebookMentionOption } from "./agentMention";

export const AGENT_MENTION_LISTBOX_ID = "agent-lorebook-mentions";

export function getAgentMentionOptionId(entryIndex: number): string {
  return `agent-lorebook-mention-${entryIndex}`;
}

interface AgentMentionMenuProps {
  options: LorebookMentionOption[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onSelect: (option: LorebookMentionOption) => void;
}

export function AgentMentionMenu({ options, activeIndex, onActiveIndexChange, onSelect }: AgentMentionMenuProps) {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div className="agent-mention-popover">
      <div className="agent-mention-heading">
        <strong>选择世界书条目</strong>
        <span>{options.length > 0 ? `${options.length} 个匹配项` : "无匹配项"}</span>
      </div>
      <div className="agent-mention-list" id={AGENT_MENTION_LISTBOX_ID} role="listbox" aria-label="世界书条目">
        {options.length === 0 ? (
          <div className="agent-mention-empty" role="status">当前卡片没有匹配的世界书条目。</div>
        ) : options.map((option, index) => (
          <button
            ref={index === activeIndex ? activeRef : undefined}
            className={index === activeIndex ? "agent-mention-option is-active" : "agent-mention-option"}
            id={getAgentMentionOptionId(option.entryIndex)}
            key={option.entryIndex}
            role="option"
            type="button"
            tabIndex={-1}
            aria-selected={index === activeIndex}
            onClick={() => onSelect(option)}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => onActiveIndexChange(index)}
          >
            <strong>{option.title}</strong>
            <span>
              第 {option.entryIndex + 1} 条 · 插入顺序 #{option.insertionOrder} · {option.keyCount} 个关键词
              {option.id === undefined || option.id === "" ? "" : ` · ID ${option.id}`}
            </span>
          </button>
        ))}
      </div>
      <div className="agent-mention-hint">↑↓ 选择 · Tab 确认 · Esc 关闭</div>
    </div>
  );
}
