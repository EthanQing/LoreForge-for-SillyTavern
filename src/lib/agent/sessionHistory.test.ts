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
