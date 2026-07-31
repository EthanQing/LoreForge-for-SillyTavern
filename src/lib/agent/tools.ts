import { type AgentTool, type AgentToolResult } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import type { CharacterCardV3, ValidationReport } from "../schema";
import { toNormalizedAiCard, type AiPatch, type NormalizedAiCard, type NormalizedWorldBookEntry } from "../aiAgent";
import { buildCardTokenStats } from "../tokenStats";
import { createCardProposal, type CardProposal } from "./contracts";

export type CardInspectionScope = "overview" | "basic" | "prompts" | "greetings" | "worldbook";

export const DEFAULT_AGENT_ALLOWED_PATHS = [
  "/name",
  "/description",
  "/personality",
  "/scenario",
  "/firstMessage",
  "/alternateGreetings",
  "/exampleDialogue",
  "/creatorNotes",
  "/systemPrompt",
  "/postHistoryInstructions",
  "/tags",
  "/creator",
  "/characterVersion",
  "/worldBook"
] as const;

export interface CardAgentSnapshot {
  card: CharacterCardV3;
  workspaceId: string;
  cardRevision: number;
  report: ValidationReport;
}

export interface CardAgentToolContext {
  getSnapshot: () => CardAgentSnapshot;
  getSessionId: () => string;
  allowedPaths?: string[];
  setProposal?: (proposal: CardProposal) => void;
}

type TextResult<T> = AgentToolResult<T>;

function result<T>(details: T, text?: string): TextResult<T> {
  return {
    content: [{ type: "text", text: text ?? JSON.stringify(details) }],
    details
  };
}

export function createCardAgentTools(context: CardAgentToolContext): AgentTool[] {
  return [
    createInspectCardTool(context),
    createInspectLorebookEntryTool(context),
    createInspectValidationTool(context),
    createInspectTokenUsageTool(context),
    createProposeCardChangesTool(context)
  ];
}

function createInspectCardTool(context: CardAgentToolContext): AgentTool {
  return {
    name: "inspect_card",
    label: "读取卡片",
    description: "读取当前 CCv3 卡片的安全、规范化摘要。不会返回图片 data URI 或未知原始字段。",
    parameters: Type.Object({
      scope: Type.Optional(Type.Union([
        Type.Literal("overview"),
        Type.Literal("basic"),
        Type.Literal("prompts"),
        Type.Literal("greetings"),
        Type.Literal("worldbook")
      ]))
    }),
    execute: async (_toolCallId, params) => {
      const scope = (params as { scope?: CardInspectionScope }).scope ?? "overview";
      const normalized = toNormalizedAiCard(context.getSnapshot().card);
      return result(selectCardScope(normalized, scope));
    }
  };
}

function createInspectLorebookEntryTool(context: CardAgentToolContext): AgentTool {
  return {
    name: "inspect_lorebook_entry",
    label: "读取世界书条目",
    description: "按条目 ID、序号或标题读取一个世界书条目。",
    parameters: Type.Object({
      id: Type.Optional(Type.Union([Type.String(), Type.Number()])),
      index: Type.Optional(Type.Integer({ minimum: 0 })),
      title: Type.Optional(Type.String())
    }),
    execute: async (_toolCallId, params) => {
      const input = params as { id?: string | number; index?: number; title?: string };
      const entries = toNormalizedAiCard(context.getSnapshot().card).worldBook?.entries ?? [];
      const entry = findEntry(entries, input);
      if (!entry) {
        throw new Error("未找到匹配的世界书条目。");
      }
      return result({ entry });
    }
  };
}

function createInspectValidationTool(context: CardAgentToolContext): AgentTool {
  return {
    name: "inspect_validation",
    label: "读取校验",
    description: "读取当前前端 CCv3 校验报告。",
    parameters: Type.Object({}),
    execute: async () => {
      const { report } = context.getSnapshot();
      return result(report);
    }
  };
}

function createInspectTokenUsageTool(context: CardAgentToolContext): AgentTool {
  return {
    name: "inspect_token_usage",
    label: "读取 Token 统计",
    description: "读取现有 Token 估算、分区摘要和 prompt preview 摘要。",
    parameters: Type.Object({}),
    execute: async () => {
      const stats = buildCardTokenStats(context.getSnapshot().card);
      return result({
        totalTokens: stats.totalTokens,
        promptPreviewMaxTokens: stats.promptPreviewMaxTokens,
        sections: stats.sections,
        largestFields: stats.largestFields.slice(0, 8),
        lorebookEntries: stats.lorebookEntries.length,
        assetSummary: stats.assetSummary
      });
    }
  };
}

function createProposeCardChangesTool(context: CardAgentToolContext): AgentTool {
  return {
    name: "propose_card_changes",
    label: "创建修改提案",
    description: "创建待用户审核的卡片修改提案。此工具永远不会直接修改卡片或文件。",
    executionMode: "sequential",
    parameters: Type.Object({
      summary: Type.String({ minLength: 1, maxLength: 2_000 }),
      allowedPaths: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: 64 }),
      patches: Type.Array(
        Type.Object({
          op: Type.Union([Type.Literal("add"), Type.Literal("replace"), Type.Literal("remove")]),
          path: Type.String({ minLength: 1, maxLength: 300 }),
          value: Type.Optional(Type.Unknown())
        }),
        { minItems: 1, maxItems: 64 }
      ),
      cardRevision: Type.Integer({ minimum: 0 })
    }),
    execute: async (toolCallId, params) => {
      const input = params as { summary: string; allowedPaths: string[]; patches: AiPatch[]; cardRevision: number };
      const snapshot = context.getSnapshot();
      if (input.cardRevision !== snapshot.cardRevision) {
        throw new Error(`卡片在读取后已变化（当前 revision ${snapshot.cardRevision}）。请重新读取卡片后再创建提案。`);
      }
      const approvedPaths = context.allowedPaths ?? input.allowedPaths;
      if (context.allowedPaths && input.allowedPaths.some((path) => !context.allowedPaths?.some((allowedPath) => path === allowedPath || path.startsWith(`${allowedPath}/`)))) {
        throw new Error("Proposal scope is outside the active card target.");
      }
      const proposal = createCardProposal({
        workspaceId: snapshot.workspaceId,
        sessionId: context.getSessionId(),
        toolCallId,
        summary: input.summary,
        patches: input.patches,
        allowedPaths: approvedPaths,
        card: snapshot.card,
        cardRevision: snapshot.cardRevision
      });
      context.setProposal?.(proposal);
      return result(
        { proposalId: proposal.id, state: proposal.state, summary: proposal.summary, diffs: proposal.diffs, validationReport: proposal.validationReport },
        JSON.stringify(proposal)
      );
    }
  };
}

function selectCardScope(card: NormalizedAiCard, scope: CardInspectionScope): unknown {
  if (scope === "overview") {
    return {
      name: card.name,
      creator: card.creator,
      characterVersion: card.characterVersion,
      tags: card.tags,
      sections: {
        prompts: Boolean(card.description || card.personality || card.scenario || card.systemPrompt),
        greetings: Boolean(card.firstMessage || card.alternateGreetings.length),
        worldbookEntries: card.worldBook?.entries.length ?? 0
      }
    };
  }
  if (scope === "basic") {
    return {
      name: card.name,
      creator: card.creator,
      characterVersion: card.characterVersion,
      tags: card.tags,
      creatorNotes: card.creatorNotes
    };
  }
  if (scope === "prompts") {
    return {
      description: card.description,
      personality: card.personality,
      scenario: card.scenario,
      exampleDialogue: card.exampleDialogue,
      systemPrompt: card.systemPrompt,
      postHistoryInstructions: card.postHistoryInstructions
    };
  }
  if (scope === "greetings") {
    return { firstMessage: card.firstMessage, alternateGreetings: card.alternateGreetings };
  }
  return card.worldBook ?? { entries: [] };
}

function findEntry(entries: NormalizedWorldBookEntry[], input: { id?: string | number; index?: number; title?: string }): NormalizedWorldBookEntry | undefined {
  if (input.index !== undefined) {
    return entries[input.index];
  }
  if (input.id !== undefined) {
    return entries.find((entry) => String(entry.id ?? "") === String(input.id));
  }
  const title = input.title?.trim().toLowerCase();
  return title ? entries.find((entry) => entry.comment.trim().toLowerCase() === title) : undefined;
}
