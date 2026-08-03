import { deriveLorebookEntryComment } from "../../lib/lorebookCompat";
import type { CharacterCardV3 } from "../../lib/schema";

export interface LorebookMentionRange {
  start: number;
  end: number;
  query: string;
}

export interface LorebookMentionOption {
  entryIndex: number;
  title: string;
  insertionOrder: number;
  keyCount: number;
  id?: string | number;
  token: string;
}

export function findLorebookMentionRange(value: string, cursor: number): LorebookMentionRange | undefined {
  const prefix = value.slice(0, cursor);
  const match = prefix.match(/(?:^|[\s，。！？、；：,.!?;:])@([^@"\n，。！？、；：,.!?;:]{0,100})$/u);
  if (!match) {
    return undefined;
  }

  const start = prefix.lastIndexOf("@");
  return { start, end: cursor, query: prefix.slice(start + 1).trim() };
}

export function getLorebookMentionOptions(card: CharacterCardV3, query: string, limit = 8): LorebookMentionOption[] {
  const entries = card.data.character_book?.entries ?? [];
  const normalizedQuery = normalizeSearchText(query);
  const titleCounts = new Map<string, number>();

  for (const [index, entry] of entries.entries()) {
    const title = normalizeSearchText(deriveLorebookEntryComment(entry, index));
    titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
  }

  return entries
    .map((entry, entryIndex) => {
      const title = deriveLorebookEntryComment(entry, entryIndex);
      const normalizedTitle = normalizeSearchText(title);
      const searchable = normalizeSearchText([title, entry.id, ...entry.keys].filter((value) => value !== undefined).join(" "));
      const score = normalizedTitle.startsWith(normalizedQuery) ? 0 : searchable.includes(normalizedQuery) ? 1 : 2;
      return {
        entryIndex,
        title,
        insertionOrder: entry.insertion_order,
        keyCount: entry.keys.length,
        id: entry.id,
        token: formatLorebookMention(title, titleCounts.get(normalizedTitle) === 1 ? undefined : entryIndex),
        score
      };
    })
    .filter((option) => !normalizedQuery || option.score < 2)
    .sort((left, right) => left.score - right.score || left.entryIndex - right.entryIndex)
    .slice(0, limit)
    .map(({ score: _score, ...option }) => option);
}

export function insertLorebookMention(
  value: string,
  range: LorebookMentionRange,
  option: LorebookMentionOption
): { value: string; cursor: number } {
  const suffix = value.slice(range.end);
  const separator = /^\s/u.test(suffix) ? "" : " ";
  const nextValue = `${value.slice(0, range.start)}${option.token}${separator}${suffix}`;
  return { value: nextValue, cursor: range.start + option.token.length + separator.length };
}

function formatLorebookMention(title: string, duplicateIndex?: number): string {
  const escapedTitle = title.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"');
  return `@"${escapedTitle}"${duplicateIndex === undefined ? "" : `#${duplicateIndex + 1}`}`;
}

function normalizeSearchText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/gu, "");
}
