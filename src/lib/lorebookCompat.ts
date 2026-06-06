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

export function normalizeCardLorebookForSillyTavern(card: CharacterCardV3): CharacterCardV3 {
  return {
    ...card,
    data: {
      ...card.data,
      character_book: normalizeLorebookForSillyTavern(card.data.character_book)
    }
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
