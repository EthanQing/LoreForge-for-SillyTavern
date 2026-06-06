import {
  CharacterCardData,
  CharacterCardV3,
  Lorebook,
  LorebookEntry,
  createBlankCard,
  unixNow,
} from "./schema";
import { translate } from "./i18n";
import { normalizeLorebookForSillyTavern } from "./lorebookCompat";

export interface MigrationResult {
  card: CharacterCardV3;
  warnings: string[];
  sourceFormat: "v3" | "v2" | "v1";
}

const stringFields: Array<keyof CharacterCardData> = [
  "name",
  "description",
  "creator",
  "character_version",
  "mes_example",
  "system_prompt",
  "post_history_instructions",
  "first_mes",
  "personality",
  "scenario",
  "creator_notes",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : undefined;
}

function normalizeLorebookEntry(raw: unknown, index: number): LorebookEntry {
  const base: LorebookEntry = {
    keys: [],
    content: "",
    extensions: {},
    enabled: true,
    insertion_order: index,
    use_regex: false,
  };
  if (!isRecord(raw)) {
    return base;
  }
  return {
    ...raw,
    keys: asStringArray(raw.keys),
    secondary_keys: raw.secondary_keys === undefined ? undefined : asStringArray(raw.secondary_keys),
    content: asString(raw.content),
    extensions: isRecord(raw.extensions) ? raw.extensions : {},
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    insertion_order: asNumber(raw.insertion_order) ?? index,
    use_regex: typeof raw.use_regex === "boolean" ? raw.use_regex : false,
  } as LorebookEntry;
}

export function normalizeLorebook(raw: unknown): Lorebook | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const entries = Array.isArray(raw.entries) ? raw.entries.map(normalizeLorebookEntry) : [];
  return {
    ...raw,
    extensions: isRecord(raw.extensions) ? raw.extensions : {},
    entries,
  } as Lorebook;
}

function normalizeData(raw: unknown, now: number): CharacterCardData {
  const defaults = createBlankCard(now).data;
  if (!isRecord(raw)) {
    return defaults;
  }
  const data: CharacterCardData = {
    ...defaults,
    ...raw,
    tags: asStringArray(raw.tags),
    alternate_greetings: asStringArray(raw.alternate_greetings),
    group_only_greetings: asStringArray(raw.group_only_greetings),
    source: raw.source === undefined ? undefined : asStringArray(raw.source),
    extensions: isRecord(raw.extensions) ? raw.extensions : {},
    assets: Array.isArray(raw.assets)
      ? raw.assets.filter(isRecord).map((asset) => ({
          ...asset,
          type: asString(asset.type),
          uri: asString(asset.uri),
          name: asString(asset.name),
          ext: asString(asset.ext).replace(/^\./, "").toLowerCase() || "unknown",
        }))
      : undefined,
    character_book: normalizeLorebook(raw.character_book),
    creator_notes_multilingual: isRecord(raw.creator_notes_multilingual)
      ? Object.fromEntries(
          Object.entries(raw.creator_notes_multilingual).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : undefined,
    creation_date: asNumber(raw.creation_date) ?? now,
    modification_date: asNumber(raw.modification_date) ?? now,
  };

  for (const field of stringFields) {
    data[field] = asString(raw[field]) as never;
  }

  return data;
}

function isV1(raw: Record<string, unknown>): boolean {
  return (
    raw.spec === undefined &&
    ["name", "description", "personality", "scenario", "first_mes", "mes_example"].some(
      (field) => typeof raw[field] === "string",
    )
  );
}

export function migrateToV3(input: unknown, now = unixNow()): MigrationResult {
  const warnings: string[] = [];
  if (!isRecord(input)) {
    throw new Error(translate("migration.notCardObject"));
  }

  if (input.spec === "chara_card_v3") {
    const card: CharacterCardV3 = {
      ...input,
      spec: "chara_card_v3",
      spec_version: asString(input.spec_version) || "3.0",
      data: normalizeData(input.data, now),
    };
    const versionNumber = Number.parseFloat(card.spec_version);
    if (Number.isFinite(versionNumber) && versionNumber > 3) {
      warnings.push(translate("migration.newerSpec"));
    }
    return { card, warnings, sourceFormat: "v3" };
  }

  if (input.spec === "chara_card_v2") {
    warnings.push(translate("migration.v2"));
    return {
      card: {
        ...input,
        spec: "chara_card_v3",
        spec_version: "3.0",
        data: normalizeData(input.data, now),
      },
      warnings,
      sourceFormat: "v2",
    };
  }

  if (isV1(input)) {
    const unknownFields = Object.fromEntries(
      Object.entries(input).filter(
        ([key]) => !["name", "description", "personality", "scenario", "first_mes", "mes_example"].includes(key),
      ),
    );
    const card = createBlankCard(now);
    card.data = {
      ...card.data,
      name: asString(input.name),
      description: asString(input.description),
      personality: asString(input.personality),
      scenario: asString(input.scenario),
      first_mes: asString(input.first_mes),
      mes_example: asString(input.mes_example),
      extensions: Object.keys(unknownFields).length > 0 ? { imported_v1_fields: unknownFields } : {},
    };
    warnings.push(translate("migration.v1"));
    return { card, warnings, sourceFormat: "v1" };
  }

  throw new Error(translate("migration.unsupported"));
}

export function prepareCardForExport(card: CharacterCardV3, now = unixNow()): CharacterCardV3 {
  const data = normalizeData(card.data, now);
  return {
    ...card,
    spec: "chara_card_v3",
    spec_version: card.spec_version || "3.0",
    data: {
      ...data,
      character_book: normalizeLorebookForSillyTavern(data.character_book),
      modification_date: now,
    },
  };
}
