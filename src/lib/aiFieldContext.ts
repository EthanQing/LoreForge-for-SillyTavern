import { create } from "zustand";
import type { AiFieldTarget } from "./aiAgent";

interface AiFieldContextState {
  currentTarget?: AiFieldTarget;
  setCurrentTarget: (target: AiFieldTarget | undefined) => void;
}

export const useAiFieldContext = create<AiFieldContextState>((set) => ({
  currentTarget: undefined,
  setCurrentTarget: (currentTarget) => set({ currentTarget })
}));

export function selectionTarget(target: Extract<AiFieldTarget, { kind: "field" }>, start: number, end: number): AiFieldTarget {
  if (start === end) {
    return target;
  }
  return {
    kind: "selection",
    path: target.path,
    label: target.label,
    value: target.value.slice(start, end),
    start,
    end
  };
}
