export const MAX_VISIBLE_AGENT_SESSIONS = 5;

export interface AgentSessionHistoryRecord {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  summary: string | null;
  cardName: string | null;
  currentPath: string | null;
  entryCount: number;
}

export interface AgentSessionHistoryGroup {
  workspaceId: string;
  cardName: string;
  currentPath: string | null;
  sessions: AgentSessionHistoryRecord[];
}

export interface CurrentAgentSession {
  workspaceId: string;
  sessionId: string;
  cardName: string;
  currentPath: string | null;
}

export function buildAgentSessionGroups(
  records: AgentSessionHistoryRecord[],
  current: CurrentAgentSession,
  now = Date.now()
): AgentSessionHistoryGroup[] {
  const groups = new Map<string, AgentSessionHistoryGroup>();

  for (const record of records) {
    const group = groups.get(record.workspaceId) ?? {
      workspaceId: record.workspaceId,
      cardName: getCardName(record.cardName, record.currentPath),
      currentPath: record.currentPath,
      sessions: []
    };
    if (!group.sessions.some((session) => session.id === record.id)) {
      group.sessions.push(record);
    }
    if (!group.currentPath && record.currentPath) {
      group.currentPath = record.currentPath;
    }
    groups.set(record.workspaceId, group);
  }

  const currentGroup = groups.get(current.workspaceId) ?? {
    workspaceId: current.workspaceId,
    cardName: current.cardName,
    currentPath: current.currentPath,
    sessions: []
  };
  currentGroup.cardName = current.cardName;
  currentGroup.currentPath = current.currentPath;
  if (!currentGroup.sessions.some((session) => session.id === current.sessionId)) {
    currentGroup.sessions.unshift({
      id: current.sessionId,
      workspaceId: current.workspaceId,
      title: "当前会话",
      createdAt: now,
      updatedAt: now,
      summary: null,
      cardName: current.cardName,
      currentPath: current.currentPath,
      entryCount: 0
    });
  }
  groups.set(current.workspaceId, currentGroup);

  return [...groups.values()]
    .map((group) => ({
      ...group,
      sessions: [...group.sessions].sort((left, right) => right.updatedAt - left.updatedAt)
    }))
    .sort((left, right) => {
      if (left.workspaceId === current.workspaceId) return -1;
      if (right.workspaceId === current.workspaceId) return 1;
      return latestSessionTime(right) - latestSessionTime(left);
    });
}

export function getVisibleAgentSessions(sessions: AgentSessionHistoryRecord[], expanded: boolean): AgentSessionHistoryRecord[] {
  return expanded ? sessions : sessions.slice(0, MAX_VISIBLE_AGENT_SESSIONS);
}

export function getHiddenAgentSessionCount(sessions: AgentSessionHistoryRecord[]): number {
  return Math.max(0, sessions.length - MAX_VISIBLE_AGENT_SESSIONS);
}

export function getAgentSessionTitle(record: AgentSessionHistoryRecord): string {
  const title = record.title.trim() === "Card Agent session" ? "卡片 Agent 会话" : record.title.trim();
  return truncate(record.summary?.trim() || title || "未命名会话", 72);
}

export function formatAgentSessionTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function latestSessionTime(group: AgentSessionHistoryGroup): number {
  return group.sessions.reduce((latest, session) => Math.max(latest, session.updatedAt), 0);
}

function getCardName(cardName: string | null, currentPath: string | null): string {
  const trimmedName = cardName?.trim();
  if (trimmedName) return trimmedName;
  const pathName = currentPath?.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
  const withoutExtension = pathName.replace(/\.(?:json|png|apng|charx)$/i, "").trim();
  return withoutExtension || "未命名角色卡";
}

function truncate(value: string, maxLength: number): string {
  const characters = [...value];
  return characters.length > maxLength ? `${characters.slice(0, maxLength).join("")}…` : value;
}
