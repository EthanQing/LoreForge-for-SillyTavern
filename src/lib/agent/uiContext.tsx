import { createContext, useContext } from "react";
import type { CharacterCardV3 } from "../schema";
import { permissionForField, permissionForLorebookEntry, type AgentFieldPath, type AgentPermission, type CardFieldPath } from "./permissions";

export type AgentFieldAction =
  | "polish_expand"
  | "rewrite"
  | "complete"
  | "shorten"
  | "translate"
  | "character_voice"
  | "conflict_check"
  | "extract_keywords"
  | "variants";

export interface AgentFieldTarget {
  path: AgentFieldPath;
  label: string;
  value: string;
}

export interface AgentStudioActions {
  ready: boolean;
  busy: boolean;
  runFieldAction: (target: AgentFieldTarget, action: AgentFieldAction) => Promise<void>;
  prepareLorebookRequest: () => void;
}

export const AgentStudioContext = createContext<AgentStudioActions | null>(null);

export function useAgentStudioActions(): AgentStudioActions | null {
  return useContext(AgentStudioContext);
}

export function buildFieldActionInstruction(target: AgentFieldTarget, action: AgentFieldAction): string {
  const actions: Record<AgentFieldAction, string> = {
    polish_expand: "润色并适度扩写",
    rewrite: "重写",
    complete: "补全",
    shorten: "压缩并保留关键信息",
    translate: "翻译；如果目标语言不明确，先询问用户",
    character_voice: "调整为符合角色设定的语气",
    conflict_check: "检查与卡片其他事实的冲突；发现问题时先说明，不要擅自改写事实",
    extract_keywords: "提取关键词并以适合该字段的形式整理",
    variants: "生成高质量变体并选择最适合当前卡片的一版作为提案"
  };
  const tool = target.path.startsWith("/worldBook/entries/") ? "世界书条目编辑工具" : "卡片字段编辑工具";
  return `对“${target.label}”执行：${actions[action]}。先读取当前授权字段，再通过${tool}创建待审核提案。`;
}

export function resolveFieldActionPermission(card: CharacterCardV3, target: AgentFieldTarget): AgentPermission {
  const lorebookMatch = target.path.match(/^\/worldBook\/entries\/(\d+)\/([^/]+)$/u);
  if (lorebookMatch) return permissionForLorebookEntry(card, Number(lorebookMatch[1]), [lorebookMatch[2]]);
  return permissionForField(target.path as CardFieldPath | `/alternateGreetings/${number}`, target.label);
}
