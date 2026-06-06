import { buildPromptPreview } from "./promptPreview";
import type { CardAsset, CharacterCardV3, LorebookEntry } from "./schema";
import { estimateTokens } from "./tokenEstimate";

export type TokenStatSectionId = "basic" | "prompts" | "greetings" | "lorebook" | "assets";

export interface TokenStatItem {
  id: string;
  sectionId: TokenStatSectionId;
  label: string;
  path: string;
  tokens: number;
  characters: number;
}

export interface TokenStatSection {
  id: TokenStatSectionId;
  tokens: number;
  characters: number;
  items: TokenStatItem[];
}

export interface GreetingPreviewTokenStat {
  id: string;
  label: string;
  greetingTokens: number;
  promptTokens: number;
  characters: number;
}

export interface LorebookEntryTokenStat {
  id: string;
  index: number;
  title: string;
  enabled: boolean;
  insertionOrder: number;
  contentTokens: number;
  keyTokens: number;
  memoTokens: number;
  totalTokens: number;
  characters: number;
}

export interface AssetTokenSummary {
  countedReferences: number;
  skippedDataUris: number;
}

export interface CardTokenStats {
  totalTokens: number;
  totalCharacters: number;
  sections: TokenStatSection[];
  largestFields: TokenStatItem[];
  greetingPreviews: GreetingPreviewTokenStat[];
  promptPreviewMaxTokens: number;
  lorebookEntries: LorebookEntryTokenStat[];
  enabledLorebookEntries: number;
  disabledLorebookEntries: number;
  assetSummary: AssetTokenSummary;
}

const sectionIds: TokenStatSectionId[] = ["basic", "prompts", "greetings", "lorebook", "assets"];

export function buildCardTokenStats(card: CharacterCardV3, largestFieldLimit = 8): CardTokenStats {
  const items: TokenStatItem[] = [];
  const data = card.data;

  addItem(items, "basic", "name", "/name", data.name);
  addItem(items, "basic", "nickname", "/nickname", data.nickname);
  addItem(items, "basic", "creator", "/creator", data.creator);
  addItem(items, "basic", "characterVersion", "/character_version", data.character_version);
  addItem(items, "basic", "tags", "/tags", data.tags.join("\n"));
  addItem(items, "basic", "source", "/source", data.source?.join("\n"));
  addItem(items, "basic", "creatorNotes", "/creator_notes", data.creator_notes);
  addItem(items, "basic", "creatorNotesMultilingual", "/creator_notes_multilingual", joinRecordValues(data.creator_notes_multilingual));

  addItem(items, "prompts", "description", "/description", data.description);
  addItem(items, "prompts", "personality", "/personality", data.personality);
  addItem(items, "prompts", "scenario", "/scenario", data.scenario);
  addItem(items, "prompts", "systemPrompt", "/system_prompt", data.system_prompt);
  addItem(items, "prompts", "postHistoryInstructions", "/post_history_instructions", data.post_history_instructions);
  addItem(items, "prompts", "messageExample", "/mes_example", data.mes_example);

  addItem(items, "greetings", "firstMessage", "/first_mes", data.first_mes);
  data.alternate_greetings.forEach((value, index) => {
    addItem(items, "greetings", `alternateGreeting ${index + 1}`, `/alternate_greetings/${index}`, value);
  });
  data.group_only_greetings.forEach((value, index) => {
    addItem(items, "greetings", `groupGreeting ${index + 1}`, `/group_only_greetings/${index}`, value);
  });

  const lorebook = data.character_book;
  if (lorebook) {
    addItem(items, "lorebook", "lorebookName", "/character_book/name", lorebook.name);
    addItem(items, "lorebook", "lorebookDescription", "/character_book/description", lorebook.description);
    lorebook.entries.forEach((entry, index) => {
      addLorebookEntryItems(items, entry, index);
    });
  }

  const assetSummary = addAssetItems(items, data.assets ?? []);
  const sections = sectionIds.map((id) => buildSection(id, items));
  const totalTokens = sections.reduce((sum, section) => sum + section.tokens, 0);
  const totalCharacters = sections.reduce((sum, section) => sum + section.characters, 0);
  const greetingPreviews = buildGreetingPreviews(card);
  const promptPreviewMaxTokens = greetingPreviews.reduce((max, item) => Math.max(max, item.promptTokens), 0);
  const lorebookEntries = buildLorebookEntryStats(lorebook?.entries ?? []);
  const enabledLorebookEntries = lorebookEntries.filter((entry) => entry.enabled).length;

  return {
    totalTokens,
    totalCharacters,
    sections,
    largestFields: items
      .filter((item) => item.tokens > 0)
      .sort((left, right) => right.tokens - left.tokens || right.characters - left.characters)
      .slice(0, largestFieldLimit),
    greetingPreviews,
    promptPreviewMaxTokens,
    lorebookEntries,
    enabledLorebookEntries,
    disabledLorebookEntries: lorebookEntries.length - enabledLorebookEntries,
    assetSummary,
  };
}

function addItem(items: TokenStatItem[], sectionId: TokenStatSectionId, label: string, path: string, value: string | undefined): void {
  const text = value ?? "";
  items.push({
    id: `${sectionId}:${path}`,
    sectionId,
    label,
    path,
    tokens: estimateTokens(text),
    characters: text.length,
  });
}

function addLorebookEntryItems(items: TokenStatItem[], entry: LorebookEntry, index: number): void {
  const basePath = `/character_book/entries/${index}`;
  addItem(items, "lorebook", `entry ${index + 1} memo`, `${basePath}/comment`, entry.comment ?? entry.name);
  addItem(items, "lorebook", `entry ${index + 1} keys`, `${basePath}/keys`, entry.keys.join("\n"));
  addItem(items, "lorebook", `entry ${index + 1} secondaryKeys`, `${basePath}/secondary_keys`, entry.secondary_keys?.join("\n"));
  addItem(items, "lorebook", `entry ${index + 1} content`, `${basePath}/content`, entry.content);
}

function addAssetItems(items: TokenStatItem[], assets: CardAsset[]): AssetTokenSummary {
  let skippedDataUris = 0;
  let countedReferences = 0;

  assets.forEach((asset, index) => {
    const uri = typeof asset.uri === "string" ? asset.uri : "";
    const uriText = uri.startsWith("data:") ? "" : uri;
    if (uri.startsWith("data:")) {
      skippedDataUris += 1;
    } else if (uriText.trim()) {
      countedReferences += 1;
    }
    addItem(items, "assets", `asset ${index + 1}`, `/assets/${index}`, [asset.type, asset.name, asset.ext, uriText].filter(Boolean).join("\n"));
  });

  return { countedReferences, skippedDataUris };
}

function buildSection(id: TokenStatSectionId, items: TokenStatItem[]): TokenStatSection {
  const sectionItems = items.filter((item) => item.sectionId === id);
  return {
    id,
    items: sectionItems,
    tokens: sectionItems.reduce((sum, item) => sum + item.tokens, 0),
    characters: sectionItems.reduce((sum, item) => sum + item.characters, 0),
  };
}

function buildGreetingPreviews(card: CharacterCardV3): GreetingPreviewTokenStat[] {
  const greetings = [
    { label: "firstMessage", value: card.data.first_mes },
    ...card.data.alternate_greetings.map((value, index) => ({ label: `alternateGreeting ${index + 1}`, value })),
    ...card.data.group_only_greetings.map((value, index) => ({ label: `groupGreeting ${index + 1}`, value })),
  ];

  return greetings.map((greeting, index) => {
    const prompt = buildPromptPreview(card, greeting.value);
    return {
      id: `greeting-preview-${index}`,
      label: greeting.label,
      greetingTokens: estimateTokens(greeting.value),
      promptTokens: estimateTokens(prompt),
      characters: prompt.length,
    };
  });
}

function buildLorebookEntryStats(entries: LorebookEntry[]): LorebookEntryTokenStat[] {
  return entries.map((entry, index) => {
    const memo = entry.comment ?? entry.name ?? "";
    const keys = [...entry.keys, ...(entry.secondary_keys ?? [])].join("\n");
    const contentTokens = estimateTokens(entry.content);
    const keyTokens = estimateTokens(keys);
    const memoTokens = estimateTokens(memo);
    return {
      id: String(entry.id ?? index),
      index,
      title: memo.trim() || entry.keys[0] || `Entry ${index + 1}`,
      enabled: entry.enabled,
      insertionOrder: entry.insertion_order,
      contentTokens,
      keyTokens,
      memoTokens,
      totalTokens: contentTokens + keyTokens + memoTokens,
      characters: entry.content.length + keys.length + memo.length,
    };
  });
}

function joinRecordValues(value: Record<string, string> | undefined): string {
  if (!value) {
    return "";
  }
  return Object.entries(value)
    .map(([locale, text]) => `${locale}\n${text}`)
    .join("\n");
}
