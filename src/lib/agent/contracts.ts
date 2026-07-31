import type { CharacterCardV3, ValidationReport } from "../schema";
import {
  applyAiPatches,
  buildAiAgentDiff,
  fromNormalizedAiCard,
  type AiAgentDiff,
  type AiPatch,
  type NormalizedAiCard,
  toNormalizedAiCard
} from "../aiAgent";
import { validateCard } from "../validation";

export interface AiConnectionProfile {
  id: string;
  kind: "deepseek" | "openai-compatible";
  baseUrl: string;
  model: string;
  credentialId: string;
  contextWindow: number;
  maxOutputTokens: number;
  timeoutMs: number;
  temperature: number;
  thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  toolCalling: "unknown" | "supported" | "unsupported";
  allowInsecureHttp: boolean;
}

export type ProposalState = "pending" | "applied" | "discarded" | "conflicted";

export interface CardProposalGuard {
  path: string;
  valueHash: string;
}

export interface CardProposal {
  id: string;
  workspaceId: string;
  sessionId: string;
  toolCallId: string;
  summary: string;
  patches: AiPatch[];
  allowedPaths: string[];
  baseCardHash: string;
  baseCardRevision: number;
  guards: CardProposalGuard[];
  diffs: AiAgentDiff[];
  validationReport: ValidationReport;
  state: ProposalState;
  saveState: "not-needed" | "saved" | "draft-only" | "failed";
  createdAt: number;
  updatedAt: number;
}

export interface ProposalCreationInput {
  workspaceId: string;
  sessionId: string;
  toolCallId: string;
  summary: string;
  patches: AiPatch[];
  allowedPaths: string[];
  card: CharacterCardV3;
  cardRevision: number;
  id?: string;
  now?: number;
}

export type ProposalApplyResult =
  | { state: "applied"; card: CharacterCardV3; validationReport: ValidationReport }
  | { state: "conflicted"; reasons: string[]; validationReport: ValidationReport }
  | { state: "blocked"; reasons: string[]; validationReport: ValidationReport };

export function createCardProposal(input: ProposalCreationInput): CardProposal {
  const before = toNormalizedAiCard(input.card);
  assertAllowedPatches(input.patches, input.allowedPaths);
  const after = applyAiPatches(before, input.patches);
  const nextCard = fromNormalizedAiCard(after, input.card);
  const validationReport = validateCard(nextCard);
  const now = input.now ?? Date.now();
  const guards = affectedPaths(input.patches).map((path) => ({
    path,
    valueHash: stableHash(readPath(before, path))
  }));

  return {
    id: input.id ?? createId("proposal"),
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    toolCallId: input.toolCallId,
    summary: input.summary,
    patches: input.patches.map((patch) => ({ ...patch })),
    allowedPaths: [...input.allowedPaths],
    baseCardHash: stableHash(before),
    baseCardRevision: input.cardRevision,
    guards,
    diffs: buildAiAgentDiff(before, after),
    validationReport,
    state: "pending",
    saveState: "not-needed",
    createdAt: now,
    updatedAt: now
  };
}

export function applyCardProposal(proposal: CardProposal, card: CharacterCardV3): ProposalApplyResult {
  const before = toNormalizedAiCard(card);
  const changedPaths = proposal.guards
    .filter((guard) => stableHash(readPath(before, guard.path)) !== guard.valueHash)
    .map((guard) => guard.path);

  if (changedPaths.length > 0) {
    return {
      state: "conflicted",
      reasons: changedPaths.map((path) => `受影响字段已发生变化：${path}`),
      validationReport: validateCard(card)
    };
  }

  try {
    assertAllowedPatches(proposal.patches, proposal.allowedPaths);
    const after = applyAiPatches(before, proposal.patches);
    const nextCard = fromNormalizedAiCard(after, card);
    const validationReport = validateCard(nextCard);
    if (validationReport.errors.length > 0) {
      return {
        state: "blocked",
        reasons: validationReport.errors.map((error) => error.message),
        validationReport
      };
    }
    return { state: "applied", card: nextCard, validationReport };
  } catch (error) {
    return {
      state: "blocked",
      reasons: [error instanceof Error ? error.message : String(error)],
      validationReport: validateCard(card)
    };
  }
}

export function assertAllowedPatches(patches: AiPatch[], allowedPaths: string[]): void {
  for (const patch of patches) {
    if (!allowedPaths.some((allowedPath) => patch.path === allowedPath || patch.path.startsWith(`${allowedPath}/`))) {
      throw new Error(`Patch path is outside the approved scope: ${patch.path}`);
    }
  }
}

export function affectedPaths(patches: AiPatch[]): string[] {
  return [...new Set(patches.map((patch) => patch.path))];
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

export function readPath(value: NormalizedAiCard, path: string): unknown {
  if (!path.startsWith("/")) {
    return undefined;
  }
  return path
    .slice(1)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce<unknown>((current, segment) => {
      if (Array.isArray(current)) {
        const index = Number(segment);
        return Number.isInteger(index) ? current[index] : undefined;
      }
      if (current && typeof current === "object") {
        return (current as Record<string, unknown>)[segment];
      }
      return undefined;
    }, value);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function createId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
