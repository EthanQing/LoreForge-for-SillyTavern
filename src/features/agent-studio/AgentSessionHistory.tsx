import { ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  buildAgentSessionGroups,
  formatAgentSessionTime,
  getAgentSessionTitle,
  getHiddenAgentSessionCount,
  getVisibleAgentSessions,
  type AgentSessionHistoryRecord,
  type CurrentAgentSession
} from "../../lib/agent/sessionHistory";

interface AgentSessionHistoryProps {
  records: AgentSessionHistoryRecord[];
  current: CurrentAgentSession;
  generatingTitleSessionIds: ReadonlySet<string>;
  onSelectSession: (record: AgentSessionHistoryRecord) => void | Promise<void>;
}

export function AgentSessionHistory({ records, current, generatingTitleSessionIds, onSelectSession }: AgentSessionHistoryProps): ReactNode {
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(() => new Set());
  const groups = useMemo(() => buildAgentSessionGroups(records, current), [current, records]);

  const toggleWorkspace = (workspaceId: string) => {
    setExpandedWorkspaces((expanded) => {
      const next = new Set(expanded);
      if (next.has(workspaceId)) {
        next.delete(workspaceId);
      } else {
        next.add(workspaceId);
      }
      return next;
    });
  };

  return <nav className="agent-session-history" aria-label="消息记录列表">
    <span className="agent-studio-section-label">消息记录</span>
    {groups.map((group, groupIndex) => {
      const expanded = expandedWorkspaces.has(group.workspaceId);
      const hiddenCount = getHiddenAgentSessionCount(group.sessions);
      const visibleSessions = getVisibleAgentSessions(group.sessions, expanded);
      const listId = `agent-session-history-${groupIndex}`;
      return <section className="agent-session-group" key={group.workspaceId}>
        <h3 className="agent-session-group-heading">
          <span className="agent-session-group-title"><strong title={group.cardName}>{group.cardName}</strong><small>{group.sessions.length} 条记录</small></span>
          {group.workspaceId === current.workspaceId ? <span className="agent-session-current-label">当前</span> : null}
        </h3>
        <div className="agent-session-list" id={listId}>
          {visibleSessions.map((session) => {
            const isCurrent = session.workspaceId === current.workspaceId && session.id === current.sessionId;
            const selectable = isCurrent || session.workspaceId === current.workspaceId || Boolean(session.currentPath);
            const generatingTitle = generatingTitleSessionIds.has(session.id);
            const title = generatingTitle ? "正在生成标题…" : getAgentSessionTitle(session);
            return <button
              className={isCurrent ? "agent-session-history-item active" : "agent-session-history-item"}
              disabled={!selectable}
              key={session.id}
              type="button"
              aria-current={isCurrent ? "page" : undefined}
              aria-busy={generatingTitle || undefined}
              title={!selectable ? "该角色卡没有可重新打开的文件路径" : title}
              onClick={() => void onSelectSession(session)}
            >
              <MessageSquare size={14} aria-hidden="true" />
              <span className="agent-session-history-copy"><strong>{title}</strong><small>{formatAgentSessionTime(session.updatedAt) || "尚未产生消息"}</small></span>
              {isCurrent ? <span className="agent-session-history-marker" aria-label="当前会话" /> : <ChevronRight size={13} aria-hidden="true" />}
            </button>;
          })}
        </div>
        {hiddenCount > 0 ? <button className="agent-session-history-toggle" type="button" aria-expanded={expanded} aria-controls={listId} onClick={() => toggleWorkspace(group.workspaceId)}>
          {expanded ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
          {expanded ? "收起较早记录" : `展开其余 ${hiddenCount} 条记录`}
        </button> : null}
      </section>;
    })}
  </nav>;
}
