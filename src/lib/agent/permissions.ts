import type { CharacterCardV3 } from "../schema";
import { deriveLorebookEntryComment } from "../lorebookCompat";
import { stableHash } from "./projection";

export type AgentSection = "basic" | "prompts" | "greetings";
export type AgentCapability = "read" | "edit" | "inject";
export interface AgentLorebookEntryScope {
  index: number;
  label: string;
  fingerprint: string;
  fields?: string[];
}

export interface AgentFieldTargetScope {
  path: CardFieldPath | `/alternateGreetings/${number}`;
  label: string;
}

export type AgentScope =
  | { kind: "card" }
  | { kind: "section"; section: AgentSection }
  | { kind: "field"; path: CardFieldPath | `/alternateGreetings/${number}`; label: string }
  | { kind: "lorebook" }
  | ({ kind: "lorebookEntry" } & AgentLorebookEntryScope)
  | { kind: "lorebookEntries"; entries: AgentLorebookEntryScope[] }
  | { kind: "targets"; fields: AgentFieldTargetScope[]; entries: AgentLorebookEntryScope[] };

export interface AgentPermission {
  scope: AgentScope;
  capabilities: AgentCapability[];
}

export type AgentScopePreset = "card" | AgentSection | "worldbook";
export type AgentMentionSurface = AgentScopePreset | "none";

export function getAllowedAgentScopePresets(surface: AgentMentionSurface): AgentScopePreset[] {
  return surface === "card" || surface === "none" ? ["card", "basic", "prompts", "greetings", "worldbook"] : [surface];
}

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
const MENTION_PATTERN = /@(?:"((?:\\.|[^"\\])*)"|([^\s@，。！？、；：,.!?;:#]+))(?:#(\d+))?/gu;

export function permissionForPreset(preset: AgentScopePreset): AgentPermission {
  if (preset === "card") return { scope: { kind: "card" }, capabilities: ["read", "edit", "inject"] };
  if (preset === "worldbook") return { scope: { kind: "lorebook" }, capabilities: ["read", "edit", "inject"] };
  return { scope: { kind: "section", section: preset }, capabilities: ["read", "edit"] };
}

export function permissionForField(path: CardFieldPath | `/alternateGreetings/${number}`, label: string): AgentPermission {
  return { scope: { kind: "field", path, label }, capabilities: ["read", "edit"] };
}

export function permissionForLorebookEntry(card: CharacterCardV3, index: number, fields?: string[]): AgentPermission {
  return {
    scope: { kind: "lorebookEntry", ...createLorebookEntryScope(card, index, fields) },
    capabilities: ["read", "edit"]
  };
}

function createLorebookEntryScope(card: CharacterCardV3, index: number, fields?: string[]): AgentLorebookEntryScope {
  const entry = card.data.character_book?.entries[index];
  if (!entry) throw new Error("世界书条目不存在，请刷新后重试。");
  if (fields?.some((field) => !LOREBOOK_ENTRY_FIELDS.includes(field as typeof LOREBOOK_ENTRY_FIELDS[number]))) {
    throw new Error("世界书条目字段不受 Agent 支持。");
  }
  return { index, label: deriveLorebookEntryComment(entry, index), fingerprint: stableHash(entry), fields };
}

export function permissionForLorebookEntries(card: CharacterCardV3, indexes: readonly number[]): AgentPermission {
  const uniqueIndexes = [...new Set(indexes)];
  if (uniqueIndexes.length === 0) throw new Error("至少选择一个世界书条目。");
  return {
    scope: {
      kind: "lorebookEntries",
      entries: uniqueIndexes.map((index) => createLorebookEntryScope(card, index))
    },
    capabilities: ["read", "edit"]
  };
}

export function permissionForTargets(
  fields: readonly AgentFieldTargetScope[],
  entries: readonly AgentLorebookEntryScope[]
): AgentPermission {
  const uniqueFields = fields.filter((field, index, all) => all.findIndex((item) => item.path === field.path) === index);
  const uniqueEntries = entries.filter((entry, index, all) => all.findIndex((item) => item.index === entry.index) === index);
  if (uniqueFields.length === 0 && uniqueEntries.length === 0) throw new Error("至少选择一个可提及对象。");
  return {
    scope: { kind: "targets", fields: [...uniqueFields], entries: [...uniqueEntries] },
    capabilities: ["read", "edit"]
  };
}

export function resolveAgentRequest(
  message: string,
  card: CharacterCardV3,
  fallback: AgentScopePreset,
  surface: AgentMentionSurface = "card"
): { instruction: string; permission: AgentPermission } {
  const matches = [...message.matchAll(MENTION_PATTERN)];
  if (matches.length === 0) return { instruction: message.trim(), permission: permissionForPreset(constrainFallbackScope(fallback, surface)) };
  const permissions = matches.map((match) => resolveMentionPermission(match, card, surface));
  if (permissions.length === 1) return { instruction: message.replace(MENTION_PATTERN, "").trim(), permission: permissions[0] };
  const lorebookPermissions = permissions.filter(isLorebookEntryPermission);
  if (lorebookPermissions.length === permissions.length) {
    return {
      instruction: message.replace(MENTION_PATTERN, "").trim(),
      permission: permissionForLorebookEntries(card, lorebookPermissions.map((permission) => permission.scope.index))
    };
  }

  const targets = permissions.map(getExactTarget);
  if (targets.every(Boolean)) {
    return {
      instruction: message.replace(MENTION_PATTERN, "").trim(),
      permission: permissionForTargets(
        targets.flatMap((target) => target?.field ? [target.field] : []),
        targets.flatMap((target) => target?.entry ? [target.entry] : [])
      )
    };
  }

  throw new Error("同时使用多个 @ 时，只能选择具体的卡片字段、开场白或世界书条目。");
}

function constrainFallbackScope(fallback: AgentScopePreset, surface: AgentMentionSurface): AgentScopePreset {
  return surface === "basic" || surface === "prompts" || surface === "greetings" || surface === "worldbook" ? surface : fallback;
}

function getExactTarget(permission: AgentPermission): { field?: AgentFieldTargetScope; entry?: AgentLorebookEntryScope } | undefined {
  if (permission.scope.kind === "field") return { field: { path: permission.scope.path, label: permission.scope.label } };
  if (permission.scope.kind === "lorebookEntry") {
    const { index, label, fingerprint, fields } = permission.scope;
    return { entry: { index, label, fingerprint, fields } };
  }
  if (permission.scope.kind === "targets") {
    if (permission.scope.fields.length + permission.scope.entries.length !== 1) return undefined;
    return permission.scope.fields.length === 1
      ? { field: { ...permission.scope.fields[0] } }
      : { entry: { ...permission.scope.entries[0] } };
  }
  return undefined;
}

function isLorebookEntryPermission(permission: AgentPermission): permission is AgentPermission & { scope: AgentScope & { kind: "lorebookEntry" } } {
  return permission.scope.kind === "lorebookEntry";
}

function resolveMentionPermission(match: RegExpMatchArray, card: CharacterCardV3, surface: AgentMentionSurface): AgentPermission {
  const mention = unescapeMention(match[1] ?? match[2] ?? "").trim();
  const normalized = normalizeMention(mention);
  const selectedIndex = match[3] === undefined ? undefined : Number(match[3]) - 1;
  const entries = card.data.character_book?.entries ?? [];

  const greetingTarget = resolveGreetingMention(mention, card);
  if (greetingTarget) {
    assertMentionAllowed(greetingTarget, surface);
    return greetingTarget;
  }

  const fieldTarget = resolveCardFieldMention(mention);
  if (fieldTarget) {
    assertMentionAllowed(fieldTarget, surface);
    return fieldTarget;
  }

  if (selectedIndex !== undefined) {
    const entry = entries[selectedIndex];
    const entryTitle = entry ? normalizeMention(deriveLorebookEntryComment(entry, selectedIndex)) : "";
    const entryId = String(entry?.id ?? "").toLowerCase();
    if (!entry || (entryTitle !== normalized && entryId !== mention.toLowerCase())) {
      throw new Error(`无法识别 @${mention}#${selectedIndex + 1}，世界书条目可能已变化，请重新选择。`);
    }
    const permission = permissionForLorebookEntry(card, selectedIndex);
    assertMentionAllowed(permission, surface);
    return permission;
  }

  const preset = MENTION_ALIASES[normalized];
  if (preset) {
    const permission = permissionForPreset(preset);
    assertMentionAllowed(permission, surface);
    return permission;
  }
  const indexes = entries.flatMap((entry, entryIndex) => {
    const title = normalizeMention(deriveLorebookEntryComment(entry, entryIndex));
    return title === normalized || String(entry.id ?? "").toLowerCase() === mention.toLowerCase() ? [entryIndex] : [];
  });
  if (indexes.length === 1) {
    const permission = permissionForLorebookEntry(card, indexes[0]);
    assertMentionAllowed(permission, surface);
    return permission;
  }
  if (indexes.length > 1) throw new Error(`@${mention} 对应多个世界书条目，请使用唯一标题或条目 ID。`);
  throw new Error(`无法识别 @${mention}。请选择可见范围，或使用世界书条目的完整标题。`);
}

function assertMentionAllowed(permission: AgentPermission, surface: AgentMentionSurface): void {
  if (surface === "card") return;
  if (surface === "none") throw new Error("当前页面不提供可 @ 的 Agent 目标。");
  const scope = permission.scope;
  if (surface === "worldbook" && scope.kind === "lorebookEntry") return;
  if (surface === "greetings" && isGreetingPermission(permission)) return;
  if (surface === "basic" && isSectionPermission(scope, "basic")) return;
  if (surface === "prompts" && isSectionPermission(scope, "prompts")) return;
  throw new Error(`当前页面只能 @ ${surface === "worldbook" ? "世界书条目" : surface === "greetings" ? "开场白选项" : surface === "basic" ? "基础信息字段" : "提示词字段"}。`);
}

function isSectionPermission(scope: AgentScope, section: AgentSection): boolean {
  if (scope.kind === "section") return scope.section === section;
  return scope.kind === "field" && SECTION_PATHS[section].includes(
    scope.path.startsWith("/alternateGreetings/") ? "/alternateGreetings" : scope.path as CardFieldPath
  );
}

function isGreetingPermission(permission: AgentPermission): boolean {
  if (permission.scope.kind !== "field") return permission.scope.kind === "section" && permission.scope.section === "greetings";
  return isGreetingPath(permission.scope.path);
}

function isGreetingPath(path: string): boolean {
  return path === "/firstMessage" || path === "/alternateGreetings" || path.startsWith("/alternateGreetings/");
}

function resolveGreetingMention(mention: string, card: CharacterCardV3): AgentPermission | undefined {
  const normalized = normalizeMention(mention);
  if (normalized === "开场白/首条") return permissionForField("/firstMessage", "首条开场白");
  const alternateMatch = normalized.match(/^开场白\/备用(\d+)$/u);
  if (!alternateMatch) return undefined;
  const index = Number(alternateMatch[1]) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= card.data.alternate_greetings.length) {
    throw new Error(`无法识别 @${mention}，开场白选项可能已变化，请重新选择。`);
  }
  return permissionForField(`/alternateGreetings/${index}`, `备用开场白 #${index + 1}`);
}

function resolveCardFieldMention(mention: string): AgentPermission | undefined {
  const normalized = normalizeMention(mention);
  const fieldName = normalized.match(/^字段\/(.+)$/u)?.[1];
  if (!fieldName) return undefined;
  const path = CARD_FIELD_MENTION_PATHS[fieldName];
  if (!path) return undefined;
  return permissionForField(path, CARD_FIELD_MENTION_LABELS[path]);
}

const CARD_FIELD_MENTION_PATHS: Record<string, CardFieldPath> = {
  name: "/name",
  description: "/description",
  personality: "/personality",
  scenario: "/scenario",
  exampledialogue: "/exampleDialogue",
  creatornotes: "/creatorNotes",
  systemprompt: "/systemPrompt",
  posthistoryinstructions: "/postHistoryInstructions",
  tags: "/tags",
  creator: "/creator",
  characterversion: "/characterVersion"
};

const CARD_FIELD_MENTION_LABELS: Record<CardFieldPath, string> = {
  "/name": "名称",
  "/description": "描述",
  "/personality": "性格",
  "/scenario": "场景",
  "/firstMessage": "首条开场白",
  "/alternateGreetings": "备用开场白",
  "/exampleDialogue": "示例对话",
  "/creatorNotes": "创作者备注",
  "/systemPrompt": "系统提示词",
  "/postHistoryInstructions": "历史消息指令",
  "/tags": "标签",
  "/creator": "创作者",
  "/characterVersion": "角色版本"
};

function unescapeMention(value: string): string {
  return value.replace(/\\(["\\])/gu, "$1");
}

function normalizeMention(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/gu, "");
}

export function canReadLorebook(permission: AgentPermission): boolean {
  return hasCapability(permission, "read") && ["card", "lorebook", "lorebookEntry", "lorebookEntries", "targets"].includes(permission.scope.kind);
}

export function canEditCardField(permission: AgentPermission, path: CardFieldPath): boolean {
  if (!hasCapability(permission, "edit")) return false;
  if (permission.scope.kind === "card") return true;
  if (permission.scope.kind === "field") return permission.scope.path === path;
  if (permission.scope.kind === "targets") return permission.scope.fields.some((field) => field.path === path);
  return permission.scope.kind === "section" && SECTION_PATHS[permission.scope.section].includes(path);
}

export function canEditCardPath(permission: AgentPermission, path: CardFieldPath | `/alternateGreetings/${number}`): boolean {
  if (!hasCapability(permission, "edit")) return false;
  if (permission.scope.kind === "field") return permission.scope.path === path;
  if (permission.scope.kind === "targets") return permission.scope.fields.some((field) => field.path === path);
  const root = path.startsWith("/alternateGreetings/") ? "/alternateGreetings" : path;
  return canEditCardField(permission, root as CardFieldPath);
}

export function canEditLorebookEntry(permission: AgentPermission, index: number, fingerprint: string): boolean {
  if (!hasCapability(permission, "edit")) return false;
  if (permission.scope.kind === "card" || permission.scope.kind === "lorebook") return true;
  const entries = permission.scope.kind === "lorebookEntry"
    ? [permission.scope]
    : permission.scope.kind === "lorebookEntries" ? permission.scope.entries
      : permission.scope.kind === "targets" ? permission.scope.entries : [];
  return entries.some((entry) => entry.index === index && entry.fingerprint === fingerprint);
}

export function canEditLorebookEntryFields(permission: AgentPermission, index: number, fingerprint: string, fields: string[]): boolean {
  if (!canEditLorebookEntry(permission, index, fingerprint)) return false;
  const allowedFields = permission.scope.kind === "lorebookEntry"
    ? permission.scope.fields
    : permission.scope.kind === "lorebookEntries" ? permission.scope.entries.find((entry) => entry.index === index)?.fields
      : permission.scope.kind === "targets" ? permission.scope.entries.find((entry) => entry.index === index)?.fields : undefined;
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
  if (scope.kind === "lorebookEntries") return `世界书条目：${scope.entries.map((entry) => entry.label).join("、")}`;
  if (scope.kind === "targets") {
    const labels = [...scope.fields.map((field) => field.label), ...scope.entries.map((entry) => `世界书：${entry.label}`)];
    return `指定对象：${labels.join("、")}`;
  }
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

export function resolveReplacementAgentRequest(value: string, preset: AgentScopePreset, replacementInstruction?: string): { instruction: string; permission: AgentPermission } {
  const previousRequest = decodeAgentRequest(value);
  if (!previousRequest.permission) throw new Error("该消息没有有效的 Agent 权限范围，不能重新生成或重发。");
  return {
    instruction: replacementInstruction ?? previousRequest.instruction,
    permission: permissionForPreset(preset)
  };
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
  if (raw.kind === "lorebookEntries" && Array.isArray(raw.entries)) {
    const entries = raw.entries.map(normalizeLorebookEntryScope);
    if (entries.some((entry) => !entry) || entries.length === 0) return undefined;
    return { scope: { kind: "lorebookEntries", entries: entries as AgentLorebookEntryScope[] }, capabilities: ["read", "edit"] };
  }
  if (raw.kind === "targets" && Array.isArray(raw.fields) && Array.isArray(raw.entries)) {
    const fields = raw.fields.map(normalizeFieldTargetScope);
    const entries = raw.entries.map(normalizeLorebookEntryScope);
    if (fields.some((field) => !field) || entries.some((entry) => !entry) || fields.length + entries.length === 0) return undefined;
    return {
      scope: {
        kind: "targets",
        fields: fields as AgentFieldTargetScope[],
        entries: entries as AgentLorebookEntryScope[]
      },
      capabilities: ["read", "edit"]
    };
  }
  if (raw.kind !== "lorebookEntry") return undefined;
  const entry = normalizeLorebookEntryScope(raw);
  if (!entry) return undefined;
  return { scope: { kind: "lorebookEntry", ...entry }, capabilities: ["read", "edit"] };
}

function normalizeLorebookEntryScope(value: unknown): AgentLorebookEntryScope | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  if (!Number.isInteger(raw.index) || typeof raw.label !== "string" || typeof raw.fingerprint !== "string") return undefined;
  const fields = raw.fields === undefined ? undefined : Array.isArray(raw.fields) && raw.fields.every((field) => typeof field === "string") ? raw.fields as string[] : null;
  if (fields === null || fields?.some((field) => !LOREBOOK_ENTRY_FIELDS.includes(field as typeof LOREBOOK_ENTRY_FIELDS[number]))) return undefined;
  return { index: raw.index as number, label: raw.label, fingerprint: raw.fingerprint, fields };
}

function normalizeFieldTargetScope(value: unknown): AgentFieldTargetScope | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.path !== "string" || typeof raw.label !== "string") return undefined;
  const root = raw.path.startsWith("/alternateGreetings/") ? "/alternateGreetings" : raw.path;
  if (!CARD_FIELD_PATHS.includes(root as CardFieldPath)) return undefined;
  if (root === "/alternateGreetings" && raw.path !== root && !/^\/alternateGreetings\/\d+$/u.test(raw.path)) return undefined;
  return { path: raw.path as CardFieldPath | `/alternateGreetings/${number}`, label: raw.label };
}
