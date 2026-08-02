import type { CharacterCardV3 } from "../schema";
import { deriveLorebookEntryComment } from "../lorebookCompat";
import { stableHash } from "./projection";

export type AgentSection = "basic" | "prompts" | "greetings";
export type AgentCapability = "read" | "edit" | "inject";

export type AgentScope =
  | { kind: "card" }
  | { kind: "section"; section: AgentSection }
  | { kind: "field"; path: CardFieldPath | `/alternateGreetings/${number}`; label: string }
  | { kind: "lorebook" }
  | { kind: "lorebookEntry"; index: number; label: string; fingerprint: string; fields?: string[] };

export interface AgentPermission {
  scope: AgentScope;
  capabilities: AgentCapability[];
}

export type AgentScopePreset = "card" | AgentSection | "worldbook";

export type CardFieldPath =
  | "/name"
  | "/description"
  | "/personality"
  | "/scenario"
  | "/firstMessage"
  | "/alternateGreetings"
  | "/exampleDialogue"
  | "/creatorNotes"
  | "/systemPrompt"
  | "/postHistoryInstructions"
  | "/tags"
  | "/creator"
  | "/characterVersion";

export type AgentFieldPath = CardFieldPath | `/alternateGreetings/${number}` | `/worldBook/entries/${number}/${string}`;

export const CARD_FIELD_PATHS = [
  "/name", "/description", "/personality", "/scenario", "/firstMessage",
  "/alternateGreetings", "/exampleDialogue", "/creatorNotes", "/systemPrompt",
  "/postHistoryInstructions", "/tags", "/creator", "/characterVersion"
] as const satisfies readonly CardFieldPath[];

export const LOREBOOK_ENTRY_FIELDS = [
  "comment", "keys", "secondaryKeys", "content", "enabled", "useRegex", "selective",
  "triggerStrategy", "insertionPosition", "role", "depth", "insertionOrder",
  "probability", "priority", "caseSensitive", "outletName"
] as const;

const SECTION_PATHS: Record<AgentSection, readonly CardFieldPath[]> = {
  basic: ["/name", "/creatorNotes", "/tags", "/creator", "/characterVersion"],
  prompts: ["/description", "/personality", "/scenario", "/exampleDialogue", "/systemPrompt", "/postHistoryInstructions"],
  greetings: ["/firstMessage", "/alternateGreetings"]
};

const MENTION_ALIASES: Record<string, AgentScopePreset> = {
  card: "card", "卡片": "card", "整张卡": "card", "整张卡片": "card",
  basic: "basic", "基础": "basic", "基础信息": "basic",
  prompts: "prompts", prompt: "prompts", "提示": "prompts", "提示词": "prompts",
  greetings: "greetings", greeting: "greetings", "开场": "greetings", "开场白": "greetings", "问候": "greetings",
  worldbook: "worldbook", lorebook: "worldbook", "世界书": "worldbook", "条目": "worldbook"
};

const SCOPE_ENVELOPE = /^<agent_scope data="([^"]+)">\n([\s\S]*)\n<\/agent_scope>$/u;

export function permissionForPreset(preset: AgentScopePreset): AgentPermission {
  if (preset === "card") return { scope: { kind: "card" }, capabilities: ["read", "edit", "inject"] };
  if (preset === "worldbook") return { scope: { kind: "lorebook" }, capabilities: ["read", "edit", "inject"] };
  return { scope: { kind: "section", section: preset }, capabilities: ["read", "edit"] };
}

export function permissionForField(path: CardFieldPath | `/alternateGreetings/${number}`, label: string): AgentPermission {
  return { scope: { kind: "field", path, label }, capabilities: ["read", "edit"] };
}

export function permissionForLorebookEntry(card: CharacterCardV3, index: number, fields?: string[]): AgentPermission {
  const entry = card.data.character_book?.entries[index];
  if (!entry) throw new Error("世界书条目不存在，请刷新后重试。");
  if (fields?.some((field) => !LOREBOOK_ENTRY_FIELDS.includes(field as typeof LOREBOOK_ENTRY_FIELDS[number]))) {
    throw new Error("世界书条目字段不受 Agent 支持。");
  }
  return {
    scope: {
      kind: "lorebookEntry",
      index,
      label: deriveLorebookEntryComment(entry, index),
      fingerprint: stableHash(entry),
      fields
    },
    capabilities: ["read", "edit"]
  };
}

export function resolveAgentRequest(message: string, card: CharacterCardV3, fallback: AgentScopePreset): { instruction: string; permission: AgentPermission } {
  const match = message.match(/@([^\s@，。！？、；：,.!?;:]+)/u);
  if (!match) return { instruction: message.trim(), permission: permissionForPreset(fallback) };
  const mention = match[1].trim();
  const normalized = mention.toLowerCase().replace(/[\s_-]+/g, "");
  const preset = MENTION_ALIASES[normalized];
  if (preset) {
    return { instruction: message.replace(match[0], "").trim(), permission: permissionForPreset(preset) };
  }
  const entries = card.data.character_book?.entries ?? [];
  const indexes = entries.flatMap((entry, entryIndex) => {
    const title = deriveLorebookEntryComment(entry, entryIndex).toLowerCase().replace(/[\s_-]+/g, "");
    return title === normalized || String(entry.id ?? "").toLowerCase() === mention.toLowerCase() ? [entryIndex] : [];
  });
  if (indexes.length === 1) {
    return { instruction: message.replace(match[0], "").trim(), permission: permissionForLorebookEntry(card, indexes[0]) };
  }
  if (indexes.length > 1) throw new Error(`@${mention} 对应多个世界书条目，请使用唯一标题或条目 ID。`);
  throw new Error(`无法识别 @${mention}。请选择可见范围，或使用世界书条目的完整标题。`);
}

export function canReadLorebook(permission: AgentPermission): boolean {
  return hasCapability(permission, "read") && ["card", "lorebook", "lorebookEntry"].includes(permission.scope.kind);
}

export function canEditCardField(permission: AgentPermission, path: CardFieldPath): boolean {
  if (!hasCapability(permission, "edit")) return false;
  if (permission.scope.kind === "card") return true;
  if (permission.scope.kind === "field") return permission.scope.path === path;
  return permission.scope.kind === "section" && SECTION_PATHS[permission.scope.section].includes(path);
}

export function canEditCardPath(permission: AgentPermission, path: CardFieldPath | `/alternateGreetings/${number}`): boolean {
  if (!hasCapability(permission, "edit")) return false;
  if (permission.scope.kind === "field") return permission.scope.path === path;
  const root = path.startsWith("/alternateGreetings/") ? "/alternateGreetings" : path;
  return canEditCardField(permission, root as CardFieldPath);
}

export function canEditLorebookEntry(permission: AgentPermission, index: number, fingerprint: string): boolean {
  if (!hasCapability(permission, "edit")) return false;
  if (permission.scope.kind === "card" || permission.scope.kind === "lorebook") return true;
  return permission.scope.kind === "lorebookEntry" && permission.scope.index === index && permission.scope.fingerprint === fingerprint;
}

export function canEditLorebookEntryFields(permission: AgentPermission, index: number, fingerprint: string, fields: string[]): boolean {
  if (!canEditLorebookEntry(permission, index, fingerprint)) return false;
  const allowedFields = permission.scope.kind === "lorebookEntry" ? permission.scope.fields : undefined;
  return !allowedFields || fields.every((field) => allowedFields.includes(field));
}

export function canInjectLorebook(permission: AgentPermission): boolean {
  return hasCapability(permission, "inject") && (permission.scope.kind === "card" || permission.scope.kind === "lorebook");
}

export function describeAgentPermission(permission: AgentPermission): string {
  const { scope } = permission;
  if (scope.kind === "card") return "整张卡片";
  if (scope.kind === "section") return scope.section === "basic" ? "基础信息" : scope.section === "prompts" ? "提示词" : "开场白";
  if (scope.kind === "field") return scope.label;
  if (scope.kind === "lorebook") return "世界书";
  return `世界书条目：${scope.label}`;
}

export function encodeAgentRequest(permission: AgentPermission, instruction: string): string {
  const data = encodeURIComponent(JSON.stringify(permission));
  return `<agent_scope data="${data}">\n${instruction.trim()}\n</agent_scope>`;
}

export function decodeAgentRequest(value: string): { instruction: string; permission?: AgentPermission } {
  const match = value.match(SCOPE_ENVELOPE);
  if (!match) return { instruction: value };
  try {
    const permission = normalizeAgentPermission(JSON.parse(decodeURIComponent(match[1])));
    return permission ? { instruction: match[2], permission } : { instruction: match[2] };
  } catch {
    return { instruction: match[2] };
  }
}

export function samePermission(left: AgentPermission, right: AgentPermission): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasCapability(permission: AgentPermission, capability: AgentCapability): boolean {
  return permission.capabilities.includes(capability);
}

export function normalizeAgentPermission(value: unknown): AgentPermission | undefined {
  if (!value || typeof value !== "object") return undefined;
  const scope = (value as { scope?: unknown }).scope;
  if (!scope || typeof scope !== "object") return undefined;
  const raw = scope as Record<string, unknown>;
  if (raw.kind === "card") return permissionForPreset("card");
  if (raw.kind === "lorebook") return permissionForPreset("worldbook");
  if (raw.kind === "section" && (raw.section === "basic" || raw.section === "prompts" || raw.section === "greetings")) {
    return permissionForPreset(raw.section);
  }
  if (raw.kind === "field" && typeof raw.path === "string" && typeof raw.label === "string") {
    const root = raw.path.startsWith("/alternateGreetings/") ? "/alternateGreetings" : raw.path;
    if (!CARD_FIELD_PATHS.includes(root as CardFieldPath)) return undefined;
    if (root === "/alternateGreetings" && raw.path !== root && !/^\/alternateGreetings\/\d+$/u.test(raw.path)) return undefined;
    return permissionForField(raw.path as CardFieldPath | `/alternateGreetings/${number}`, raw.label);
  }
  if (raw.kind !== "lorebookEntry" || !Number.isInteger(raw.index) || typeof raw.label !== "string" || typeof raw.fingerprint !== "string") return undefined;
  const fields = raw.fields === undefined ? undefined : Array.isArray(raw.fields) && raw.fields.every((field) => typeof field === "string") ? raw.fields as string[] : null;
  if (fields === null || fields?.some((field) => !LOREBOOK_ENTRY_FIELDS.includes(field as typeof LOREBOOK_ENTRY_FIELDS[number]))) return undefined;
  return {
    scope: { kind: "lorebookEntry", index: raw.index as number, label: raw.label, fingerprint: raw.fingerprint, fields },
    capabilities: ["read", "edit"]
  };
}
