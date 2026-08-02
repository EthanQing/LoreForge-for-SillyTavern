import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { invoke } from "@tauri-apps/api/core";
import { isCardProposal, type CardProposal } from "./contracts";
import type { AgentControllerEvent } from "./controller";
import type { AgentSessionHistoryRecord } from "./sessionHistory";
import { hydrateAgentMessages, type PersistedAgentEntry } from "./sessionMessages";
import { readAgentMessageContent } from "./transcript";

const entryPositions = new Map<string, number>();

export async function persistAgentBranch(
  workspaceId: string,
  sessionId: string,
  mode: "regenerating" | "resending",
  baseMessages: AgentMessage[],
  discardedProposalIds: string[]
): Promise<boolean> {
  const now = Date.now();
  try {
    await invoke("append_agent_entry", {
      entry: {
        id: createId(), workspaceId, sessionId, role: "conversationBranch",
        payload: { type: "agent_conversation_branch", mode, baseMessages, discardedProposalIds, createdAt: now },
        createdAt: now, position: nextEntryPosition(sessionId)
      }
    });
    return true;
  } catch {
    return false;
  }
}

export async function persistAgentEvent(workspaceId: string, sessionId: string, event: AgentControllerEvent): Promise<void> {
  if ((event.type !== "message_end" && event.type !== "tool_execution_start" && event.type !== "tool_execution_end") || !event.event) return;
  const message = "message" in event.event ? event.event.message : undefined;
  const now = Date.now();
  try {
    await invoke("save_agent_session", {
      session: {
        id: sessionId, workspaceId, title: "卡片 Agent 会话", createdAt: now, updatedAt: now,
        summary: message && "content" in message ? readAgentMessageContent(message.content).slice(0, 240) || null : null
      }
    });
    await invoke("append_agent_entry", {
      entry: {
        id: createId(), workspaceId, sessionId,
        role: message?.role ?? (event.type === "tool_execution_end" ? "toolResult" : event.type === "tool_execution_start" ? "toolCall" : "assistant"),
        payload: event.event, createdAt: now, position: nextEntryPosition(sessionId)
      }
    });
  } catch {
    return;
  }
}

export async function persistAgentProposal(proposal: CardProposal): Promise<void> {
  try {
    await invoke("save_agent_proposal", {
      proposal: {
        id: proposal.id, workspaceId: proposal.workspaceId, sessionId: proposal.sessionId,
        state: proposal.state, payload: proposal, createdAt: proposal.createdAt, updatedAt: proposal.updatedAt
      }
    });
  } catch {
    return;
  }
}

export async function persistWorkspace(workspaceId: string, currentPath: string | null, cardRevision: number, cardName: string): Promise<void> {
  const now = Date.now();
  try {
    await invoke("save_card_workspace", {
      workspace: { id: workspaceId, cardName, currentPath, cardRevision, createdAt: now, updatedAt: now }
    });
  } catch {
    return;
  }
}

export async function hydrateAgentSession(sessionId: string): Promise<AgentMessage[]> {
  try {
    const entries = await invoke<PersistedAgentEntry[]>("list_agent_entries", { sessionId });
    return hydrateAgentMessages(entries);
  } catch {
    return [];
  }
}

export async function hydrateAgentProposals(workspaceId: string): Promise<CardProposal[]> {
  try {
    const records = await invoke<Array<{ payload?: unknown }>>("list_agent_proposals", { workspaceId });
    return records.map((record) => record.payload).filter(isCardProposal);
  } catch {
    return [];
  }
}

export async function hydrateAgentSessionHistory(): Promise<AgentSessionHistoryRecord[]> {
  try {
    return await invoke<AgentSessionHistoryRecord[]>("list_agent_session_history");
  } catch {
    return [];
  }
}

function nextEntryPosition(sessionId: string): number {
  const now = Date.now() * 1_000;
  const previous = entryPositions.get(sessionId) ?? 0;
  const position = Math.max(now, previous + 1);
  entryPositions.set(sessionId, position);
  return position;
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `agent-entry-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
