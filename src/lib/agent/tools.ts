import { type AgentTool, type AgentToolResult } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import type { CharacterCardV3, ValidationIssue, ValidationReport } from "../schema";
import { buildCardTokenStats, type TokenStatItem } from "../tokenStats";
import { createCardProposal, type CardProposal } from "./contracts";
import type { AgentChange, CardFieldEdit, LorebookCandidate, LorebookEntryFields } from "./changes";
import { canEditLorebookEntry, canReadLorebook, type AgentPermission, CARD_FIELD_PATHS } from "./permissions";
import { projectCard, projectCardForPermission, stableHash } from "./projection";

export interface CardAgentSnapshot {
  card: CharacterCardV3;
  workspaceId: string;
  cardRevision: number;
  report: ValidationReport;
}

export interface CardAgentToolContext {
  getSnapshot: () => CardAgentSnapshot;
  getSessionId: () => string;
  getPermission: () => AgentPermission;
  setProposal?: (proposal: CardProposal) => void;
}

type TextResult<T> = AgentToolResult<T>;

const cardPathSchema = Type.Union([...CARD_FIELD_PATHS.map((path) => Type.Literal(path)), Type.String({ pattern: "^/alternateGreetings/[0-9]+$" })]);
const triggerSchema = Type.Union([Type.Literal("keyword"), Type.Literal("constant"), Type.Literal("vectorized")]);
const lorebookFieldsSchema = Type.Object({
  comment: Type.Optional(Type.String({ maxLength: 100 })),
  keys: Type.Optional(Type.Array(Type.String(), { maxItems: 64 })),
  secondaryKeys: Type.Optional(Type.Array(Type.String(), { maxItems: 64 })),
  content: Type.Optional(Type.String({ maxLength: 200_000 })),
  enabled: Type.Optional(Type.Boolean()),
  useRegex: Type.Optional(Type.Boolean()),
  selective: Type.Optional(Type.Boolean()),
  triggerStrategy: Type.Optional(triggerSchema),
  insertionPosition: Type.Optional(Type.Integer({ minimum: 0, maximum: 7 })),
  role: Type.Optional(Type.Integer({ minimum: 0, maximum: 2 })),
  depth: Type.Optional(Type.Integer({ minimum: 0, maximum: 10_000 })),
  insertionOrder: Type.Optional(Type.Integer()),
  probability: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
  priority: Type.Optional(Type.Integer()),
  caseSensitive: Type.Optional(Type.Boolean()),
  outletName: Type.Optional(Type.String({ maxLength: 200 }))
}, { additionalProperties: false });

function result<T>(details: T, text?: string): TextResult<T> {
  return { content: [{ type: "text", text: text ?? JSON.stringify(details) }], details };
}

export function createCardAgentTools(context: CardAgentToolContext): AgentTool[] {
  return [
    createInspectCardTool(context),
    createInspectLorebookEntryTool(context),
    createInspectValidationTool(context),
    createInspectTokenUsageTool(context),
    createProposeCardEditsTool(context),
    createProposeLorebookEntryEditsTool(context),
    createProposeLorebookInjectionTool(context)
  ];
}

function createInspectCardTool(context: CardAgentToolContext): AgentTool {
  return {
    name: "inspect_card",
    label: "读取授权卡片范围",
    description: "读取当前请求已授权的 CCv3 卡片投影以及 cardRevision。返回范围由前端权限决定，模型不能扩大。",
    parameters: Type.Object({}),
    execute: async () => {
      const snapshot = context.getSnapshot();
      return result(projectCardForPermission(snapshot.card, snapshot.cardRevision, context.getPermission()));
    }
  };
}

function createInspectLorebookEntryTool(context: CardAgentToolContext): AgentTool {
  return {
    name: "inspect_lorebook_entry",
    label: "读取世界书条目",
    description: "按序号读取一个授权范围内的世界书条目，返回条目 fingerprint 和 cardRevision。",
    parameters: Type.Object({ index: Type.Integer({ minimum: 0 }) }),
    execute: async (_toolCallId, params) => {
      const { index } = params as { index: number };
      const snapshot = context.getSnapshot();
      const entry = projectCard(snapshot.card, snapshot.cardRevision).lorebook.entries[index];
      if (!entry) throw new Error("未找到世界书条目。");
      const permission = context.getPermission();
      if (!canReadLorebook(permission) || !canEditLorebookEntry(permission, index, entry.fingerprint)) {
        throw new Error("目标条目超出当前授权范围。");
      }
      return result({ cardRevision: snapshot.cardRevision, entry });
    }
  };
}

function createInspectValidationTool(context: CardAgentToolContext): AgentTool {
  return {
    name: "inspect_validation",
    label: "读取校验",
    description: "读取当前前端 CCv3 校验报告和 cardRevision；报告按当前权限过滤，逐项包含 level、code、path 和 message，供 Agent 解析原因并提出建议。",
    parameters: Type.Object({}),
    execute: async () => {
      const { report, cardRevision } = context.getSnapshot();
      return result({ cardRevision, report: filterValidationReport(report, context.getPermission()) });
    }
  };
}

function createInspectTokenUsageTool(context: CardAgentToolContext): AgentTool {
  return {
    name: "inspect_token_usage",
    label: "读取 Token 统计",
    description: "读取 Token 估算和 cardRevision。",
    parameters: Type.Object({}),
    execute: async () => {
      const snapshot = context.getSnapshot();
      return result({ cardRevision: snapshot.cardRevision, ...projectTokenUsage(snapshot.card, context.getPermission()) });
    }
  };
}

function filterValidationReport(report: ValidationReport, permission: AgentPermission): ValidationReport {
  const errors = report.errors.filter((issue) => permissionAllowsValidationIssue(permission, issue));
  const warnings = report.warnings.filter((issue) => permissionAllowsValidationIssue(permission, issue));
  return { valid: errors.length === 0, errors, warnings };
}

function permissionAllowsValidationIssue(permission: AgentPermission, issue: ValidationIssue): boolean {
  const { scope } = permission;
  if (scope.kind === "card") return true;
  if (scope.kind === "lorebook") return issue.path.startsWith("data.character_book");
  if (scope.kind === "lorebookEntry") {
    const prefix = `data.character_book.entries.${scope.index}.`;
    if (!issue.path.startsWith(prefix)) return false;
    return !scope.fields || scope.fields.some((field) => issue.path.startsWith(`${prefix}${rawLorebookField(field)}`));
  }
  if (scope.kind === "lorebookEntries") return scope.entries.some((entry) => permissionAllowsLorebookValidationIssue(entry, issue));
  if (scope.kind === "section") {
    const prefix = scope.section === "basic"
      ? ["data.name", "data.creator_notes", "data.tags", "data.creator", "data.character_version"]
      : scope.section === "prompts"
        ? ["data.description", "data.personality", "data.scenario", "data.mes_example", "data.system_prompt", "data.post_history_instructions"]
        : ["data.first_mes", "data.alternate_greetings"];
    return prefix.some((path) => issue.path.startsWith(path));
  }
  return validationPathForField(scope.path).some((path) => issue.path.startsWith(path));
}

function projectTokenUsage(card: CharacterCardV3, permission: AgentPermission) {
  const stats = buildCardTokenStats(card);
  const items = stats.sections.flatMap((section) => section.items).filter((item) => permissionAllowsTokenItem(permission, item));
  const sections = stats.sections.flatMap((section) => {
    const sectionItems = items.filter((item) => item.sectionId === section.id);
    return sectionItems.length ? [{
      id: section.id,
      tokens: sectionItems.reduce((sum, item) => sum + item.tokens, 0),
      characters: sectionItems.reduce((sum, item) => sum + item.characters, 0),
      items: sectionItems
    }] : [];
  });
  const scope = permission.scope;
  const lorebookEntries = scope.kind === "lorebookEntry" || scope.kind === "lorebookEntries"
    ? stats.lorebookEntries.filter((entry) => lorebookScopeEntries(scope).some((scopeEntry) => entry.index === scopeEntry.index))
    : scope.kind === "card" || scope.kind === "lorebook" ? stats.lorebookEntries : [];
  return {
    totalTokens: items.reduce((sum, item) => sum + item.tokens, 0),
    sections,
    largestFields: [...items].sort((left, right) => right.tokens - left.tokens).slice(0, 8),
    lorebookEntries,
    ...(permission.scope.kind === "card" ? { promptPreviewMaxTokens: stats.promptPreviewMaxTokens, assetSummary: stats.assetSummary } : {})
  };
}

function permissionAllowsTokenItem(permission: AgentPermission, item: TokenStatItem): boolean {
  const { scope } = permission;
  if (scope.kind === "card") return true;
  if (scope.kind === "lorebook") return item.sectionId === "lorebook";
  if (scope.kind === "lorebookEntry") {
    const prefix = `/character_book/entries/${scope.index}/`;
    if (!item.path.startsWith(prefix)) return false;
    return !scope.fields || scope.fields.some((field) => item.path.startsWith(`${prefix}${rawLorebookField(field)}`));
  }
  if (scope.kind === "lorebookEntries") return scope.entries.some((entry) => permissionAllowsLorebookTokenItem(entry, item));
  if (scope.kind === "section") return item.sectionId === scope.section;
  return tokenPathForField(scope.path).some((path) => item.path === path || item.path.startsWith(`${path}/`));
}

function validationPathForField(path: string): string[] {
  const tokenPaths = tokenPathForField(path);
  return tokenPaths.map((tokenPath) => `data${tokenPath.replaceAll("/", ".")}`);
}

function tokenPathForField(path: string): string[] {
  const mappings: Record<string, string> = {
    "/firstMessage": "/first_mes",
    "/alternateGreetings": "/alternate_greetings",
    "/exampleDialogue": "/mes_example",
    "/creatorNotes": "/creator_notes",
    "/systemPrompt": "/system_prompt",
    "/postHistoryInstructions": "/post_history_instructions",
    "/characterVersion": "/character_version"
  };
  if (path.startsWith("/alternateGreetings/")) return [path.replace("/alternateGreetings/", "/alternate_greetings/")];
  return [mappings[path] ?? path];
}

function rawLorebookField(field: string): string {
  const mappings: Record<string, string> = {
    secondaryKeys: "secondary_keys",
    useRegex: "use_regex",
    insertionOrder: "insertion_order",
    caseSensitive: "case_sensitive"
  };
  return mappings[field] ?? field;
}

function permissionAllowsLorebookValidationIssue(scope: { index: number; fields?: string[] }, issue: ValidationIssue): boolean {
  const prefix = `data.character_book.entries.${scope.index}.`;
  if (!issue.path.startsWith(prefix)) return false;
  return !scope.fields || scope.fields.some((field) => issue.path.startsWith(`${prefix}${rawLorebookField(field)}`));
}

function permissionAllowsLorebookTokenItem(scope: { index: number; fields?: string[] }, item: TokenStatItem): boolean {
  const prefix = `/character_book/entries/${scope.index}/`;
  if (!item.path.startsWith(prefix)) return false;
  return !scope.fields || scope.fields.some((field) => item.path.startsWith(`${prefix}${rawLorebookField(field)}`));
}

function lorebookScopeEntries(scope: AgentPermission["scope"]): Array<{ index: number; fields?: string[] }> {
  return scope.kind === "lorebookEntry" ? [scope] : scope.kind === "lorebookEntries" ? scope.entries : [];
}

function createProposeCardEditsTool(context: CardAgentToolContext): AgentTool {
  return {
    name: "propose_card_edits",
    label: "创建卡片字段提案",
    description: "用受限字段枚举创建待审核卡片编辑。不能删除字段或修改未授权范围。",
    executionMode: "sequential",
    parameters: Type.Object({
      summary: Type.String({ minLength: 1, maxLength: 2_000 }),
      cardRevision: Type.Integer({ minimum: 0 }),
      edits: Type.Array(Type.Object({
        path: cardPathSchema,
        value: Type.Union([Type.String(), Type.Array(Type.String())])
      }, { additionalProperties: false }), { minItems: 1, maxItems: 32 })
    }, { additionalProperties: false }),
    execute: async (toolCallId, params) => {
      const input = params as { summary: string; cardRevision: number; edits: CardFieldEdit[] };
      return createProposalResult(context, toolCallId, input.summary, input.cardRevision, [{ kind: "cardEdit", edits: input.edits }]);
    }
  };
}

function createProposeLorebookEntryEditsTool(context: CardAgentToolContext): AgentTool {
  return {
    name: "propose_lorebook_entry_edits",
    label: "创建世界书条目编辑提案",
    description: "编辑一个已读取的世界书条目。必须提交读取工具返回的 fingerprint；不支持删除条目。",
    executionMode: "sequential",
    parameters: Type.Object({
      summary: Type.String({ minLength: 1, maxLength: 2_000 }),
      cardRevision: Type.Integer({ minimum: 0 }),
      index: Type.Integer({ minimum: 0 }),
      fingerprint: Type.String({ minLength: 8, maxLength: 64 }),
      fields: lorebookFieldsSchema
    }, { additionalProperties: false }),
    execute: async (toolCallId, params) => {
      const input = params as { summary: string; cardRevision: number; index: number; fingerprint: string; fields: LorebookEntryFields };
      return createProposalResult(context, toolCallId, input.summary, input.cardRevision, [{
        kind: "lorebookEntryEdit",
        edit: { index: input.index, fingerprint: input.fingerprint, fields: input.fields }
      }]);
    }
  };
}

function createProposeLorebookInjectionTool(context: CardAgentToolContext): AgentTool {
  return {
    name: "propose_lorebook_injection",
    label: "创建世界书候选",
    description: "创建可逐项勾选的世界书候选条目。不会直接注入，用户必须确认所选条目。",
    executionMode: "sequential",
    parameters: Type.Object({
      summary: Type.String({ minLength: 1, maxLength: 2_000 }),
      cardRevision: Type.Integer({ minimum: 0 }),
      candidates: Type.Array(Type.Intersect([
        lorebookFieldsSchema,
        Type.Object({ comment: Type.String({ minLength: 1, maxLength: 100 }), content: Type.String({ minLength: 1, maxLength: 200_000 }) })
      ]), { minItems: 1, maxItems: 24 })
    }, { additionalProperties: false }),
    execute: async (toolCallId, params) => {
      const input = params as { summary: string; cardRevision: number; candidates: Array<Omit<LorebookCandidate, "candidateId">> };
      const candidates = input.candidates.map((candidate, index) => ({ ...candidate, candidateId: `${toolCallId}-${index + 1}` }));
      return createProposalResult(context, toolCallId, input.summary, input.cardRevision, [{ kind: "lorebookInjection", candidates }]);
    }
  };
}

function createProposalResult(
  context: CardAgentToolContext,
  toolCallId: string,
  summary: string,
  cardRevision: number,
  changes: AgentChange[]
): TextResult<unknown> {
  const snapshot = context.getSnapshot();
  if (cardRevision !== snapshot.cardRevision) {
    throw new Error(`卡片在读取后已变化（当前 revision ${snapshot.cardRevision}），请重新读取。`);
  }
  const proposal = createCardProposal({
    workspaceId: snapshot.workspaceId,
    sessionId: context.getSessionId(),
    toolCallId,
    summary,
    permission: context.getPermission(),
    changes,
    card: snapshot.card,
    cardRevision: snapshot.cardRevision
  });
  context.setProposal?.(proposal);
  const candidates = changes.flatMap((change) => change.kind === "lorebookInjection" ? change.candidates : []);
  return result({
    proposalId: proposal.id,
    state: proposal.state,
    summary: proposal.summary,
    diffs: proposal.diffs,
    candidates: candidates.map((candidate) => ({ candidateId: candidate.candidateId, comment: candidate.comment })),
    validationReport: proposal.validationReport,
    cardHash: stableHash(snapshot.card)
  }, JSON.stringify(proposal));
}
