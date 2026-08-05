import { describe, expect, it } from "vitest";
import {
  buildAgentSessionGroups,
  getAgentSessionTitle,
  getHiddenAgentSessionCount,
  getVisibleAgentSessions,
  type AgentSessionHistoryRecord
} from "./sessionHistory";

function session(id: string, workspaceId: string, updatedAt: number): AgentSessionHistoryRecord {
  return {
    id,
    workspaceId,
    title: id,
    createdAt: updatedAt,
    updatedAt,
    cardName: workspaceId === "card-a" ? "角色卡 A" : "角色卡 B",
    currentPath: `C:/cards/${workspaceId}.json`,
    entryCount: 2
  };
}

describe("agent session history", () => {
  it("groups sessions by workspace and keeps the current card first", () => {
    const records = [
      ...Array.from({ length: 6 }, (_, index) => session(`a-${index}`, "card-a", index + 1)),
      session("b-1", "card-b", 20)
    ];

    const groups = buildAgentSessionGroups(records, {
      workspaceId: "card-a",
      sessionId: "a-5",
      cardName: "角色卡 A",
      currentPath: "C:/cards/card-a.json"
    }, 30);

    expect(groups.map((group) => group.workspaceId)).toEqual(["card-a", "card-b"]);
    expect(groups[0].sessions[0].id).toBe("a-5");
    expect(groups[0].sessions).toHaveLength(6);
  });

  it("merges sessions from different workspaces when they point to the same card path", () => {
    const groups = buildAgentSessionGroups([
      { ...session("legacy", "workspace-draft", 10), currentPath: "C:/Cards/hero.json" },
      { ...session("current", "workspace-file", 20), currentPath: "c:/cards/HERO.json" }
    ], {
      workspaceId: "workspace-file",
      sessionId: "current",
      cardName: "角色卡 A",
      currentPath: "C:/cards/hero.json"
    }, 30);

    expect(groups).toHaveLength(1);
    expect(groups[0].workspaceId).toBe("workspace-file");
    expect(groups[0].sessions.map((item) => item.id)).toEqual(["current", "legacy"]);
  });

  it("keeps pathless cards isolated by workspace", () => {
    const groups = buildAgentSessionGroups([
      { ...session("draft-a", "workspace-a", 10), cardName: "相同卡名", currentPath: null },
      { ...session("draft-b", "workspace-b", 20), cardName: "相同卡名", currentPath: null }
    ], {
      workspaceId: "workspace-a",
      sessionId: "draft-a",
      cardName: "相同卡名",
      currentPath: null
    }, 30);

    expect(groups).toHaveLength(2);
    expect(groups[0].workspaceId).toBe("workspace-a");
  });

  it("keeps same-name cards with different paths as separate projects", () => {
    const groups = buildAgentSessionGroups([
      { ...session("hero-a", "workspace-a", 10), cardName: "相同卡名", currentPath: "C:/cards/a.json" },
      { ...session("hero-b", "workspace-b", 20), cardName: "相同卡名", currentPath: "C:/cards/b.json" }
    ], {
      workspaceId: "workspace-a",
      sessionId: "hero-a",
      cardName: "相同卡名",
      currentPath: "C:/cards/a.json"
    }, 30);

    expect(groups).toHaveLength(2);
  });

  it("does not render the same session id more than once", () => {
    const groups = buildAgentSessionGroups([
      session("duplicate", "workspace-a", 10),
      { ...session("duplicate", "workspace-b", 20), currentPath: "C:/cards/workspace-b.json" }
    ], {
      workspaceId: "workspace-a",
      sessionId: "other",
      cardName: "角色卡 A",
      currentPath: "C:/cards/workspace-a.json"
    }, 30);

    expect(groups.flatMap((group) => group.sessions).filter((item) => item.id === "duplicate")).toHaveLength(1);
  });

  it("limits each card independently and expands only that card", () => {
    const records = [
      ...Array.from({ length: 7 }, (_, index) => session(`a-${index}`, "card-a", index + 1)),
      ...Array.from({ length: 6 }, (_, index) => session(`b-${index}`, "card-b", index + 11))
    ];
    const groups = buildAgentSessionGroups(records, {
      workspaceId: "card-a",
      sessionId: "a-0",
      cardName: "角色卡 A",
      currentPath: "C:/cards/card-a.json"
    }, 30);

    const cardSessions = groups[0].sessions;
    expect(getVisibleAgentSessions(cardSessions, false)).toHaveLength(5);
    expect(getHiddenAgentSessionCount(cardSessions)).toBe(2);
    expect(getVisibleAgentSessions(cardSessions, true)).toHaveLength(7);
    expect(getVisibleAgentSessions(groups[1].sessions, false)).toHaveLength(5);
    expect(getHiddenAgentSessionCount(groups[1].sessions)).toBe(1);
  });

  it("adds the current session when it has not reached SQLite yet", () => {
    const groups = buildAgentSessionGroups([], {
      workspaceId: "card-new",
      sessionId: "session-new",
      cardName: "新角色卡",
      currentPath: null
    }, 100);

    expect(groups).toHaveLength(1);
    expect(groups[0].sessions[0].id).toBe("session-new");
    expect(groups[0].sessions[0].title).toBe("新会话");
  });

  it("shows the persisted title instead of a raw message summary", () => {
    const record = {
      ...session("named", "card-a", 20),
      title: "优化都市世界书",
    };

    expect(getAgentSessionTitle(record)).toBe("优化都市世界书");
  });
});
