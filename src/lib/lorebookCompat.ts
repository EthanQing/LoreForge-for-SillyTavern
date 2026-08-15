import type { CharacterCardV3, Lorebook, LorebookEntry } from "./schema";

export const LOREBOOK_ENTRY_COMMENT_MAX_LENGTH = 100;

export const sillyTavernWorldInfoPositions = {
  before: 0,
  after: 1,
  anTop: 2,
  anBottom: 3,
  atDepth: 4,
  examplesTop: 5,
  examplesBottom: 6,
  outlet: 7
} as const;

export const sillyTavernWorldInfoLogic = {
  andAny: 0,
  notAll: 1,
  notAny: 2,
  andAll: 3
} as const;

export const sillyTavernPromptRoles = {
  system: 0,
  user: 1,
  assistant: 2
} as const;

export interface SillyTavernLorebookBinding {
  embeddedName?: string;
  linkedName?: string;
  isMismatched: boolean;
}

export interface SillyTavernWorldInfoEntry extends Record<string, unknown> {
  uid: number | string;
  key: string[];
  keysecondary: string[];
  comment: string;
  content: string;
}

export interface SillyTavernWorldInfo extends Record<string, unknown> {
  entries: Record<string, SillyTavernWorldInfoEntry>;
}

export interface SillyTavernLorebookEntryExtensions extends Record<string, unknown> {
  display_index?: number;
  exclude_recursion?: boolean;
  prevent_recursion?: boolean;
  delay_until_recursion?: boolean | number;
  depth?: number;
  budget?: number;
  probability?: number;
  position?: number;
  role?: number;
  selectiveLogic?: number;
  useProbability?: boolean;
  outlet_name?: string;
  match_whole_words?: boolean | null;
  use_group_scoring?: boolean | null;
  case_sensitive?: boolean | null;
  match_persona_description?: boolean;
  match_character_description?: boolean;
  match_character_personality?: boolean;
  match_character_depth_prompt?: boolean;
  match_scenario?: boolean;
  match_creator_notes?: boolean;
  scan_depth?: number | null;
  automation_id?: string;
  vectorized?: boolean;
  group?: string;
  group_override?: boolean;
  group_weight?: number;
  sticky?: number | null;
  cooldown?: number | null;
  delay?: number | null;
  triggers?: string[];
  ignore_budget?: boolean;
}

export function fallbackLorebookEntryComment(index: number): string {
  return `Entry ${index + 1}`;
}

export function normalizeLorebookEntryComment(value: string): string {
  const trimmed = value.trim();
  return Array.from(trimmed).slice(0, LOREBOOK_ENTRY_COMMENT_MAX_LENGTH).join("");
}

export function deriveLorebookEntryComment(entry: Pick<LorebookEntry, "comment" | "name" | "keys">, index: number): string {
  const firstKey = Array.isArray(entry.keys) ? entry.keys.find((key) => key.trim()) : undefined;
  const source = [entry.comment, entry.name, firstKey, fallbackLorebookEntryComment(index)].find(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );
  return normalizeLorebookEntryComment(source ?? fallbackLorebookEntryComment(index));
}

export function fillEmptyLorebookEntryComments(book: Lorebook): Lorebook {
  return {
    ...book,
    entries: book.entries.map((entry, index) => {
      if (typeof entry.comment === "string" && entry.comment.trim()) {
        return entry;
      }
      return {
        ...entry,
        comment: deriveLorebookEntryComment(entry, index)
      };
    })
  };
}

export function normalizeLorebookForSillyTavern(book: Lorebook | undefined): Lorebook | undefined {
  if (!book) {
    return undefined;
  }
  return {
    ...book,
    extensions: isRecord(book.extensions) ? book.extensions : {},
    entries: book.entries.map(normalizeLorebookEntryForSillyTavern)
  };
}

/**
 * Convert the embedded CCv3 character book shape to SillyTavern's standalone
 * World Info file shape. Standalone files use an object keyed by UID; they do
 * not use the card's `entries` array or the app-specific `lorebook_v3` wrapper.
 */
export function toSillyTavernWorldInfo(book: Lorebook): SillyTavernWorldInfo {
  const normalized = normalizeLorebookForSillyTavern(book) ?? { entries: [] };
  const entries: Record<string, SillyTavernWorldInfoEntry> = {};

  normalized.entries.forEach((entry, index) => {
    const extensions = isRecord(entry.extensions) ? { ...entry.extensions } : {};
    const uid = normalizeWorldInfoUid(entry.id, index);
    const worldEntry: SillyTavernWorldInfoEntry = {
      uid,
      key: entry.keys,
      keysecondary: entry.secondary_keys ?? [],
      comment: entry.comment ?? deriveLorebookEntryComment(entry, index),
      content: entry.content,
      constant: entry.constant ?? false,
      selective: entry.selective ?? false,
      vectorized: readBooleanExtension(extensions.vectorized, false),
      selectiveLogic: readNumberExtension(extensions.selectiveLogic, 0),
      order: Number.isFinite(entry.insertion_order) ? entry.insertion_order : index,
      position: readNumberExtension(
        extensions.position,
        entry.position === "before_char" ? sillyTavernWorldInfoPositions.before : sillyTavernWorldInfoPositions.after
      ),
      excludeRecursion: readBooleanExtension(extensions.exclude_recursion, false),
      preventRecursion: readBooleanExtension(extensions.prevent_recursion, false),
      delayUntilRecursion: extensions.delay_until_recursion ?? false,
      disable: !entry.enabled,
      addMemo: Boolean(entry.comment?.trim()),
      displayIndex: readNumberExtension(extensions.display_index, index),
      probability: readNumberExtension(extensions.probability, 100),
      useProbability: readBooleanExtension(extensions.useProbability, true),
      depth: readNumberExtension(extensions.depth, 4),
      outletName: readStringExtension(extensions.outlet_name, ""),
      group: readStringExtension(extensions.group, ""),
      groupOverride: readBooleanExtension(extensions.group_override, false),
      groupWeight: readNumberExtension(extensions.group_weight, 100),
      scanDepth: readNullableNumberExtension(extensions.scan_depth),
      caseSensitive: readNullableBooleanExtension(extensions.case_sensitive ?? entry.case_sensitive),
      matchWholeWords: readNullableBooleanExtension(extensions.match_whole_words),
      useGroupScoring: readNullableBooleanExtension(extensions.use_group_scoring),
      automationId: readStringExtension(extensions.automation_id, ""),
      role: readNumberExtension(extensions.role, 0),
      sticky: readNullableNumberExtension(extensions.sticky),
      cooldown: readNullableNumberExtension(extensions.cooldown),
      delay: readNullableNumberExtension(extensions.delay),
      matchPersonaDescription: readBooleanExtension(extensions.match_persona_description, false),
      matchCharacterDescription: readBooleanExtension(extensions.match_character_description, false),
      matchCharacterPersonality: readBooleanExtension(extensions.match_character_personality, false),
      matchCharacterDepthPrompt: readBooleanExtension(extensions.match_character_depth_prompt, false),
      matchScenario: readBooleanExtension(extensions.match_scenario, false),
      matchCreatorNotes: readBooleanExtension(extensions.match_creator_notes, false),
      extensions,
      triggers: readStringArrayExtension(extensions.triggers),
      ignoreBudget: readBooleanExtension(extensions.ignore_budget, false)
    };

    copyUnknownLorebookEntryFields(entry, worldEntry);
    entries[String(uid)] = worldEntry;
  });

  return { entries };
}

/** Convert a standalone SillyTavern World Info object back to the editor shape. */
export function fromSillyTavernWorldInfo(value: unknown): Lorebook | undefined {
  if (!isRecord(value) || !isRecord(value.entries)) {
    return undefined;
  }

  const entries: LorebookEntry[] = [];
  for (const [entryKey, rawEntry] of Object.entries(value.entries)) {
    if (!isRecord(rawEntry)) {
      return undefined;
    }
    const extensions = isRecord(rawEntry.extensions) ? { ...rawEntry.extensions } : {};
    copyWorldInfoExtension(extensions, rawEntry, "excludeRecursion", "exclude_recursion");
    copyWorldInfoExtension(extensions, rawEntry, "preventRecursion", "prevent_recursion");
    copyWorldInfoExtension(extensions, rawEntry, "delayUntilRecursion", "delay_until_recursion");
    copyWorldInfoExtension(extensions, rawEntry, "displayIndex", "display_index");
    copyWorldInfoExtension(extensions, rawEntry, "probability", "probability");
    copyWorldInfoExtension(extensions, rawEntry, "useProbability", "useProbability");
    copyWorldInfoExtension(extensions, rawEntry, "depth", "depth");
    copyWorldInfoExtension(extensions, rawEntry, "selectiveLogic", "selectiveLogic");
    copyWorldInfoExtension(extensions, rawEntry, "outletName", "outlet_name");
    copyWorldInfoExtension(extensions, rawEntry, "group", "group");
    copyWorldInfoExtension(extensions, rawEntry, "groupOverride", "group_override");
    copyWorldInfoExtension(extensions, rawEntry, "groupWeight", "group_weight");
    copyWorldInfoExtension(extensions, rawEntry, "scanDepth", "scan_depth");
    copyWorldInfoExtension(extensions, rawEntry, "caseSensitive", "case_sensitive");
    copyWorldInfoExtension(extensions, rawEntry, "matchWholeWords", "match_whole_words");
    copyWorldInfoExtension(extensions, rawEntry, "useGroupScoring", "use_group_scoring");
    copyWorldInfoExtension(extensions, rawEntry, "automationId", "automation_id");
    copyWorldInfoExtension(extensions, rawEntry, "role", "role");
    copyWorldInfoExtension(extensions, rawEntry, "vectorized", "vectorized");
    copyWorldInfoExtension(extensions, rawEntry, "sticky", "sticky");
    copyWorldInfoExtension(extensions, rawEntry, "cooldown", "cooldown");
    copyWorldInfoExtension(extensions, rawEntry, "delay", "delay");
    copyWorldInfoExtension(extensions, rawEntry, "matchPersonaDescription", "match_persona_description");
    copyWorldInfoExtension(extensions, rawEntry, "matchCharacterDescription", "match_character_description");
    copyWorldInfoExtension(extensions, rawEntry, "matchCharacterPersonality", "match_character_personality");
    copyWorldInfoExtension(extensions, rawEntry, "matchCharacterDepthPrompt", "match_character_depth_prompt");
    copyWorldInfoExtension(extensions, rawEntry, "matchScenario", "match_scenario");
    copyWorldInfoExtension(extensions, rawEntry, "matchCreatorNotes", "match_creator_notes");
    copyWorldInfoExtension(extensions, rawEntry, "triggers", "triggers");
    copyWorldInfoExtension(extensions, rawEntry, "ignoreBudget", "ignore_budget");

    const position = typeof rawEntry.position === "number"
      ? rawEntry.position === sillyTavernWorldInfoPositions.after ? "after_char" : "before_char"
      : undefined;
    if (typeof rawEntry.position === "number") {
      extensions.position = rawEntry.position;
    }

    const entry: LorebookEntry = {
      keys: readStringArray(rawEntry.key),
      secondary_keys: readStringArray(rawEntry.keysecondary),
      content: typeof rawEntry.content === "string" ? rawEntry.content : "",
      comment: typeof rawEntry.comment === "string" ? rawEntry.comment : undefined,
      enabled: typeof rawEntry.disable === "boolean" ? !rawEntry.disable : true,
      insertion_order: readNumber(rawEntry.order, entries.length),
      use_regex: typeof rawEntry.use_regex === "boolean" ? rawEntry.use_regex : false,
      constant: typeof rawEntry.constant === "boolean" ? rawEntry.constant : undefined,
      selective: typeof rawEntry.selective === "boolean" ? rawEntry.selective : undefined,
      id: normalizeWorldInfoUid(rawEntry.uid, entries.length, entryKey),
      position,
      extensions
    };
    copyUnknownWorldInfoFields(rawEntry, entry);
    entries.push(entry);
  }

  return {
    name: typeof value.name === "string" ? value.name : undefined,
    description: typeof value.description === "string" ? value.description : undefined,
    scan_depth: typeof value.scan_depth === "number" ? value.scan_depth : undefined,
    token_budget: typeof value.token_budget === "number" ? value.token_budget : undefined,
    recursive_scanning: typeof value.recursive_scanning === "boolean" ? value.recursive_scanning : undefined,
    extensions: isRecord(value.extensions) ? value.extensions : {},
    entries
  };
}

export function getSillyTavernPrimaryWorldName(card: CharacterCardV3): string | undefined {
  return readBindingName(card.data.extensions?.world);
}

export function getSillyTavernLorebookBinding(card: CharacterCardV3): SillyTavernLorebookBinding {
  const embeddedName = readBindingName(card.data.character_book?.name);
  const linkedName = getSillyTavernPrimaryWorldName(card);
  return {
    embeddedName,
    linkedName,
    isMismatched: Boolean(embeddedName && linkedName && embeddedName !== linkedName)
  };
}

export function syncSillyTavernLorebookBinding(card: CharacterCardV3): CharacterCardV3 {
  const extensions = isRecord(card.data.extensions) ? { ...card.data.extensions } : {};
  const embeddedName = readBindingName(card.data.character_book?.name);
  if (embeddedName) {
    extensions.world = embeddedName;
  } else {
    delete extensions.world;
  }

  return {
    ...card,
    data: {
      ...card.data,
      extensions
    }
  };
}

export function syncSillyTavernLorebookBindingAfterRename(
  card: CharacterCardV3,
  previousEmbeddedName: string | undefined
): CharacterCardV3 {
  const linkedName = getSillyTavernPrimaryWorldName(card);
  const previousName = readBindingName(previousEmbeddedName);
  if (!linkedName || linkedName === previousName) {
    return syncSillyTavernLorebookBinding(card);
  }
  return card;
}

export function normalizeLorebookEntryForSillyTavern(entry: LorebookEntry, index: number): LorebookEntry {
  const extensions: SillyTavernLorebookEntryExtensions = isRecord(entry.extensions) ? { ...entry.extensions } : {};
  const passthrough = entry as Record<string, unknown>;
  const normalizedEntry: LorebookEntry = {
    ...entry,
    comment: deriveLorebookEntryComment(entry, index),
    extensions
  };

  copyNumberExtension(extensions, "depth", passthrough.depth);
  copyNumberExtension(extensions, "probability", passthrough.probability);
  copyNumberExtension(extensions, "budget", passthrough.budget);
  copyBooleanExtension(extensions, "case_sensitive", entry.case_sensitive);

  if (extensions.position === undefined && entry.position) {
    extensions.position =
      entry.position === "after_char" ? sillyTavernWorldInfoPositions.after : sillyTavernWorldInfoPositions.before;
  }
  if (extensions.display_index === undefined) {
    extensions.display_index = index;
  }

  delete normalizedEntry.name;
  return normalizedEntry;
}

function copyNumberExtension(
  extensions: SillyTavernLorebookEntryExtensions,
  key: keyof SillyTavernLorebookEntryExtensions,
  value: unknown
): void {
  if (extensions[key] !== undefined || typeof value !== "number" || !Number.isFinite(value)) {
    return;
  }
  extensions[key] = Math.trunc(value) as never;
}

function copyBooleanExtension(
  extensions: SillyTavernLorebookEntryExtensions,
  key: keyof SillyTavernLorebookEntryExtensions,
  value: unknown
): void {
  if (extensions[key] !== undefined || typeof value !== "boolean") {
    return;
  }
  extensions[key] = value as never;
}

function normalizeWorldInfoUid(value: unknown, index: number, fallback?: string): number | string {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return fallback?.trim() || index;
}

function readNumberExtension(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function readNullableNumberExtension(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}

function readBooleanExtension(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readNullableBooleanExtension(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readStringExtension(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readStringArrayExtension(value: unknown): string[] {
  return readStringArray(value);
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function copyWorldInfoExtension(
  extensions: Record<string, unknown>,
  entry: Record<string, unknown>,
  sourceKey: string,
  targetKey: string
): void {
  if (extensions[targetKey] === undefined && entry[sourceKey] !== undefined) {
    extensions[targetKey] = entry[sourceKey];
  }
}

function copyUnknownLorebookEntryFields(entry: LorebookEntry, target: Record<string, unknown>): void {
  const knownFields = new Set([
    "keys", "secondary_keys", "content", "comment", "enabled", "insertion_order", "use_regex", "constant",
    "name", "priority", "id", "selective", "extensions", "position"
  ]);
  for (const [key, value] of Object.entries(entry)) {
    if (!knownFields.has(key)) {
      target[key] = value;
    }
  }
}

function copyUnknownWorldInfoFields(raw: Record<string, unknown>, target: LorebookEntry): void {
  const knownFields = new Set([
    "uid", "key", "keysecondary", "comment", "content", "constant", "selective", "vectorized", "selectiveLogic",
    "order", "position", "excludeRecursion", "preventRecursion", "delayUntilRecursion", "disable", "addMemo",
    "displayIndex", "probability", "useProbability", "depth", "outletName", "group", "groupOverride", "groupWeight",
    "scanDepth", "caseSensitive", "matchWholeWords", "useGroupScoring", "automationId", "role", "sticky", "cooldown",
    "delay", "matchPersonaDescription", "matchCharacterDescription", "matchCharacterPersonality", "matchCharacterDepthPrompt",
    "matchScenario", "matchCreatorNotes", "extensions", "triggers", "ignoreBudget"
  ]);
  for (const [key, value] of Object.entries(raw)) {
    if (!knownFields.has(key)) {
      target[key] = value;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBindingName(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
