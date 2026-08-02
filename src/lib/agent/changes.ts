import type { CharacterCardV3, Lorebook, LorebookEntry } from "../schema";
import { createBlankLorebook } from "../schema";
import { normalizeLorebookEntryComment, sillyTavernPromptRoles, sillyTavernWorldInfoPositions } from "../lorebookCompat";
import { canEditCardPath, canEditLorebookEntryFields, canInjectLorebook, type AgentPermission, type CardFieldPath } from "./permissions";
import { projectCard, stableHash } from "./projection";

export type CardFieldValue = string | string[];

export interface CardFieldEdit {
  path: CardFieldPath | `/alternateGreetings/${number}`;
  value: CardFieldValue;
}

export type LorebookTriggerStrategy = "keyword" | "constant" | "vectorized";

export interface LorebookEntryFields {
  comment?: string;
  keys?: string[];
  secondaryKeys?: string[];
  content?: string;
  enabled?: boolean;
  useRegex?: boolean;
  selective?: boolean;
  triggerStrategy?: LorebookTriggerStrategy;
  insertionPosition?: number;
  role?: number;
  depth?: number;
  insertionOrder?: number;
  probability?: number;
  priority?: number;
  caseSensitive?: boolean;
  outletName?: string;
}

export interface LorebookEntryEdit {
  index: number;
  fingerprint: string;
  fields: LorebookEntryFields;
}

export interface LorebookCandidate extends LorebookEntryFields {
  candidateId: string;
  comment: string;
  content: string;
}

export type AgentChange =
  | { kind: "cardEdit"; edits: CardFieldEdit[] }
  | { kind: "lorebookEntryEdit"; edit: LorebookEntryEdit }
  | { kind: "lorebookInjection"; candidates: LorebookCandidate[] };

export interface AgentDiff {
  path: string;
  label: string;
  before: string;
  after: string;
}

const ARRAY_PATHS = new Set<CardFieldPath>(["/alternateGreetings", "/tags"]);
const RAW_FIELD_BY_PATH: Record<CardFieldPath, keyof CharacterCardV3["data"]> = {
  "/name": "name",
  "/description": "description",
  "/personality": "personality",
  "/scenario": "scenario",
  "/firstMessage": "first_mes",
  "/alternateGreetings": "alternate_greetings",
  "/exampleDialogue": "mes_example",
  "/creatorNotes": "creator_notes",
  "/systemPrompt": "system_prompt",
  "/postHistoryInstructions": "post_history_instructions",
  "/tags": "tags",
  "/creator": "creator",
  "/characterVersion": "character_version"
};

export function applyAgentChanges(
  card: CharacterCardV3,
  changes: AgentChange[],
  permission: AgentPermission,
  selectedCandidateIds?: readonly string[]
): CharacterCardV3 {
  let next = clone(card);
  for (const change of changes) {
    if (change.kind === "cardEdit") next = applyCardEdits(next, change.edits, permission);
    if (change.kind === "lorebookEntryEdit") next = applyLorebookEntryEdit(next, change.edit, permission);
    if (change.kind === "lorebookInjection") next = injectLorebookCandidates(next, change.candidates, permission, selectedCandidateIds);
  }
  return next;
}

export function assertAgentChangesAllowed(card: CharacterCardV3, changes: AgentChange[], permission: AgentPermission): void {
  applyAgentChanges(card, changes, permission);
}

export function buildAgentDiff(before: CharacterCardV3, after: CharacterCardV3): AgentDiff[] {
  const beforeProjection = projectCard(before, 0);
  const afterProjection = projectCard(after, 0);
  const diffs: AgentDiff[] = [];
  for (const [path, rawField] of Object.entries(RAW_FIELD_BY_PATH) as Array<[CardFieldPath, keyof CharacterCardV3["data"]]>) {
    const beforeValue = before.data[rawField];
    const afterValue = after.data[rawField];
    if (stableHash(beforeValue) !== stableHash(afterValue)) {
      diffs.push({ path, label: path.slice(1), before: formatDiffValue(beforeValue), after: formatDiffValue(afterValue) });
    }
  }
  if (stableHash(beforeProjection.lorebook) !== stableHash(afterProjection.lorebook)) {
    diffs.push({
      path: "/worldBook",
      label: "World Book",
      before: `${beforeProjection.lorebook.entries.length} 个条目`,
      after: `${afterProjection.lorebook.entries.length} 个条目`
    });
  }
  return diffs;
}

export function estimateCandidateTokens(candidate: LorebookCandidate): number {
  return Math.max(1, Math.ceil([candidate.comment, ...(candidate.keys ?? []), candidate.content].join("\n").length / 4));
}

export function validateCandidate(candidate: LorebookCandidate): string[] {
  const errors: string[] = [];
  if (!normalizeLorebookEntryComment(candidate.comment)) errors.push("条目标题不能为空。");
  if (!candidate.content.trim()) errors.push("条目内容不能为空。");
  if (candidate.insertionPosition !== undefined && (!Number.isInteger(candidate.insertionPosition) || candidate.insertionPosition < 0 || candidate.insertionPosition > 7)) errors.push("注入位置必须为 0–7。");
  if (candidate.role !== undefined && ![0, 1, 2].includes(candidate.role)) errors.push("深度注入角色必须为 0、1 或 2。");
  if (candidate.probability !== undefined && (candidate.probability < 0 || candidate.probability > 100)) errors.push("概率必须为 0–100。");
  return errors;
}

function applyCardEdits(card: CharacterCardV3, edits: CardFieldEdit[], permission: AgentPermission): CharacterCardV3 {
  if (edits.length === 0) throw new Error("卡片编辑至少需要一个字段。");
  const data = { ...card.data };
  for (const edit of edits) {
    if (!canEditCardPath(permission, edit.path)) throw new Error(`字段超出当前权限范围：${edit.path}`);
    if (edit.path.startsWith("/alternateGreetings/")) {
      if (typeof edit.value !== "string") throw new Error(`字段类型不正确：${edit.path}`);
      const index = Number(edit.path.split("/")[2]);
      if (!Number.isInteger(index) || index < 0 || index >= data.alternate_greetings.length) throw new Error("开场白序号不存在。");
      data.alternate_greetings = data.alternate_greetings.map((value, itemIndex) => itemIndex === index ? edit.value as string : value);
      continue;
    }
    const rootPath = edit.path as CardFieldPath;
    const expectsArray = ARRAY_PATHS.has(rootPath);
    if (expectsArray !== Array.isArray(edit.value)) throw new Error(`字段类型不正确：${edit.path}`);
    (data as Record<string, unknown>)[RAW_FIELD_BY_PATH[rootPath]] = clone(edit.value);
  }
  return { ...card, data };
}

function applyLorebookEntryEdit(card: CharacterCardV3, edit: LorebookEntryEdit, permission: AgentPermission): CharacterCardV3 {
  const book = card.data.character_book;
  const entry = book?.entries[edit.index];
  if (!book || !entry) throw new Error("目标世界书条目不存在。");
  const currentFingerprint = stableHash(entry);
  if (currentFingerprint !== edit.fingerprint) throw new Error("目标世界书条目已发生变化，请重新读取。");
  if (!canEditLorebookEntryFields(permission, edit.index, edit.fingerprint, Object.keys(edit.fields))) throw new Error("世界书条目字段超出当前权限范围。");
  if (Object.keys(edit.fields).length === 0) throw new Error("世界书条目编辑至少需要一个字段。");
  const nextEntry = applyLorebookFields(entry, edit.fields, edit.index);
  const entries = book.entries.map((item, index) => index === edit.index ? nextEntry : item);
  return { ...card, data: { ...card.data, character_book: { ...book, entries } } };
}

function injectLorebookCandidates(
  card: CharacterCardV3,
  candidates: LorebookCandidate[],
  permission: AgentPermission,
  selectedCandidateIds?: readonly string[]
): CharacterCardV3 {
  if (!canInjectLorebook(permission)) throw new Error("当前权限不允许注入世界书条目。");
  const selected = selectedCandidateIds ? new Set(selectedCandidateIds) : undefined;
  const uniqueIds = new Set(candidates.map((candidate) => candidate.candidateId));
  if (uniqueIds.size !== candidates.length) throw new Error("候选条目标识重复。");
  if (selected && [...selected].some((id) => !uniqueIds.has(id))) throw new Error("候选选择包含未知条目。");
  const chosen = selected ? candidates.filter((candidate) => selected.has(candidate.candidateId)) : candidates;
  if (chosen.length === 0) throw new Error("请至少选择一个候选条目。");
  const errors = chosen.flatMap((candidate) => validateCandidate(candidate).map((error) => `${candidate.comment || candidate.candidateId}：${error}`));
  if (errors.length > 0) throw new Error(errors.join(" "));
  const book: Lorebook = clone(card.data.character_book ?? createBlankLorebook());
  let nextOrder = book.entries.reduce((largest, entry) => Math.max(largest, entry.insertion_order), -1) + 1;
  for (const candidate of chosen) {
    const entry = candidateToEntry(candidate, nextOrder, book.entries.length);
    nextOrder = Math.max(nextOrder + 1, entry.insertion_order + 1);
    book.entries.push(entry);
  }
  return { ...card, data: { ...card.data, character_book: book } };
}

function candidateToEntry(candidate: LorebookCandidate, fallbackOrder: number, index: number): LorebookEntry {
  const base: LorebookEntry = {
    keys: normalizeStrings(candidate.keys),
    secondary_keys: normalizeStrings(candidate.secondaryKeys),
    content: candidate.content,
    extensions: {},
    enabled: candidate.enabled ?? true,
    insertion_order: integerOr(candidate.insertionOrder, fallbackOrder),
    comment: normalizeLorebookEntryComment(candidate.comment) || `Entry ${index + 1}`,
    use_regex: candidate.useRegex ?? false,
    selective: candidate.selective ?? false
  };
  return applyLorebookFields(base, candidate, index);
}

function applyLorebookFields(entry: LorebookEntry, fields: LorebookEntryFields, index: number): LorebookEntry {
  const next: LorebookEntry = { ...entry, extensions: { ...(entry.extensions ?? {}) } };
  if (fields.comment !== undefined) {
    const comment = normalizeLorebookEntryComment(fields.comment);
    if (!comment) throw new Error("世界书条目标题不能为空。");
    next.comment = comment;
  }
  if (fields.content !== undefined) next.content = fields.content;
  if (fields.keys !== undefined) next.keys = normalizeStrings(fields.keys);
  if (fields.secondaryKeys !== undefined) next.secondary_keys = normalizeStrings(fields.secondaryKeys);
  if (fields.enabled !== undefined) next.enabled = fields.enabled;
  if (fields.useRegex !== undefined) next.use_regex = fields.useRegex;
  if (fields.selective !== undefined) next.selective = fields.selective;
  if (fields.insertionOrder !== undefined) next.insertion_order = integerOr(fields.insertionOrder, index);
  if (fields.priority !== undefined) next.priority = integerOr(fields.priority, 0);
  if (fields.caseSensitive !== undefined) next.case_sensitive = fields.caseSensitive;
  if (fields.triggerStrategy !== undefined) {
    next.constant = fields.triggerStrategy === "constant";
    next.extensions.vectorized = fields.triggerStrategy === "vectorized";
  }
  if (fields.insertionPosition !== undefined) {
    const position = integerBetween(fields.insertionPosition, 0, 7, "注入位置");
    next.extensions.position = position;
    next.position = position === sillyTavernWorldInfoPositions.before
      ? "before_char"
      : position === sillyTavernWorldInfoPositions.after ? "after_char" : undefined;
    if (position !== sillyTavernWorldInfoPositions.atDepth) delete next.extensions.role;
  }
  if (fields.role !== undefined) next.extensions.role = integerBetween(fields.role, 0, 2, "注入角色");
  if (next.extensions.position === sillyTavernWorldInfoPositions.atDepth && next.extensions.role === undefined) next.extensions.role = sillyTavernPromptRoles.system;
  if (fields.depth !== undefined) next.extensions.depth = integerBetween(fields.depth, 0, 10_000, "注入深度");
  if (fields.probability !== undefined) next.extensions.probability = integerBetween(fields.probability, 0, 100, "注入概率");
  if (fields.outletName !== undefined) {
    if (fields.outletName.trim()) next.extensions.outlet_name = fields.outletName.trim();
    else delete next.extensions.outlet_name;
  }
  delete next.name;
  return next;
}

function normalizeStrings(value: string[] | undefined): string[] {
  return (value ?? []).map((item) => item.trim()).filter(Boolean);
}

function integerOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function integerBetween(value: number, minimum: number, maximum: number, label: string): number {
  const integer = Math.trunc(value);
  if (!Number.isFinite(value) || integer < minimum || integer > maximum) throw new Error(`${label}超出允许范围。`);
  return integer;
}

function formatDiffValue(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 700 ? `${text.slice(0, 700)}…` : text;
}

function clone<T>(value: T): T {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
}
