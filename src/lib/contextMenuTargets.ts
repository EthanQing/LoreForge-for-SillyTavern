import { useEffect, useId, useRef } from "react";
import type { AgentFieldAction } from "./agent/uiContext";

export type ContextMenuTarget = AiFieldContextMenuTarget | LorebookPanelContextMenuTarget | LorebookEntryContextMenuTarget;

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
