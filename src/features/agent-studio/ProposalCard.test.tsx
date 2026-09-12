import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createBlankCard } from "../../lib/schema";
import type { AgentDiff } from "../../lib/agent/changes";
import { createCardProposal, type CardProposal } from "../../lib/agent/contracts";
import { permissionForPreset } from "../../lib/agent/permissions";
import { ProposalCard } from "./ProposalCard";

const handlers = {
  onApply: () => undefined,
  onDiscard: () => undefined,
  onToggleCandidate: () => undefined
};

describe("ProposalCard", () => {
  it("shows the readable label, path, before, and after for one diff", () => {
    const markup = renderProposal([
      { path: "/description", label: "description", before: "旧描述", after: "新描述" }
    ]);

    expect(markup).toContain("共 1 处修改");
    expect(markup).toContain("角色描述");
    expect(markup).toContain("/description");
    expect(markup).toContain("修改前");
    expect(markup).toContain("旧描述");
    expect(markup).toContain("修改后");
    expect(markup).toContain("新描述");
  });

  it("keeps every diff available when more than four fields change", () => {
    const diffs = ["name", "description", "personality", "scenario", "systemPrompt", "creatorNotes"].map((field, index) => ({
      path: `/${field}`,
      label: field,
      before: `旧值 ${index + 1}`,
      after: `新值 ${index + 1}`
    }));
    const markup = renderProposal(diffs);

    expect(markup).toContain("共 6 处修改");
    expect(markup).toContain("<details");
    expect(markup).toContain("展开其余 4 项");
    expect(markup).toContain("收起");
    for (const diff of diffs) {
      expect(markup).toContain(diff.before);
      expect(markup).toContain(diff.after);
    }
  });

  it("marks empty values clearly in both directions", () => {
    const markup = renderProposal([
      { path: "/description", label: "description", before: "", after: "新增内容" },
      { path: "/scenario", label: "scenario", before: "原有内容", after: "" }
    ]);

    expect(markup.match(/（空值）/gu)).toHaveLength(2);
    expect(markup.match(/class="is-empty"/gu)).toHaveLength(2);
    expect(markup).toContain("新增内容");
    expect(markup).toContain("原有内容");
  });

  it("renders complete multiline long text without truncating it", () => {
    const longLine = `第二行-${"很长的文本".repeat(160)}`;
    const value = `第一行\n${longLine}`;
    const markup = renderProposal([
      { path: "/systemPrompt", label: "systemPrompt", before: "旧提示词", after: value }
    ]);

    expect(markup).toContain("第一行\n");
    expect(markup).toContain(longLine);
    expect(markup).not.toContain(`${longLine.slice(0, 600)}…`);
  });

  it("keeps the conflicted hint and existing actions", () => {
    const proposal = proposalWithDiffs([{ path: "/name", label: "name", before: "旧名称", after: "新名称" }]);
    const markup = renderToStaticMarkup(<ProposalCard {...handlers} proposal={{ ...proposal, state: "conflicted" }} disabled={false} />);

    expect(markup).toContain("当前卡片已被修改，请重新读取后生成提案。");
    expect(markup).toContain("丢弃");
    expect(markup).not.toContain("确认应用");
  });

  it("keeps the lorebook candidate checkbox review flow", () => {
    const card = createBlankCard();
    const proposal = createCardProposal({
      workspaceId: "workspace-test",
      sessionId: "session-test",
      toolCallId: "tool-test",
      summary: "注入世界书候选",
      permission: permissionForPreset("worldbook"),
      changes: [{ kind: "lorebookInjection", candidates: [{ candidateId: "candidate-1", comment: "地点", content: "候选内容" }] }],
      card,
      cardRevision: 0,
      now: 1
    });
    const markup = renderToStaticMarkup(<ProposalCard {...handlers} proposal={proposal} disabled={false} />);

    expect(markup).toContain('aria-label="世界书候选条目"');
    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain("确认注入所选（0）");
    expect(markup).toContain("disabled");
    expect(markup).not.toContain("agent-proposal-diffs");
  });
});

function renderProposal(diffs: AgentDiff[]): string {
  return renderToStaticMarkup(<ProposalCard {...handlers} proposal={proposalWithDiffs(diffs)} disabled={false} />);
}

function proposalWithDiffs(diffs: AgentDiff[]): CardProposal {
  const card = createBlankCard();
  const proposal = createCardProposal({
    workspaceId: "workspace-test",
    sessionId: "session-test",
    toolCallId: "tool-test",
    summary: "更新角色卡",
    permission: permissionForPreset("basic"),
    changes: [{ kind: "cardEdit", edits: [{ path: "/name", value: "新名称" }] }],
    card,
    cardRevision: 0,
    now: 1
  });
  return { ...proposal, diffs };
}
