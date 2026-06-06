import { z } from "zod";

export type CardSpec = "chara_card_v3";
export type CardSpecVersion = "3.0";

export interface CharacterCardV3 {
  spec: CardSpec;
  spec_version: CardSpecVersion | string;
  data: CharacterCardData;
  [key: string]: unknown;
}

export interface CharacterCardData {
  name: string;
  description: string;
  tags: string[];
  creator: string;
  character_version: string;
  mes_example: string;
  extensions: Record<string, unknown>;
  system_prompt: string;
  post_history_instructions: string;
  first_mes: string;
  alternate_greetings: string[];
  personality: string;
  scenario: string;
  creator_notes: string;
  character_book?: Lorebook;
  assets?: CardAsset[];
  nickname?: string;
  creator_notes_multilingual?: Record<string, string>;
  source?: string[];
  group_only_greetings: string[];
  creation_date?: number;
  modification_date?: number;
  [key: string]: unknown;
}

export interface CardAsset {
  type: string;
  uri: string;
  name: string;
  ext: string;
  [key: string]: unknown;
}

export interface Lorebook {
  name?: string;
  description?: string;
  scan_depth?: number;
  token_budget?: number;
  recursive_scanning?: boolean;
  extensions: Record<string, unknown>;
  entries: LorebookEntry[];
  [key: string]: unknown;
}

export interface LorebookEntry {
  keys: string[];
  content: string;
  extensions: Record<string, unknown>;
  enabled: boolean;
  insertion_order: number;
  case_sensitive?: boolean;
  use_regex: boolean;
  constant?: boolean;
  name?: string;
  priority?: number;
  id?: number | string;
  comment?: string;
  selective?: boolean;
  secondary_keys?: string[];
  position?: "before_char" | "after_char";
  [key: string]: unknown;
}

export interface ValidationIssue {
  level: "error" | "warning";
  code: string;
  path: string;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ParsedCard {
  card: CharacterCardV3;
  report: ValidationReport;
  warnings: string[];
  source_format: "v3" | "v2" | "v1" | "png-ccv3" | "png-chara" | "png-asset" | "charx";
  asset_files?: Array<{ path: string; name: string; ext: string }>;
}

export const cardAssetSchema = z
  .object({
    type: z.string(),
    uri: z.string(),
    name: z.string(),
    ext: z.string(),
  })
  .passthrough();

export const lorebookEntrySchema = z
  .object({
    keys: z.array(z.string()),
    content: z.string(),
    extensions: z.record(z.unknown()).default({}),
    enabled: z.boolean().default(true),
    insertion_order: z.number().int(),
    case_sensitive: z.boolean().optional(),
    use_regex: z.boolean(),
    constant: z.boolean().optional(),
    name: z.string().optional(),
    priority: z.number().optional(),
    id: z.union([z.number(), z.string()]).optional(),
    comment: z.string().optional(),
    selective: z.boolean().optional(),
    secondary_keys: z.array(z.string()).optional(),
    position: z.enum(["before_char", "after_char"]).optional(),
  })
  .passthrough();

export const lorebookSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    scan_depth: z.number().optional(),
    token_budget: z.number().optional(),
    recursive_scanning: z.boolean().optional(),
    extensions: z.record(z.unknown()).default({}),
    entries: z.array(lorebookEntrySchema),
  })
  .passthrough();

export const characterCardDataSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    tags: z.array(z.string()),
    creator: z.string(),
    character_version: z.string(),
    mes_example: z.string(),
    extensions: z.record(z.unknown()),
    system_prompt: z.string(),
    post_history_instructions: z.string(),
    first_mes: z.string(),
    alternate_greetings: z.array(z.string()),
    personality: z.string(),
    scenario: z.string(),
    creator_notes: z.string(),
    character_book: lorebookSchema.optional(),
    assets: z.array(cardAssetSchema).optional(),
    nickname: z.string().optional(),
    creator_notes_multilingual: z.record(z.string()).optional(),
    source: z.array(z.string()).optional(),
    group_only_greetings: z.array(z.string()),
    creation_date: z.number().int().optional(),
    modification_date: z.number().int().optional(),
  })
  .passthrough();

export const characterCardV3Schema = z
  .object({
    spec: z.literal("chara_card_v3"),
    spec_version: z.string(),
    data: characterCardDataSchema,
  })
  .passthrough();

export const lorebookEnvelopeSchema = z
  .object({
    spec: z.literal("lorebook_v3"),
    data: lorebookSchema,
  })
  .passthrough();

export const unixNow = (): number => Math.floor(Date.now() / 1000);

export const defaultAssetPreview: CardAsset = {
  type: "icon",
  uri: "ccdefault:",
  name: "main",
  ext: "png",
};

export function createBlankCard(now = unixNow()): CharacterCardV3 {
  return {
    spec: "chara_card_v3",
    spec_version: "3.0",
    data: {
      name: "",
      description: "",
      tags: [],
      creator: "",
      character_version: "",
      mes_example: "",
      extensions: {},
      system_prompt: "",
      post_history_instructions: "",
      first_mes: "",
      alternate_greetings: [],
      personality: "",
      scenario: "",
      creator_notes: "",
      group_only_greetings: [],
      creation_date: now,
      modification_date: now,
    },
  };
}

export function createBlankLorebook(): Lorebook {
  return {
    extensions: {},
    entries: [],
  };
}

export function createBlankLorebookEntry(order: number): LorebookEntry {
  const title = `Entry ${order + 1}`;
  return {
    keys: [],
    content: "",
    extensions: {},
    enabled: true,
    insertion_order: order,
    comment: title,
    use_regex: false,
  };
}
