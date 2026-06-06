import type { CharacterCardV3, Lorebook, LorebookEntry, ValidationReport } from "./schema";
import {
  deriveLorebookEntryComment,
  fallbackLorebookEntryComment,
  normalizeLorebookEntryComment
} from "./lorebookCompat";
import { validateCard } from "./validation";

export type AiPatchOperation = "add" | "replace" | "remove";

export interface NormalizedAiCard {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  alternateGreetings: string[];
  exampleDialogue: string;
  creatorNotes: string;
  systemPrompt: string;
  postHistoryInstructions: string;
  tags: string[];
  creator: string;
  characterVersion: string;
  worldBook?: NormalizedWorldBook;
}

export interface NormalizedWorldBook {
  name?: string;
  description?: string;
  scanDepth?: number;
  tokenBudget?: number;
  recursiveScanning?: boolean;
  entries: NormalizedWorldBookEntry[];
}

export interface NormalizedWorldBookEntry {
  id: string;
  enabled: boolean;
  comment: string;
  keys: string[];
  secondaryKeys: string[];
  content: string;
  selective: boolean;
  constant: boolean;
  insertionPosition: "before_char" | "after_char";
  order: number;
  depth: number;
  probability: number;
  budget: number;
}

export interface AiPatch {
  op: AiPatchOperation;
  path: string;
  value?: unknown;
}

export type AiAgentEditTargetKind = "basic" | "prompts" | "greetings" | "worldBook" | "worldBookEntry";

export type AiFieldAction =
  | "polish_expand"
  | "rewrite"
  | "complete"
  | "shorten"
  | "translate"
  | "character_voice"
  | "conflict_check"
  | "extract_keywords"
  | "repair"
  | "variants";

export type AiWorkflowAction =
  | "diagnose"
  | "complete_draft"
  | "extract_source"
  | "consistency_repair"
  | "token_optimize"
  | "worldbook_build"
  | "import_cleanup";

export type AiFieldTarget =
  | { kind: "field"; path: string; label: string; value: string }
  | { kind: "selection"; path: string; label: string; value: string; start: number; end: number }
  | { kind: "section"; section: "basic" | "prompts" | "greetings" | "worldBook"; label: string }
  | { kind: "worldBookEntry"; entryIndex: number; entryId?: string; entryMemo?: string; label: string };

export interface AiAgentEditTarget {
  kind: AiAgentEditTargetKind;
  mention: string;
  label: string;
  editablePaths: string[];
  instruction: string;
  entryIndex?: number;
  entryId?: string;
  entryMemo?: string;
  fieldTarget?: AiFieldTarget;
}

export interface AiAgentResponse {
  message: string;
  summary: string[];
  patches: AiPatch[];
}

export interface AiAgentDiff {
  path: string;
  label: string;
  before: string;
  after: string;
}

export interface AiAgentPreview {
  response: AiAgentResponse;
  before: NormalizedAiCard;
  afterNormalized: NormalizedAiCard;
  after: CharacterCardV3;
  validationReport: ValidationReport;
  diffs: AiAgentDiff[];
  rejectedPatches?: string[];
}

const stringRoots = [
  "name",
  "description",
  "personality",
  "scenario",
  "firstMessage",
  "exampleDialogue",
  "creatorNotes",
  "systemPrompt",
  "postHistoryInstructions",
  "creator",
  "characterVersion"
] as const;

const arrayRoots = ["alternateGreetings", "tags"] as const;

const editablePaths = [
  ...stringRoots.map((field) => `/${field}`),
  ...arrayRoots.map((field) => `/${field}`),
  "/worldBook"
] as const;

const stringRootSet = new Set<string>(stringRoots);
const arrayRootSet = new Set<string>(arrayRoots);

const fieldLabels: Record<string, string> = {
  name: "Name",
  description: "Description",
  personality: "Personality",
  scenario: "Scenario",
  firstMessage: "First Message",
  alternateGreetings: "Alternate Greetings",
  exampleDialogue: "Example Dialogue",
  creatorNotes: "Creator Notes",
  systemPrompt: "System Prompt",
  postHistoryInstructions: "Post History Instructions",
  tags: "Tags",
  creator: "Creator",
  characterVersion: "Character Version",
  worldBook: "World Book"
};

export function getAiAgentEditablePaths(): string[] {
  return [...editablePaths];
}

export function parseAiAgentEditTarget(instruction: string, card: NormalizedAiCard): AiAgentEditTarget | undefined {
  const match = instruction.match(/@([^\s@，。！？、；：,.!?;:]+)/u);
  if (!match) {
    return undefined;
  }

  const mention = match[1].trim();
  const cleanedInstruction = instruction.replace(match[0], "").trim();
  const target = resolveEditTargetMention(mention, card);
  return target
    ? {
        ...target,
        mention,
        instruction: cleanedInstruction || instruction.trim()
      }
    : undefined;
}

export function createEditTargetFromFieldTarget(target: AiFieldTarget): AiAgentEditTarget {
  if (target.kind === "section") {
    return {
      kind: target.section,
      mention: `@${target.label}`,
      label: target.label,
      editablePaths: sectionEditablePaths(target.section),
      instruction: "",
      fieldTarget: target
    };
  }
  if (target.kind === "worldBookEntry") {
    const base = `/worldBook/entries/${target.entryIndex}`;
    return {
      kind: "worldBookEntry",
      mention: `@${target.label}`,
      label: target.label,
      editablePaths: worldBookEntryEditablePaths(target.entryIndex),
      instruction: "",
      entryIndex: target.entryIndex,
      entryId: target.entryId,
      entryMemo: target.entryMemo,
      fieldTarget: target
    };
  }
  return {
    kind: pathToTargetKind(target.path),
    mention: `@${target.label}`,
    label: target.label,
    editablePaths: [target.path],
    instruction: "",
    fieldTarget: target
  };
}

export function emptyFieldPaths(card: NormalizedAiCard): string[] {
  const paths: Array<[string, unknown]> = [
    ["/name", card.name],
    ["/description", card.description],
    ["/personality", card.personality],
    ["/scenario", card.scenario],
    ["/firstMessage", card.firstMessage],
    ["/exampleDialogue", card.exampleDialogue],
    ["/creatorNotes", card.creatorNotes],
    ["/tags", card.tags],
    ["/alternateGreetings", card.alternateGreetings],
    ["/worldBook", card.worldBook]
  ];
  return paths
    .filter(([, value]) => {
      if (typeof value === "string") {
        return !value.trim();
      }
      if (Array.isArray(value)) {
        return value.length === 0;
      }
      return value === undefined;
    })
    .map(([path]) => path);
}

export function weakFieldPaths(card: NormalizedAiCard): string[] {
  const weakText = (value: string, min: number) => value.trim().length > 0 && value.trim().length < min;
  return [
    weakText(card.description, 120) ? "/description" : "",
    weakText(card.personality, 60) ? "/personality" : "",
    weakText(card.scenario, 80) ? "/scenario" : "",
    weakText(card.firstMessage, 80) ? "/firstMessage" : "",
    weakText(card.exampleDialogue, 80) ? "/exampleDialogue" : ""
  ].filter(Boolean);
}

export function filterAiPatchesForTarget(patches: AiPatch[], target: AiAgentEditTarget | undefined): {
  accepted: AiPatch[];
  rejected: string[];
} {
  if (!target) {
    return { accepted: patches, rejected: [] };
  }

  const accepted: AiPatch[] = [];
  const rejected: string[] = [];
  for (const patch of patches) {
    if (isPatchAllowedForTarget(patch, target)) {
      accepted.push(patch);
    } else {
      rejected.push(patch.path);
    }
  }
  return { accepted, rejected };
}

export function filterAiPatchesByDeniedPaths(patches: AiPatch[], deniedPaths: string[]): {
  accepted: AiPatch[];
  rejected: string[];
} {
  if (deniedPaths.length === 0) {
    return { accepted: patches, rejected: [] };
  }
  const accepted: AiPatch[] = [];
  const rejected: string[] = [];
  for (const patch of patches) {
    if (deniedPaths.some((path) => patch.path === path || patch.path.startsWith(`${path}/`))) {
      rejected.push(patch.path);
    } else {
      accepted.push(patch);
    }
  }
  return { accepted, rejected };
}

export function toNormalizedAiCard(card: CharacterCardV3): NormalizedAiCard {
  const data = card.data;
  return {
    name: asString(data.name),
    description: asString(data.description),
    personality: asString(data.personality),
    scenario: asString(data.scenario),
    firstMessage: asString(data.first_mes),
    alternateGreetings: stringArray(data.alternate_greetings),
    exampleDialogue: asString(data.mes_example),
    creatorNotes: asString(data.creator_notes),
    systemPrompt: asString(data.system_prompt),
    postHistoryInstructions: asString(data.post_history_instructions),
    tags: stringArray(data.tags),
    creator: asString(data.creator),
    characterVersion: asString(data.character_version),
    worldBook: data.character_book ? toNormalizedWorldBook(data.character_book) : undefined
  };
}

export function fromNormalizedAiCard(normalized: NormalizedAiCard, previousCard: CharacterCardV3): CharacterCardV3 {
  return {
    ...previousCard,
    spec: "chara_card_v3",
    spec_version: previousCard.spec_version || "3.0",
    data: {
      ...previousCard.data,
      name: normalized.name,
      description: normalized.description,
      personality: normalized.personality,
      scenario: normalized.scenario,
      first_mes: normalized.firstMessage,
      alternate_greetings: normalized.alternateGreetings,
      mes_example: normalized.exampleDialogue,
      creator_notes: normalized.creatorNotes,
      system_prompt: normalized.systemPrompt,
      post_history_instructions: normalized.postHistoryInstructions,
      tags: normalized.tags,
      creator: normalized.creator,
      character_version: normalized.characterVersion,
      character_book: normalized.worldBook
        ? fromNormalizedWorldBook(normalized.worldBook, previousCard.data.character_book)
        : undefined
    }
  };
}

export function parseAiAgentResponse(content: string): AiAgentResponse {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("AI returned an empty response.");
  }
  if (trimmed.startsWith("```") || trimmed.includes("```json") || trimmed.includes("```JSON")) {
    throw new Error("AI returned Markdown instead of the required JSON object.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("AI response is not valid JSON.");
  }

  if (!isRecord(parsed)) {
    throw new Error("AI response must be a JSON object.");
  }
  if (typeof parsed.message !== "string") {
    throw new Error("AI response is missing a string message.");
  }
  if (!Array.isArray(parsed.summary) || parsed.summary.some((item) => typeof item !== "string")) {
    throw new Error("AI response summary must be an array of strings.");
  }
  if (!Array.isArray(parsed.patches)) {
    throw new Error("AI response patches must be an array.");
  }

  return {
    message: parsed.message,
    summary: parsed.summary,
    patches: parsed.patches.map(parseAiPatch)
  };
}

export function createAiAgentPreview(card: CharacterCardV3, response: AiAgentResponse): AiAgentPreview {
  const before = toNormalizedAiCard(card);
  const afterNormalized = applyAiPatches(before, response.patches);
  const after = fromNormalizedAiCard(afterNormalized, card);
  return {
    response,
    before,
    afterNormalized,
    after,
    validationReport: validateCard(after),
    diffs: buildAiAgentDiff(before, afterNormalized)
  };
}

export function createAiAgentPreviewForTarget(
  card: CharacterCardV3,
  response: AiAgentResponse,
  target: AiAgentEditTarget | undefined
): AiAgentPreview {
  const filtered = filterAiPatchesForTarget(response.patches, target);
  const scopedResponse: AiAgentResponse = {
    ...response,
    summary: filtered.rejected.length
      ? [...response.summary, `Ignored out-of-target patches: ${filtered.rejected.join(", ")}`]
      : response.summary,
    patches: filtered.accepted
  };
  return {
    ...createAiAgentPreview(card, scopedResponse),
    rejectedPatches: filtered.rejected
  };
}

export function applyAiPatches(base: NormalizedAiCard, patches: AiPatch[]): NormalizedAiCard {
  const next = cloneJson(base);
  patches.forEach((patch, index) => applyAiPatch(next, patch, index));
  return next;
}

export function buildAiAgentDiff(before: NormalizedAiCard, after: NormalizedAiCard): AiAgentDiff[] {
  const diffs: AiAgentDiff[] = [];
  for (const root of [...stringRoots, ...arrayRoots]) {
    const beforeValue = before[root];
    const afterValue = after[root];
    if (stableStringify(beforeValue) !== stableStringify(afterValue)) {
      diffs.push({
        path: `/${root}`,
        label: fieldLabels[root],
        before: formatDiffValue(beforeValue),
        after: formatDiffValue(afterValue)
      });
    }
  }

  if (stableStringify(before.worldBook) !== stableStringify(after.worldBook)) {
    diffs.push({
      path: "/worldBook",
      label: fieldLabels.worldBook,
      before: formatWorldBookDiff(before.worldBook),
      after: formatWorldBookDiff(after.worldBook)
    });
  }

  return diffs;
}

function toNormalizedWorldBook(book: Lorebook): NormalizedWorldBook {
  return {
    name: optionalString(book.name),
    description: optionalString(book.description),
    scanDepth: optionalNumber(book.scan_depth),
    tokenBudget: optionalNumber(book.token_budget),
    recursiveScanning: optionalBoolean(book.recursive_scanning),
    entries: Array.isArray(book.entries) ? book.entries.map(toNormalizedWorldBookEntry) : []
  };
}

function resolveEditTargetMention(
  mention: string,
  card: NormalizedAiCard
): Omit<AiAgentEditTarget, "mention" | "instruction"> | undefined {
  const normalized = normalizeMention(mention);
  if (["基础", "basic", "base", "info", "基本"].includes(normalized)) {
    return {
      kind: "basic",
      label: "基础",
      editablePaths: sectionEditablePaths("basic")
    };
  }
  if (["提示词", "提示", "prompts", "prompt", "persona"].includes(normalized)) {
    return {
      kind: "prompts",
      label: "提示词",
      editablePaths: sectionEditablePaths("prompts")
    };
  }
  if (["开场白", "开场", "问候", "greetings", "greeting", "firstmessage"].includes(normalized)) {
    return {
      kind: "greetings",
      label: "开场白",
      editablePaths: sectionEditablePaths("greetings")
    };
  }
  if (["世界书", "世界", "条目", "lorebook", "worldbook", "worldbookentries"].includes(normalized)) {
    return {
      kind: "worldBook",
      label: "世界书",
      editablePaths: sectionEditablePaths("worldBook")
    };
  }

  const entryTarget = resolveWorldBookEntryMention(mention, normalized, card);
  return entryTarget;
}

function resolveWorldBookEntryMention(
  mention: string,
  normalizedMention: string,
  card: NormalizedAiCard
): Omit<AiAgentEditTarget, "mention" | "instruction"> | undefined {
  const entries = card.worldBook?.entries ?? [];
  if (entries.length === 0) {
    return undefined;
  }

  const numericMatch = normalizedMention.match(/^(?:世界书)?(?:条目|entry)?#?(\d+)$/u) ?? normalizedMention.match(/^#?(\d+)$/u);
  if (numericMatch) {
    const entryIndex = Number(numericMatch[1]) - 1;
    const entry = entries[entryIndex];
    if (entry) {
      return worldBookEntryTarget(entryIndex, entry.id, entry.comment || mention);
    }
  }

  const entryIndex = entries.findIndex((entry) => {
    const candidates = [entry.id, entry.comment, ...entry.keys].map(normalizeMention).filter(Boolean);
    return candidates.includes(normalizedMention);
  });
  if (entryIndex >= 0) {
    const entry = entries[entryIndex];
    return worldBookEntryTarget(entryIndex, entry.id, entry.comment || mention);
  }

  return undefined;
}

function worldBookEntryTarget(
  entryIndex: number,
  entryId: string,
  entryMemo: string
): Omit<AiAgentEditTarget, "mention" | "instruction"> {
  return {
    kind: "worldBookEntry",
    label: `世界书条目 ${entryMemo || `#${entryIndex + 1}`}`,
    editablePaths: worldBookEntryEditablePaths(entryIndex),
    entryIndex,
    entryId,
    entryMemo
  };
}

function isPatchAllowedForTarget(patch: AiPatch, target: AiAgentEditTarget): boolean {
  const path = patch.path;
  if (target.fieldTarget?.kind === "selection") {
    return path === target.fieldTarget.path && patch.op === "replace" && typeof patch.value === "string";
  }
  if (target.kind === "worldBookEntry") {
    const entryRoot = `/worldBook/entries/${target.entryIndex}`;
    return path === entryRoot || path.startsWith(`${entryRoot}/`);
  }
  return target.editablePaths.some((allowedPath) => path === allowedPath || path.startsWith(`${allowedPath}/`));
}

function sectionEditablePaths(section: "basic" | "prompts" | "greetings" | "worldBook"): string[] {
  switch (section) {
    case "basic":
      return ["/name", "/creator", "/characterVersion", "/tags", "/creatorNotes"];
    case "prompts":
      return ["/description", "/personality", "/scenario", "/exampleDialogue", "/systemPrompt", "/postHistoryInstructions"];
    case "greetings":
      return ["/firstMessage", "/alternateGreetings"];
    case "worldBook":
      return ["/worldBook"];
  }
}

function worldBookEntryEditablePaths(entryIndex: number): string[] {
  const base = `/worldBook/entries/${entryIndex}`;
  return [
    base,
    `${base}/id`,
    `${base}/enabled`,
    `${base}/comment`,
    `${base}/keys`,
    `${base}/secondaryKeys`,
    `${base}/content`,
    `${base}/selective`,
    `${base}/constant`,
    `${base}/insertionPosition`,
    `${base}/order`,
    `${base}/depth`,
    `${base}/probability`,
    `${base}/budget`
  ];
}

function pathToTargetKind(path: string): AiAgentEditTargetKind {
  if (path.startsWith("/worldBook")) {
    return "worldBook";
  }
  if (path.startsWith("/firstMessage") || path.startsWith("/alternateGreetings")) {
    return "greetings";
  }
  if (path.startsWith("/description") || path.startsWith("/personality") || path.startsWith("/scenario") || path.startsWith("/exampleDialogue")) {
    return "prompts";
  }
  return "basic";
}

function normalizeMention(value: string): string {
  return value
    .trim()
    .replace(/^@/u, "")
    .replace(/[\s_\-:：/\\]+/gu, "")
    .toLowerCase();
}

function toNormalizedWorldBookEntry(entry: LorebookEntry, index: number): NormalizedWorldBookEntry {
  const passthrough = entry as Record<string, unknown>;
  const extensions = isRecord(entry.extensions) ? entry.extensions : {};
  const order = optionalNumber(entry.insertion_order) ?? index;
  return {
    id: normalizedEntryId(entry, index),
    enabled: optionalBoolean(entry.enabled) ?? true,
    comment: deriveLorebookEntryComment(entry, index),
    keys: stringArray(entry.keys),
    secondaryKeys: stringArray(entry.secondary_keys),
    content: asString(entry.content),
    selective: optionalBoolean(entry.selective) ?? false,
    constant: optionalBoolean(entry.constant) ?? false,
    insertionPosition:
      optionalNumber(extensions.position) === 1 || entry.position === "after_char" ? "after_char" : "before_char",
    order,
    depth: optionalNumber(extensions.depth) ?? optionalNumber(passthrough.depth) ?? 4,
    probability: optionalNumber(extensions.probability) ?? optionalNumber(passthrough.probability) ?? 100,
    budget: optionalNumber(extensions.budget) ?? optionalNumber(passthrough.budget) ?? 300
  };
}

function fromNormalizedWorldBook(normalized: NormalizedWorldBook, previousBook: Lorebook | undefined): Lorebook {
  const previousEntriesById = new Map<string, LorebookEntry>();
  previousBook?.entries.forEach((entry, index) => previousEntriesById.set(normalizedEntryId(entry, index), entry));

  return {
    ...(previousBook ?? { extensions: {} }),
    name: normalized.name,
    description: normalized.description,
    scan_depth: normalized.scanDepth,
    token_budget: normalized.tokenBudget,
    recursive_scanning: normalized.recursiveScanning,
    extensions: previousBook?.extensions ?? {},
    entries: normalized.entries.map((entry, index) =>
      fromNormalizedWorldBookEntry(entry, previousEntriesById.get(entry.id), index)
    )
  };
}

function fromNormalizedWorldBookEntry(
  normalized: NormalizedWorldBookEntry,
  previousEntry: LorebookEntry | undefined,
  index: number
): LorebookEntry {
  const generatedPreviousId = previousEntry?.id === undefined && /^entry_\d+$/.test(normalized.id);
  const comment = normalizeLorebookEntryComment(
    normalized.comment || normalized.keys.find((key) => key.trim()) || fallbackLorebookEntryComment(index)
  );
  const extensions = {
    ...(previousEntry?.extensions ?? {}),
    depth: normalized.depth,
    probability: normalized.probability,
    budget: normalized.budget
  };
  return {
    ...(previousEntry ?? { extensions: {} }),
    id: generatedPreviousId ? undefined : normalized.id,
    name: undefined,
    enabled: normalized.enabled,
    keys: normalized.keys,
    secondary_keys: normalized.secondaryKeys,
    content: normalized.content,
    selective: normalized.selective,
    constant: normalized.constant,
    position: normalized.insertionPosition,
    insertion_order: normalized.order,
    use_regex: previousEntry?.use_regex ?? false,
    extensions,
    depth: undefined,
    probability: undefined,
    budget: undefined,
    order: undefined,
    comment,
    priority: previousEntry?.priority ?? undefined,
    case_sensitive: previousEntry?.case_sensitive ?? undefined
  } as LorebookEntry;
}

function parseAiPatch(value: unknown, index: number): AiPatch {
  if (!isRecord(value)) {
    throw new Error(`Patch ${index + 1} must be an object.`);
  }
  if (value.op !== "add" && value.op !== "replace" && value.op !== "remove") {
    throw new Error(`Patch ${index + 1} has an unsupported operation.`);
  }
  if (typeof value.path !== "string" || !value.path.startsWith("/")) {
    throw new Error(`Patch ${index + 1} must use a JSON Pointer path.`);
  }
  if (value.path.startsWith("/data/") || value.path === "/data" || value.path === "/spec" || value.path === "/spec_version") {
    throw new Error(`Patch ${index + 1} targets a raw card field, which is not allowed.`);
  }
  if (value.path === "/regexScripts" || value.path.startsWith("/regexScripts/")) {
    throw new Error(`Patch ${index + 1} targets regexScripts, which are not supported yet.`);
  }
  return {
    op: value.op,
    path: value.path,
    value: value.value
  };
}

function applyAiPatch(card: NormalizedAiCard, patch: AiPatch, index: number): void {
  const segments = parsePointer(patch.path, index);
  const [root, ...rest] = segments;
  if (!root) {
    throw patchError(index, "targets an empty path.");
  }

  if (stringRootSet.has(root)) {
    applyStringRoot(card, root as keyof Pick<NormalizedAiCard, (typeof stringRoots)[number]>, rest, patch, index);
    return;
  }
  if (arrayRootSet.has(root)) {
    applyStringArrayRoot(card, root as "alternateGreetings" | "tags", rest, patch, index);
    return;
  }
  if (root === "worldBook") {
    applyWorldBook(card, rest, patch, index);
    return;
  }

  throw patchError(index, `targets unsupported path /${root}.`);
}

function applyStringRoot(
  card: NormalizedAiCard,
  root: keyof Pick<NormalizedAiCard, (typeof stringRoots)[number]>,
  rest: string[],
  patch: AiPatch,
  index: number
): void {
  if (rest.length > 0) {
    throw patchError(index, `cannot edit nested path ${patch.path}.`);
  }
  card[root] = patch.op === "remove" ? "" : expectString(patch.value, index, patch.path);
}

function applyStringArrayRoot(
  card: NormalizedAiCard,
  root: "alternateGreetings" | "tags",
  rest: string[],
  patch: AiPatch,
  index: number
): void {
  if (rest.length === 0) {
    card[root] = patch.op === "remove" ? [] : expectStringArray(patch.value, index, patch.path);
    return;
  }
  if (rest.length !== 1) {
    throw patchError(index, `cannot edit nested path ${patch.path}.`);
  }

  const target = card[root];
  const segment = rest[0];
  if (patch.op === "add") {
    const value = expectString(patch.value, index, patch.path);
    if (segment === "-") {
      target.push(value);
      return;
    }
    const insertAt = expectInsertIndex(segment, target.length, index, patch.path);
    target.splice(insertAt, 0, value);
    return;
  }

  const itemIndex = expectExistingIndex(segment, target.length, index, patch.path);
  if (patch.op === "remove") {
    target.splice(itemIndex, 1);
  } else {
    target[itemIndex] = expectString(patch.value, index, patch.path);
  }
}

function applyWorldBook(card: NormalizedAiCard, rest: string[], patch: AiPatch, index: number): void {
  if (rest.length === 0) {
    card.worldBook = patch.op === "remove" ? undefined : expectWorldBook(patch.value, index, patch.path);
    return;
  }

  if (!card.worldBook) {
    card.worldBook = { entries: [] };
  }

  const [field, ...fieldRest] = rest;
  if (field === "entries") {
    applyWorldBookEntries(card.worldBook, fieldRest, patch, index);
    return;
  }
  if (fieldRest.length > 0) {
    throw patchError(index, `cannot edit nested path ${patch.path}.`);
  }

  switch (field) {
    case "name":
    case "description":
      card.worldBook[field] = patch.op === "remove" ? undefined : expectString(patch.value, index, patch.path);
      return;
    case "scanDepth":
    case "tokenBudget":
      card.worldBook[field] = patch.op === "remove" ? undefined : expectNumber(patch.value, index, patch.path);
      return;
    case "recursiveScanning":
      card.worldBook.recursiveScanning = patch.op === "remove" ? undefined : expectBoolean(patch.value, index, patch.path);
      return;
    default:
      throw patchError(index, `targets unsupported worldBook field ${field}.`);
  }
}

function applyWorldBookEntries(book: NormalizedWorldBook, rest: string[], patch: AiPatch, index: number): void {
  if (rest.length === 0) {
    book.entries = patch.op === "remove" ? [] : expectWorldBookEntryArray(patch.value, index, patch.path);
    return;
  }

  const [entrySegment, entryField] = rest;
  if (rest.length === 1) {
    if (patch.op === "add") {
      const entry = expectWorldBookEntry(patch.value, index, patch.path);
      entry.order = nextWorldBookOrder(book);
      if (entrySegment === "-") {
        book.entries.push(entry);
        return;
      }
      const insertAt = expectInsertIndex(entrySegment, book.entries.length, index, patch.path);
      book.entries.splice(insertAt, 0, entry);
      return;
    }

    const entryIndex = expectExistingIndex(entrySegment, book.entries.length, index, patch.path);
    if (patch.op === "remove") {
      book.entries.splice(entryIndex, 1);
    } else {
      book.entries[entryIndex] = expectWorldBookEntry(patch.value, index, patch.path);
    }
    return;
  }

  if (rest.length !== 2) {
    throw patchError(index, `cannot edit nested path ${patch.path}.`);
  }

  const entryIndex = expectExistingIndex(entrySegment, book.entries.length, index, patch.path);
  applyWorldBookEntryField(book.entries[entryIndex], entryField, patch, index);
}

function applyWorldBookEntryField(entry: NormalizedWorldBookEntry, field: string, patch: AiPatch, index: number): void {
  switch (field) {
    case "id":
    case "comment":
    case "content":
      entry[field] = patch.op === "remove" ? "" : expectString(patch.value, index, patch.path);
      return;
    case "keys":
    case "secondaryKeys":
      entry[field] = patch.op === "remove" ? [] : expectStringArray(patch.value, index, patch.path);
      return;
    case "enabled":
    case "selective":
    case "constant":
      entry[field] = patch.op === "remove" ? defaultEntry()[field] : expectBoolean(patch.value, index, patch.path);
      return;
    case "insertionPosition":
      entry.insertionPosition = patch.op === "remove" ? "before_char" : expectInsertionPosition(patch.value, index, patch.path);
      return;
    case "order":
    case "depth":
    case "probability":
    case "budget":
      entry[field] = patch.op === "remove" ? defaultEntry()[field] : expectNumber(patch.value, index, patch.path);
      return;
    default:
      throw patchError(index, `targets unsupported worldBook entry field ${field}.`);
  }
}

function expectWorldBook(value: unknown, index: number, path: string): NormalizedWorldBook {
  if (!isRecord(value)) {
    throw patchError(index, `${path} must be a worldBook object.`);
  }
  if (!Array.isArray(value.entries)) {
    throw patchError(index, `${path}.entries must be an array.`);
  }
  return {
    name: value.name === undefined ? undefined : expectString(value.name, index, `${path}/name`),
    description: value.description === undefined ? undefined : expectString(value.description, index, `${path}/description`),
    scanDepth: value.scanDepth === undefined ? undefined : expectNumber(value.scanDepth, index, `${path}/scanDepth`),
    tokenBudget: value.tokenBudget === undefined ? undefined : expectNumber(value.tokenBudget, index, `${path}/tokenBudget`),
    recursiveScanning:
      value.recursiveScanning === undefined
        ? undefined
        : expectBoolean(value.recursiveScanning, index, `${path}/recursiveScanning`),
    entries: value.entries.map((entry, entryIndex) => expectWorldBookEntry(entry, index, `${path}/entries/${entryIndex}`))
  };
}

function expectWorldBookEntryArray(value: unknown, index: number, path: string): NormalizedWorldBookEntry[] {
  if (!Array.isArray(value)) {
    throw patchError(index, `${path} must be an array of worldBook entries.`);
  }
  return value.map((entry, entryIndex) => expectWorldBookEntry(entry, index, `${path}/${entryIndex}`));
}

function expectWorldBookEntry(value: unknown, index: number, path: string): NormalizedWorldBookEntry {
  if (!isRecord(value)) {
    throw patchError(index, `${path} must be a worldBook entry object.`);
  }
  for (const key of [
    "id",
    "enabled",
    "comment",
    "keys",
    "secondaryKeys",
    "content",
    "selective",
    "constant",
    "insertionPosition",
    "order",
    "depth",
    "probability",
    "budget"
  ]) {
    if (!(key in value)) {
      throw patchError(index, `${path} is missing ${key}.`);
    }
  }

  return {
    id: expectString(value.id, index, `${path}/id`),
    enabled: expectBoolean(value.enabled, index, `${path}/enabled`),
    comment: expectString(value.comment, index, `${path}/comment`),
    keys: expectStringArray(value.keys, index, `${path}/keys`),
    secondaryKeys: expectStringArray(value.secondaryKeys, index, `${path}/secondaryKeys`),
    content: expectString(value.content, index, `${path}/content`),
    selective: expectBoolean(value.selective, index, `${path}/selective`),
    constant: expectBoolean(value.constant, index, `${path}/constant`),
    insertionPosition: expectInsertionPosition(value.insertionPosition, index, `${path}/insertionPosition`),
    order: expectNumber(value.order, index, `${path}/order`),
    depth: expectNumber(value.depth, index, `${path}/depth`),
    probability: expectNumber(value.probability, index, `${path}/probability`),
    budget: expectNumber(value.budget, index, `${path}/budget`)
  };
}

function parsePointer(path: string, index: number): string[] {
  if (!path.startsWith("/")) {
    throw patchError(index, "must use a JSON Pointer path.");
  }
  return path
    .slice(1)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function expectString(value: unknown, index: number, path: string): string {
  if (typeof value !== "string") {
    throw patchError(index, `${path} must be a string.`);
  }
  return value;
}

function expectStringArray(value: unknown, index: number, path: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw patchError(index, `${path} must be an array of strings.`);
  }
  return [...value];
}

function expectNumber(value: unknown, index: number, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw patchError(index, `${path} must be a finite number.`);
  }
  return Math.trunc(value);
}

function expectBoolean(value: unknown, index: number, path: string): boolean {
  if (typeof value !== "boolean") {
    throw patchError(index, `${path} must be a boolean.`);
  }
  return value;
}

function expectInsertionPosition(value: unknown, index: number, path: string): "before_char" | "after_char" {
  if (value !== "before_char" && value !== "after_char") {
    throw patchError(index, `${path} must be before_char or after_char.`);
  }
  return value;
}

function expectInsertIndex(segment: string, length: number, index: number, path: string): number {
  const parsed = Number(segment);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > length) {
    throw patchError(index, `${path} uses an invalid array insert index.`);
  }
  return parsed;
}

function expectExistingIndex(segment: string, length: number, index: number, path: string): number {
  const parsed = Number(segment);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed >= length) {
    throw patchError(index, `${path} uses an invalid array index.`);
  }
  return parsed;
}

function nextWorldBookOrder(book: NormalizedWorldBook): number {
  return book.entries.length ? Math.max(...book.entries.map((entry) => entry.order)) + 1 : 0;
}

function defaultEntry(): NormalizedWorldBookEntry {
  return {
    id: "",
    enabled: true,
    comment: "",
    keys: [],
    secondaryKeys: [],
    content: "",
    selective: false,
    constant: false,
    insertionPosition: "before_char",
    order: 0,
    depth: 4,
    probability: 100,
    budget: 300
  };
}

function normalizedEntryId(entry: LorebookEntry, index: number): string {
  if (entry.id !== undefined && entry.id !== null && String(entry.id).trim()) {
    return String(entry.id);
  }
  return `entry_${optionalNumber(entry.insertion_order) ?? index}`;
}

function patchError(index: number, message: string): Error {
  return new Error(`Patch ${index + 1} ${message}`);
}

function formatWorldBookDiff(book: NormalizedWorldBook | undefined): string {
  if (!book) {
    return "None";
  }
  const name = book.name?.trim() ? `${book.name.trim()} - ` : "";
  return `${name}${book.entries.length} entries`;
}

function formatDiffValue(value: unknown): string {
  if (typeof value === "string") {
    return limitText(value || "Empty");
  }
  if (Array.isArray(value)) {
    return value.length ? limitText(value.join("\n")) : "Empty";
  }
  return limitText(stableStringify(value));
}

function limitText(value: string, max = 700): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
