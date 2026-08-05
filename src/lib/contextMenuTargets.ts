import { useEffect, useId, useRef } from "react";
import type { AgentFieldAction } from "./agent/uiContext";

export type ContextMenuTarget =
  | AiFieldContextMenuTarget
  | LorebookPanelContextMenuTarget
  | LorebookEntryContextMenuTarget
  | AgentSessionListContextMenuTarget
  | AgentSessionContextMenuTarget
  | AgentChatContextMenuTarget
  | AgentMessageContextMenuTarget
  | AgentComposerContextMenuTarget
  | AgentToolbarContextMenuTarget;

export interface AiFieldContextMenuTarget {
  kind: "ai-field";
  label: string;
  path: string;
  value: string;
  ready: boolean;
  busy: boolean;
  runAction: (action: AgentFieldAction) => void | Promise<void>;
}

export interface LorebookPanelContextMenuTarget {
  kind: "lorebook-panel";
  hasBook: boolean;
  createLorebook: () => void;
  addEntry: () => void;
  importLorebook: () => void;
  exportLorebook: () => void;
  fillEmptyMemos: () => void;
}

export interface LorebookEntryContextMenuTarget {
  kind: "lorebook-entry";
  title: string;
  index: number;
  isOpen: boolean;
  isEnabled: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  setOpen: (open: boolean) => void;
  moveUp: () => void;
  moveDown: () => void;
  toggleEnabled: () => void;
  copyJson: () => void | Promise<void>;
  deleteEntry: () => void;
}

export interface AgentSessionListContextMenuTarget {
  kind: "agent-session-list";
  createSession: () => void | Promise<void>;
  selectPrevious: () => void | Promise<void>;
  selectNext: () => void | Promise<void>;
}

export interface AgentSessionContextMenuTarget {
  kind: "agent-session";
  title: string;
  isCurrent: boolean;
  isRead: boolean;
  pinned: boolean;
  canSelect: boolean;
  canDelete: boolean;
  createSession: () => void | Promise<void>;
  selectSession: () => void | Promise<void>;
  selectPrevious: () => void | Promise<void>;
  selectNext: () => void | Promise<void>;
  renameSession: () => void | Promise<void>;
  deleteSession: () => void | Promise<void>;
  togglePinned: () => void | Promise<void>;
  toggleRead: () => void | Promise<void>;
  exportSession: () => void | Promise<void>;
}

export interface AgentChatContextMenuTarget {
  kind: "agent-chat";
  copySession: () => void | Promise<void>;
  selectAllMessages: () => void;
  clearMessageSelection: () => void;
  scrollToTop: () => void;
  scrollToBottom: () => void;
  regenerate: () => void | Promise<void>;
  canRegenerate: boolean;
}

export interface AgentMessageContextMenuTarget {
  kind: "agent-message";
  role: "user" | "assistant";
  text: string;
  selected: boolean;
  canDelete: boolean;
  copyMessage: (text: string) => void | Promise<void>;
  quoteMessage: () => void;
  forwardMessage: () => void;
  deleteMessage: () => void;
  toggleSelection: () => void;
  showDetails: () => void;
}

export interface AgentComposerContextMenuTarget {
  kind: "agent-composer";
  clearInput: () => void;
  send: () => void | Promise<void>;
  continueAfterGeneration: () => void | Promise<void>;
  canSend: boolean;
  canContinue: boolean;
}

export interface AgentToolbarContextMenuTarget {
  kind: "agent-toolbar";
  createSession: () => void | Promise<void>;
  customizeToolbar: () => void;
  toggleInspector: () => void;
  stopGeneration: () => void;
  openSettings: () => void;
  canStop: boolean;
}

type TargetGetter = () => ContextMenuTarget | null | undefined;

const targetGetters = new Map<string, TargetGetter>();

export function registerContextMenuTarget(id: string, getTarget: TargetGetter): () => void {
  targetGetters.set(id, getTarget);
  return () => {
    if (targetGetters.get(id) === getTarget) {
      targetGetters.delete(id);
    }
  };
}

export function getContextMenuTarget(id: string | null | undefined): ContextMenuTarget | null {
  if (!id) {
    return null;
  }
  return targetGetters.get(id)?.() ?? null;
}

export function useContextMenuTarget(getTarget: TargetGetter): string {
  const id = useId();
  const getterRef = useRef(getTarget);
  getterRef.current = getTarget;

  useEffect(() => {
    return registerContextMenuTarget(id, () => getterRef.current());
  }, [id]);

  return id;
}
