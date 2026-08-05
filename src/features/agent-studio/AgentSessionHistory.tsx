import { ChevronDown, ChevronRight, FolderOpen, MessageSquare } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  buildAgentSessionGroups,
  formatAgentSessionTime,
  getAgentSessionTitle,
  getHiddenAgentSessionCount,
  getVisibleAgentSessions,
  isSameAgentSessionProject,
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
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => new Set());
  const groups = useMemo(() => buildAgentSessionGroups(records, current), [current, records]);

  const toggleProject = (projectKey: string) => {
    setExpandedProjects((expanded) => {
      const next = new Set(expanded);
      if (next.has(projectKey)) {
        next.delete(projectKey);
      } else {
        next.add(projectKey);
      }
      return next;
    });
  };

  return <nav className="agent-session-history" aria-labelledby="agent-session-history-heading">
    <div className="agent-session-history-heading">
      <span id="agent-session-history-heading" className="agent-studio-section-label">聊天记录</span>
      <small>{groups.length} 个项目</small>
    </div>
    <div className="agent-session-projects">
      {groups.map((group, groupIndex) => {
        const isCurrentProject = isSameAgentSessionProject(group, current);
        const expanded = expandedProjects.has(group.projectKey);
        const hiddenCount = getHiddenAgentSessionCount(group.sessions);
        const visibleSessions = getVisibleAgentSessions(group.sessions, expanded);
        const headingId = `agent-session-project-heading-${groupIndex}`;
        const listId = `agent-session-project-${groupIndex}`;
        return <section className={isCurrentProject ? "agent-session-group is-current" : "agent-session-group"} key={group.projectKey} aria-labelledby={headingId}>
          <h3 className="agent-session-group-heading" id={headingId}>
            <span className="agent-session-group-icon" aria-hidden="true"><FolderOpen size={14} /></span>
            <span className="agent-session-group-title"><strong title={group.cardName}>{group.cardName}</strong><small>{group.sessions.length} 个聊天</small></span>
            {isCurrentProject ? <span className="agent-session-current-label">当前</span> : null}
          </h3>
          <ol className="agent-session-list" id={listId}>
            {visibleSessions.map((session) => {
              const isCurrent = isSameAgentSessionProject(session, current) && session.id === current.sessionId;
              const selectable = isCurrent || isSameAgentSessionProject(session, current) || Boolean(session.currentPath);
              const generatingTitle = generatingTitleSessionIds.has(session.id);
              const title = generatingTitle ? "正在生成标题…" : getAgentSessionTitle(session);
              return <li key={session.id}>
                <button
                  className={isCurrent ? "agent-session-history-item active" : "agent-session-history-item"}
                  disabled={!selectable}
                  type="button"
                  aria-current={isCurrent ? "page" : undefined}
                  aria-busy={generatingTitle || undefined}
                  title={!selectable ? "该角色卡没有可重新打开的文件路径" : title}
                  onClick={() => void onSelectSession(session)}
                >
                  <MessageSquare size={14} aria-hidden="true" />
                  <span className="agent-session-history-copy"><strong>{title}</strong><small>{formatAgentSessionTime(session.updatedAt) || "尚未产生消息"}</small></span>
                  {isCurrent ? <span className="agent-session-history-marker" aria-label="当前会话" /> : <ChevronRight size={13} aria-hidden="true" />}
                </button>
              </li>;
            })}
          </ol>
          {hiddenCount > 0 ? <button className="agent-session-history-toggle" type="button" aria-expanded={expanded} aria-controls={listId} onClick={() => toggleProject(group.projectKey)}>
            {expanded ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
            {expanded ? "收起较早记录" : `展开其余 ${hiddenCount} 条记录`}
          </button> : null}
        </section>;
      })}
    </div>
  </nav>;
}
