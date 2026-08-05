import { ChevronDown, ChevronRight, FolderOpen, MessageSquare, Pin } from "lucide-react";
import { useContextMenuTarget } from "../../lib/contextMenuTargets";
import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import {
  buildAgentSessionGroups,
  formatAgentSessionTime,
  getAgentSessionTitle,
  getHiddenAgentSessionCount,
  getVisibleAgentSessions,
  isAgentSessionSelectable,
  isSameAgentSessionProject,
  type AgentSessionHistoryRecord,
  type CurrentAgentSession
} from "../../lib/agent/sessionHistory";

interface AgentSessionHistoryProps {
  records: AgentSessionHistoryRecord[];
  current: CurrentAgentSession;
  generatingTitleSessionIds: ReadonlySet<string>;
  busy: boolean;
  onSelectSession: (record: AgentSessionHistoryRecord) => void | Promise<void>;
  onSelectPrevious: () => void | Promise<void>;
  onSelectNext: () => void | Promise<void>;
  onCreateSession: () => void | Promise<void>;
  onRenameSession: (record: AgentSessionHistoryRecord) => void | Promise<void>;
  onDeleteSession: (record: AgentSessionHistoryRecord) => void | Promise<void>;
  onTogglePinned: (record: AgentSessionHistoryRecord) => void | Promise<void>;
  onToggleRead: (record: AgentSessionHistoryRecord) => void | Promise<void>;
  onExportSession: (record: AgentSessionHistoryRecord) => void | Promise<void>;
}

export function AgentSessionHistory({
  records,
  current,
  generatingTitleSessionIds,
  busy,
  onSelectSession,
  onSelectPrevious,
  onSelectNext,
  onCreateSession,
  onRenameSession,
  onDeleteSession,
  onTogglePinned,
  onToggleRead,
  onExportSession
}: AgentSessionHistoryProps): ReactNode {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => new Set());
  const groups = useMemo(() => buildAgentSessionGroups(records, current), [current, records]);
  const listContextTargetId = useContextMenuTarget(() => ({
    kind: "agent-session-list" as const,
    createSession: onCreateSession,
    selectPrevious: onSelectPrevious,
    selectNext: onSelectNext
  }));

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

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!(["ArrowDown", "ArrowUp", "Home", "End"] as string[]).includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(".agent-session-history-item:not(:disabled)"));
    if (buttons.length === 0) return;
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    event.preventDefault();
    buttons[nextIndex]?.focus();
  };

  return <nav
    className="agent-session-history"
    aria-labelledby="agent-session-history-heading"
    data-context-menu="agent-session-list"
    data-context-target-id={listContextTargetId}
    onKeyDown={handleKeyDown}
  >
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
            {visibleSessions.map((session) => <AgentSessionHistoryItem
              key={session.id}
              session={session}
              current={current}
              busy={busy}
              generatingTitle={generatingTitleSessionIds.has(session.id)}
              onSelectSession={onSelectSession}
              onCreateSession={onCreateSession}
              onSelectPrevious={onSelectPrevious}
              onSelectNext={onSelectNext}
              onRenameSession={onRenameSession}
              onDeleteSession={onDeleteSession}
              onTogglePinned={onTogglePinned}
              onToggleRead={onToggleRead}
              onExportSession={onExportSession}
            />)}
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

interface AgentSessionHistoryItemProps {
  session: AgentSessionHistoryRecord;
  current: CurrentAgentSession;
  busy: boolean;
  generatingTitle: boolean;
  onSelectSession: (record: AgentSessionHistoryRecord) => void | Promise<void>;
  onCreateSession: () => void | Promise<void>;
  onSelectPrevious: () => void | Promise<void>;
  onSelectNext: () => void | Promise<void>;
  onRenameSession: (record: AgentSessionHistoryRecord) => void | Promise<void>;
  onDeleteSession: (record: AgentSessionHistoryRecord) => void | Promise<void>;
  onTogglePinned: (record: AgentSessionHistoryRecord) => void | Promise<void>;
  onToggleRead: (record: AgentSessionHistoryRecord) => void | Promise<void>;
  onExportSession: (record: AgentSessionHistoryRecord) => void | Promise<void>;
}

function AgentSessionHistoryItem({
  session,
  current,
  busy,
  generatingTitle,
  onSelectSession,
  onCreateSession,
  onSelectPrevious,
  onSelectNext,
  onRenameSession,
  onDeleteSession,
  onTogglePinned,
  onToggleRead,
  onExportSession
}: AgentSessionHistoryItemProps) {
  const isCurrent = session.id === current.sessionId;
  const selectable = isAgentSessionSelectable(session, current);
  const title = generatingTitle ? "正在生成标题…" : getAgentSessionTitle(session);
  const contextTargetId = useContextMenuTarget(() => ({
    kind: "agent-session" as const,
    title,
    isCurrent,
    isRead: session.isRead !== false,
    pinned: Boolean(session.pinned),
    canSelect: selectable && !busy,
    canDelete: !busy,
    createSession: onCreateSession,
    selectSession: () => onSelectSession(session),
    selectPrevious: onSelectPrevious,
    selectNext: onSelectNext,
    renameSession: () => onRenameSession(session),
    deleteSession: () => onDeleteSession(session),
    togglePinned: () => onTogglePinned(session),
    toggleRead: () => onToggleRead(session),
    exportSession: () => onExportSession(session)
  }));

  return <li>
    <button
      className={isCurrent ? "agent-session-history-item active" : "agent-session-history-item"}
      disabled={busy || !selectable}
      type="button"
      aria-current={isCurrent ? "page" : undefined}
      aria-busy={generatingTitle || busy || undefined}
      aria-label={title}
      title={!selectable ? "该角色卡没有可重新打开的文件路径" : title}
      data-context-menu="agent-session"
      data-context-target-id={contextTargetId}
      onClick={() => void onSelectSession(session)}
    >
      <MessageSquare size={14} aria-hidden="true" />
      <span className="agent-session-history-copy"><strong>{title}</strong><small>{formatAgentSessionTime(session.updatedAt) || "尚未产生消息"}</small></span>
      <span className="agent-session-history-state">
        {session.pinned ? <Pin size={12} aria-label="已置顶" /> : null}
        {isCurrent ? <span className="agent-session-history-marker" aria-label="当前会话" /> : session.isRead === false ? <span className="agent-session-history-unread" aria-label="未读" /> : <ChevronRight size={13} aria-hidden="true" />}
      </span>
    </button>
  </li>;
}
