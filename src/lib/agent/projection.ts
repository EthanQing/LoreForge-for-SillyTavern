import type { CharacterCardV3, LorebookEntry } from "../schema";
import { deriveLorebookEntryComment } from "../lorebookCompat";
import type { AgentPermission, CardFieldPath } from "./permissions";

export interface AgentCardProjection {
  cardRevision: number;
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
  lorebook: AgentLorebookProjection;
}

export interface AgentLorebookProjection {
  name?: string;
  description?: string;
  scanDepth?: number;
  tokenBudget?: number;
  recursiveScanning?: boolean;
  entries: AgentLorebookEntryProjection[];
}

export interface AgentLorebookEntryProjection {
  index: number;
  id?: string | number;
  fingerprint: string;
  comment: string;
  keys: string[];
  secondaryKeys: string[];
  content: string;
  enabled: boolean;
  useRegex: boolean;
  selective: boolean;
  triggerStrategy: "keyword" | "constant" | "vectorized";
  insertionPosition?: number;
  role?: number;
  depth?: number;
  insertionOrder: number;
  probability?: number;
  priority?: number;
  caseSensitive?: boolean;
  outletName?: string;
}

export function projectCard(card: CharacterCardV3, cardRevision: number): AgentCardProjection {
  const data = card.data;
  const book = data.character_book;
  return {
    cardRevision,
    name: data.name,
    description: data.description,
    personality: data.personality,
    scenario: data.scenario,
    firstMessage: data.first_mes,
    alternateGreetings: [...data.alternate_greetings],
    exampleDialogue: data.mes_example,
    creatorNotes: data.creator_notes,
    systemPrompt: data.system_prompt,
    postHistoryInstructions: data.post_history_instructions,
    tags: [...data.tags],
    creator: data.creator,
    characterVersion: data.character_version,
    lorebook: {
      name: book?.name,
      description: book?.description,
      scanDepth: book?.scan_depth,
      tokenBudget: book?.token_budget,
      recursiveScanning: book?.recursive_scanning,
      entries: book?.entries.map(projectLorebookEntry) ?? []
    }
  };
}

export function projectCardForPermission(card: CharacterCardV3, cardRevision: number, permission: AgentPermission): unknown {
  const projection = projectCard(card, cardRevision);
  const scope = permission.scope;
  if (scope.kind === "card") return projection;
  if (scope.kind === "lorebook") return { cardRevision, lorebook: projection.lorebook };
  if (scope.kind === "lorebookEntry") return { cardRevision, entry: projection.lorebook.entries[scope.index] };
  if (scope.kind === "lorebookEntries") return { cardRevision, entries: scope.entries.map((entry) => projection.lorebook.entries[entry.index]) };
  if (scope.kind === "field") return { cardRevision, path: scope.path, value: readProjectedField(projection, scope.path) };
  const fields = scope.section === "basic"
    ? ["name", "creatorNotes", "tags", "creator", "characterVersion"]
    : scope.section === "prompts"
      ? ["description", "personality", "scenario", "exampleDialogue", "systemPrompt", "postHistoryInstructions"]
      : ["firstMessage", "alternateGreetings"];
  return { cardRevision, ...Object.fromEntries(fields.map((field) => [field, projection[field as keyof AgentCardProjection]])) };
}

export function projectLorebookEntry(entry: LorebookEntry, index: number): AgentLorebookEntryProjection {
  const extensions = entry.extensions ?? {};
  const vectorized = extensions.vectorized === true;
  return {
    index,
    id: entry.id,
    fingerprint: stableHash(entry),
    comment: deriveLorebookEntryComment(entry, index),
    keys: [...entry.keys],
    secondaryKeys: [...(entry.secondary_keys ?? [])],
    content: entry.content,
    enabled: entry.enabled !== false,
    useRegex: entry.use_regex === true,
    selective: entry.selective === true,
    triggerStrategy: entry.constant === true ? "constant" : vectorized ? "vectorized" : "keyword",
    insertionPosition: finiteInteger(extensions.position),
    role: finiteInteger(extensions.role),
    depth: finiteInteger(extensions.depth),
    insertionOrder: entry.insertion_order,
    probability: finiteInteger(extensions.probability),
    priority: finiteInteger(entry.priority),
    caseSensitive: typeof entry.case_sensitive === "boolean" ? entry.case_sensitive : undefined,
    outletName: typeof extensions.outlet_name === "string" ? extensions.outlet_name : undefined
  };
}

export function stableHash(value: unknown): string {
  const source = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function readProjectedField(card: AgentCardProjection, path: string): unknown {
  if (path.startsWith("/alternateGreetings/")) {
    return card.alternateGreetings[Number(path.split("/")[2])];
  }
  const key = path.slice(1) as keyof AgentCardProjection;
  return card[key];
}

function finiteInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : undefined;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}
