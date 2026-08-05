import { deriveLorebookEntryComment } from "../../lib/lorebookCompat";
import type { CharacterCardV3 } from "../../lib/schema";
import { CARD_FIELD_PATHS, type AgentMentionSurface, type AgentScopePreset, type CardFieldPath } from "../../lib/agent/permissions";

export interface LorebookMentionRange {
  start: number;
  end: number;
  query: string;
}

interface AgentMentionOptionBase {
  optionId: string;
  title: string;
  description: string;
  searchText?: string;
  token: string;
  preset: AgentScopePreset;
}

export interface LorebookMentionOption extends AgentMentionOptionBase {
  kind: "lorebookEntry";
  entryIndex: number;
  insertionOrder: number;
  keyCount: number;
  id?: string | number;
}

export interface FieldMentionOption extends AgentMentionOptionBase {
  kind: "field";
  path: CardFieldPath | `/alternateGreetings/${number}`;
}

export interface ScopeMentionOption extends AgentMentionOptionBase {
  kind: "scope";
}

export type AgentMentionOption = LorebookMentionOption | FieldMentionOption | ScopeMentionOption;

const SCOPE_LABELS: Record<AgentScopePreset, string> = {
  card: "整张卡片",
  basic: "基础信息",
  prompts: "提示词",
  greetings: "开场白",
  worldbook: "世界书"
};

const SCOPE_DESCRIPTIONS: Record<AgentScopePreset, string> = {
  card: "卡片字段、开场白和世界书",
  basic: "名称、创作者信息、标签等基础字段",
  prompts: "描述、性格、场景和提示词字段",
  greetings: "首条和备用开场白",
  worldbook: "当前卡片内的世界书"
};

const FIELD_LABELS: Record<CardFieldPath, string> = {
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

export function findLorebookMentionRange(value: string, cursor: number): LorebookMentionRange | undefined {
  const prefix = value.slice(0, cursor);
  const match = prefix.match(/(?:^|[\s，。！？、；：,.!?;:])@([^@"\n，。！？、；：,.!?;:]{0,100})$/u);
  if (!match) return undefined;

  const start = prefix.lastIndexOf("@");
  return { start, end: cursor, query: prefix.slice(start + 1).trim() };
}

export function getAgentMentionOptions(card: CharacterCardV3, surface: AgentMentionSurface, query: string): AgentMentionOption[] {
  if (surface === "none") return [];

  const options = [
    ...getScopeMentionOptions(surface),
    ...getFieldMentionOptions(surface),
    ...(surface === "card" || surface === "greetings" ? getGreetingMentionOptions(card) : []),
    ...(surface === "card" || surface === "worldbook" ? getLorebookMentionOptionsForSurface(card) : [])
  ];
  const normalizedQuery = normalizeSearchText(query);

  return options
    .map((option, optionIndex) => {
      const normalizedTitle = normalizeSearchText(option.title);
      const searchable = normalizeSearchText([option.title, option.description, option.searchText, option.token].join(" "));
      const score = normalizedTitle.startsWith(normalizedQuery) ? 0 : searchable.includes(normalizedQuery) ? 1 : 2;
      return { option, optionIndex, score };
    })
    .filter(({ score }) => !normalizedQuery || score < 2)
    .sort((left, right) => left.score - right.score || left.optionIndex - right.optionIndex)
    .map(({ option }) => option);
}

export function getLorebookMentionOptions(card: CharacterCardV3, query: string): LorebookMentionOption[] {
  return getAgentMentionOptions(card, "worldbook", query).filter(isLorebookMentionOption);
}

export function insertAgentMention(
  value: string,
  range: LorebookMentionRange,
  option: AgentMentionOption
): { value: string; cursor: number } {
  const suffix = value.slice(range.end);
  const separator = /^\s/u.test(suffix) ? "" : " ";
  const nextValue = `${value.slice(0, range.start)}${option.token}${separator}${suffix}`;
  return { value: nextValue, cursor: range.start + option.token.length + separator.length };
}

export function insertLorebookMention(
  value: string,
  range: LorebookMentionRange,
  option: LorebookMentionOption
): { value: string; cursor: number } {
  return insertAgentMention(value, range, option);
}

function getScopeMentionOptions(surface: AgentScopePreset): ScopeMentionOption[] {
  if (surface !== "card") return [];
  const presets: AgentScopePreset[] = ["card", "basic", "prompts", "greetings", "worldbook"];
  return presets.map((preset) => ({
    optionId: `scope-${preset}`,
    kind: "scope",
    title: SCOPE_LABELS[preset],
    description: SCOPE_DESCRIPTIONS[preset],
    token: `@${SCOPE_LABELS[preset]}`,
    preset
  }));
}

function getFieldMentionOptions(surface: AgentScopePreset): FieldMentionOption[] {
  const paths = surface === "card"
    ? CARD_FIELD_PATHS.filter((path) => path !== "/firstMessage" && path !== "/alternateGreetings")
    : surface === "basic"
      ? ["/name", "/creatorNotes", "/tags", "/creator", "/characterVersion"] as const
      : surface === "prompts"
        ? ["/description", "/personality", "/scenario", "/exampleDialogue", "/systemPrompt", "/postHistoryInstructions"] as const
        : [];

  return paths.map((path) => ({
    optionId: `field-${path.slice(1)}`,
    kind: "field",
    title: FIELD_LABELS[path],
    description: `卡片字段 · ${path}`,
    token: `@字段/${path.slice(1)}`,
    preset: surface === "card" ? getFieldPreset(path) : surface,
    path
  }));
}

function getGreetingMentionOptions(card: CharacterCardV3): FieldMentionOption[] {
  const options: FieldMentionOption[] = [{
    optionId: "greeting-first",
    kind: "field",
    title: "首条开场白",
    description: summarizeGreeting(card.data.first_mes),
    token: "@开场白/首条",
    preset: "greetings",
    path: "/firstMessage"
  }];

  for (const [index, value] of card.data.alternate_greetings.entries()) {
    options.push({
      optionId: `greeting-alternate-${index}`,
      kind: "field",
      title: `备用开场白 #${index + 1}`,
      description: summarizeGreeting(value),
      token: `@开场白/备用${index + 1}`,
      preset: "greetings",
      path: `/alternateGreetings/${index}`
    });
  }

  return options;
}

function getLorebookMentionOptionsForSurface(card: CharacterCardV3): LorebookMentionOption[] {
  const entries = card.data.character_book?.entries ?? [];
  const titleCounts = new Map<string, number>();

  for (const [index, entry] of entries.entries()) {
    const title = normalizeSearchText(deriveLorebookEntryComment(entry, index));
    titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
  }

  return entries.map((entry, entryIndex) => {
    const title = deriveLorebookEntryComment(entry, entryIndex);
    const normalizedTitle = normalizeSearchText(title);
    return {
      optionId: `lorebook-entry-${entryIndex}`,
      kind: "lorebookEntry",
      title,
      description: `第 ${entryIndex + 1} 条 · 插入顺序 #${entry.insertion_order} · ${entry.keys.length} 个关键词${formatEntryId(entry.id)}`,
      searchText: [entry.id, ...entry.keys].filter((value) => value !== undefined).join(" "),
      token: formatLorebookMention(title, titleCounts.get(normalizedTitle) === 1 ? undefined : entryIndex),
      preset: "worldbook",
      entryIndex,
      insertionOrder: entry.insertion_order,
      keyCount: entry.keys.length,
      id: entry.id
    };
  });
}

function getFieldPreset(path: CardFieldPath): AgentScopePreset {
  if (["/name", "/creatorNotes", "/tags", "/creator", "/characterVersion"].includes(path)) return "basic";
  if (["/firstMessage", "/alternateGreetings"].includes(path)) return "greetings";
  return "prompts";
}

function formatLorebookMention(title: string, duplicateIndex?: number): string {
  const escapedTitle = title.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"');
  return `@"${escapedTitle}"${duplicateIndex === undefined ? "" : `#${duplicateIndex + 1}`}`;
}

function formatEntryId(id: string | number | undefined): string {
  return id === undefined || id === "" ? "" : ` · ID ${id}`;
}

function summarizeGreeting(value: string): string {
  const compact = value.replace(/\s+/gu, " ").trim();
  if (!compact) return "当前内容为空";
  return compact.length > 80 ? `${compact.slice(0, 80)}…` : compact;
}

function normalizeSearchText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/gu, "");
}

function isLorebookMentionOption(option: AgentMentionOption): option is LorebookMentionOption {
  return option.kind === "lorebookEntry";
}
