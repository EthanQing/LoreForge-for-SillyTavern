import { invoke } from "@tauri-apps/api/core";
import type { AiAgentPreview } from "./aiAgent";

export type AiChatHistoryRole = "user" | "assistant";
export type AiChatHistoryPreviewState = "pending" | "applied" | "discarded";
export type AiChatHistoryMode = "guide" | "edit";

export interface AiChatHistoryMessage {
  id: string;
  role: AiChatHistoryRole;
  content: string;
  reasoning?: string;
  preview?: AiAgentPreview;
  previewState?: AiChatHistoryPreviewState;
  createdAt: number;
}

export interface AiChatSessionSummary {
  id: string;
  mode: AiChatHistoryMode;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessagePreview: string;
}

export interface AiChatSession {
  id: string;
  mode: AiChatHistoryMode;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AiChatHistoryMessage[];
}

export async function listAiChatSessions(mode: AiChatHistoryMode): Promise<AiChatSessionSummary[]> {
  return await invoke<AiChatSessionSummary[]>("list_ai_chat_sessions", { mode });
}

export async function loadAiChatSession(sessionId: string): Promise<AiChatSession> {
  return await invoke<AiChatSession>("load_ai_chat_session", { sessionId });
}

export async function saveAiChatSession(session: AiChatSession): Promise<AiChatSession> {
  return await invoke<AiChatSession>("save_ai_chat_session", { session });
}

export async function deleteAiChatSession(sessionId: string): Promise<void> {
  await invoke("delete_ai_chat_session", { sessionId });
}

export async function clearAiChatSessions(): Promise<void> {
  await invoke("clear_ai_chat_sessions");
}
