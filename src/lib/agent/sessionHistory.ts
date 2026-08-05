import { PENDING_AGENT_SESSION_TITLE } from "./sessionTitle";

export const MAX_VISIBLE_AGENT_SESSIONS = 5;

export interface AgentSessionHistoryRecord {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  cardName: string | null;
  currentPath: string | null;
  entryCount: number;
}

export interface AgentSessionProjectIdentity {
  workspaceId: string;
  cardName: string | null;
  currentPath: string | null;
}

export interface AgentSessionHistoryGroup {
  projectKey: string;
  workspaceId: string;
  cardName: string;
  currentPath: string | null;
  sessions: AgentSessionHistoryRecord[];
}

export interface CurrentAgentSession extends AgentSessionProjectIdentity {
  sessionId: string;
  cardName: string;
}

export function buildAgentSessionGroups(
  records: AgentSessionHistoryRecord[],
  current: CurrentAgentSession,
  now = Date.now()
): AgentSessionHistoryGroup[] {
  const groups: AgentSessionHistoryGroup[] = [];

  for (const record of dedupeSessionRecords(records)) {
    const group = groups.find((candidate) => isSameAgentSessionProject(record, candidate));
    if (group) {
      group.sessions.push(record);
      if (!group.currentPath && record.currentPath) {
        group.currentPath = record.currentPath;
      }
      continue;
    }

    groups.push({
      projectKey: getAgentSessionProjectKey(record),
      workspaceId: record.workspaceId,
      cardName: getCardName(record.cardName, record.currentPath),
      currentPath: record.currentPath,
      sessions: [record]
    });
  }

  let currentGroup = groups.find((group) => isSameAgentSessionProject(current, group));
  if (!currentGroup) {
    currentGroup = {
      projectKey: getAgentSessionProjectKey(current),
      workspaceId: current.workspaceId,
      cardName: current.cardName,
      currentPath: current.currentPath,
      sessions: []
    };
    groups.push(currentGroup);
  }

  currentGroup.projectKey = getAgentSessionProjectKey(current);
  currentGroup.workspaceId = current.workspaceId;
  currentGroup.cardName = current.cardName;
  currentGroup.currentPath = current.currentPath ?? currentGroup.currentPath;

  const currentSession = groups
    .flatMap((group) => group.sessions)
    .find((session) => session.id === current.sessionId);
  for (const group of groups) {
    if (group !== currentGroup) {
      group.sessions = group.sessions.filter((session) => session.id !== current.sessionId);
    }
  }

  if (!currentGroup.sessions.some((session) => session.id === current.sessionId)) {
    currentGroup.sessions.unshift(currentSession ?? {
      id: current.sessionId,
      workspaceId: current.workspaceId,
      title: PENDING_AGENT_SESSION_TITLE,
      createdAt: now,
      updatedAt: now,
      cardName: current.cardName,
      currentPath: current.currentPath,
      entryCount: 0
    });
  }

  return groups
    .filter((group) => group.sessions.length > 0)
    .map((group) => ({
      ...group,
      sessions: [...group.sessions].sort((left, right) => right.updatedAt - left.updatedAt || right.createdAt - left.createdAt)
    }))
    .sort((left, right) => {
      const leftIsCurrent = isSameAgentSessionProject(left, current);
      const rightIsCurrent = isSameAgentSessionProject(right, current);
      if (leftIsCurrent) return -1;
      if (rightIsCurrent) return 1;
      return latestSessionTime(right) - latestSessionTime(left);
    });
}

export function getAgentSessionProjectKey(identity: AgentSessionProjectIdentity): string {
  const path = normalizePath(identity.currentPath);
  if (path) return `path:${path}`;
  return `workspace:${identity.workspaceId}`;
}

export function isSameAgentSessionProject(left: AgentSessionProjectIdentity, right: AgentSessionProjectIdentity): boolean {
  return getAgentSessionProjectKey(left) === getAgentSessionProjectKey(right);
}

export function getVisibleAgentSessions(sessions: AgentSessionHistoryRecord[], expanded: boolean): AgentSessionHistoryRecord[] {
  return expanded ? sessions : sessions.slice(0, MAX_VISIBLE_AGENT_SESSIONS);
}

export function getHiddenAgentSessionCount(sessions: AgentSessionHistoryRecord[]): number {
  return Math.max(0, sessions.length - MAX_VISIBLE_AGENT_SESSIONS);
}

export function getAgentSessionTitle(record: AgentSessionHistoryRecord): string {
  return truncate(record.title.trim() || PENDING_AGENT_SESSION_TITLE, 24);
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

function dedupeSessionRecords(records: AgentSessionHistoryRecord[]): AgentSessionHistoryRecord[] {
  const uniqueRecords = new Map<string, AgentSessionHistoryRecord>();
  for (const record of records) {
    const previous = uniqueRecords.get(record.id);
    if (!previous || shouldPreferSessionRecord(record, previous)) {
      uniqueRecords.set(record.id, record);
    }
  }
  return [...uniqueRecords.values()];
}

function shouldPreferSessionRecord(candidate: AgentSessionHistoryRecord, previous: AgentSessionHistoryRecord): boolean {
  if (candidate.updatedAt !== previous.updatedAt) return candidate.updatedAt > previous.updatedAt;
  if (Boolean(candidate.currentPath) !== Boolean(previous.currentPath)) return Boolean(candidate.currentPath);
  return Boolean(candidate.cardName?.trim()) && !Boolean(previous.cardName?.trim());
}

function latestSessionTime(group: AgentSessionHistoryGroup): number {
  return group.sessions.reduce((latest, session) => Math.max(latest, session.updatedAt), 0);
}

function getCardName(cardName: string | null, currentPath: string | null): string {
  const trimmedName = cardName?.trim().replace(/\s+/g, " ");
  if (trimmedName) return trimmedName;

  const pathName = currentPath?.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
  return pathName.replace(/\.(?:json|png|apng|charx)$/i, "").trim() || "未命名角色卡";
}

function normalizePath(value: string | null): string {
  return value?.trim().replaceAll("\\", "/").replace(/\/+$/, "").toLocaleLowerCase() ?? "";
}

function truncate(value: string, maxLength: number): string {
  const characters = [...value];
  return characters.length > maxLength ? `${characters.slice(0, maxLength).join("")}…` : value;
}
