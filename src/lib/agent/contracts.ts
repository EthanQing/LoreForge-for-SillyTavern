import type { CharacterCardV3, ValidationReport } from "../schema";
import { validateCard } from "../validation";
import { applyAgentChanges, assertAgentChangesAllowed, buildAgentDiff, type AgentChange, type AgentDiff } from "./changes";
import { normalizeAgentPermission, samePermission, type AgentPermission } from "./permissions";
import { stableHash } from "./projection";

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

export interface CardProposal {
  schemaVersion: 1;
  id: string;
  workspaceId: string;
  sessionId: string;
  toolCallId: string;
  summary: string;
  permission: AgentPermission;
  changes: AgentChange[];
  selectedCandidateIds: string[];
  baseCardHash: string;
  baseCardRevision: number;
  diffs: AgentDiff[];
  validationReport: ValidationReport;
  state: ProposalState;
  saveState: "not-needed" | "saved" | "draft-only" | "failed";
  rollbackCard?: CharacterCardV3;
  createdAt: number;
  updatedAt: number;
}

export interface ProposalCreationInput {
  workspaceId: string;
  sessionId: string;
  toolCallId: string;
  summary: string;
  permission: AgentPermission;
  changes: AgentChange[];
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
  if (input.changes.length === 0) throw new Error("提案至少需要一个语义变更。");
  assertAgentChangesAllowed(input.card, input.changes, input.permission);
  const candidateIds = input.changes.flatMap((change) => change.kind === "lorebookInjection" ? change.candidates.map((candidate) => candidate.candidateId) : []);
  const after = applyAgentChanges(input.card, input.changes, input.permission, candidateIds.length ? candidateIds : undefined);
  const validationReport = validateCard(after);
  const now = input.now ?? Date.now();
  return {
    schemaVersion: 1,
    id: input.id ?? createId("proposal"),
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    toolCallId: input.toolCallId,
    summary: input.summary,
    permission: clone(input.permission),
    changes: clone(input.changes),
    selectedCandidateIds: [],
    baseCardHash: stableHash(input.card),
    baseCardRevision: input.cardRevision,
    diffs: buildAgentDiff(input.card, after),
    validationReport,
    state: "pending",
    saveState: "not-needed",
    createdAt: now,
    updatedAt: now
  };
}

export function applyCardProposal(
  proposal: CardProposal,
  card: CharacterCardV3,
  cardRevision: number,
  selectedCandidateIds = proposal.selectedCandidateIds
): ProposalApplyResult {
  if (proposal.schemaVersion !== 1) {
    return conflicted(card, ["提案契约版本已失效，请重新生成。"]);
  }
  if (cardRevision !== proposal.baseCardRevision || stableHash(card) !== proposal.baseCardHash) {
    return conflicted(card, [`卡片已从 revision ${proposal.baseCardRevision} 更新到 ${cardRevision}，请重新读取后生成提案。`]);
  }
  try {
    const hasInjection = proposal.changes.some((change) => change.kind === "lorebookInjection");
    const nextCard = applyAgentChanges(card, proposal.changes, proposal.permission, hasInjection ? selectedCandidateIds : undefined);
    const validationReport = validateCard(nextCard);
    if (validationReport.errors.length > 0) {
      return { state: "blocked", reasons: validationReport.errors.map((error) => error.message), validationReport };
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

export function isCardProposal(value: unknown): value is CardProposal {
  if (!value || typeof value !== "object") return false;
  const proposal = value as Record<string, unknown>;
  const permission = normalizeAgentPermission(proposal.permission);
  return proposal.schemaVersion === 1
    && ["pending", "applied", "discarded", "conflicted"].includes(String(proposal.state))
    && typeof proposal.id === "string"
    && typeof proposal.workspaceId === "string"
    && typeof proposal.sessionId === "string"
    && typeof proposal.toolCallId === "string"
    && typeof proposal.summary === "string"
    && typeof proposal.baseCardHash === "string"
    && Number.isInteger(proposal.baseCardRevision)
    && Array.isArray(proposal.selectedCandidateIds)
    && proposal.selectedCandidateIds.every((id) => typeof id === "string")
    && Array.isArray(proposal.changes)
    && proposal.changes.every(isAgentChange)
    && Array.isArray(proposal.diffs)
    && Boolean(permission && samePermission(permission, proposal.permission as AgentPermission));
}

function isAgentChange(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const change = value as Record<string, unknown>;
  if (change.kind === "cardEdit") return Array.isArray(change.edits);
  if (change.kind === "lorebookEntryEdit") return Boolean(change.edit && typeof change.edit === "object");
  return change.kind === "lorebookInjection" && Array.isArray(change.candidates);
}

function conflicted(card: CharacterCardV3, reasons: string[]): ProposalApplyResult {
  return { state: "conflicted", reasons, validationReport: validateCard(card) };
}

function createId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function clone<T>(value: T): T {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
}
