import { Check } from "lucide-react";
import { Button } from "../../components/Button";
import { estimateCandidateTokens, validateCandidate, type AgentDiff, type LorebookCandidate } from "../../lib/agent/changes";
import type { CardProposal } from "../../lib/agent/contracts";
import { getProposalSummary } from "../../lib/agent/proposalPresentation";

interface ProposalCardProps {
  proposal: CardProposal;
  disabled: boolean;
  onApply: () => void;
  onDiscard: () => void;
  onToggleCandidate: (candidateId: string, selected: boolean) => void;
}

export function ProposalCard({ proposal, disabled, onApply, onDiscard, onToggleCandidate }: ProposalCardProps) {
  const candidates = proposal.changes.flatMap((change) => change.kind === "lorebookInjection" ? change.candidates : []);
  const selectedCount = candidates.filter((candidate) => proposal.selectedCandidateIds.includes(candidate.candidateId)).length;
  return <article className={proposal.state === "conflicted" ? "agent-proposal-card conflicted" : "agent-proposal-card"}>
    <div className="agent-proposal-heading"><span>{proposal.state === "conflicted" ? "冲突提案" : candidates.length ? "世界书候选" : "待审核提案"}</span><code>{proposal.id.slice(-8)}</code></div>
    <strong>{getProposalSummary(proposal.summary)}</strong>
    {candidates.length ? <div className="agent-candidate-list" role="group" aria-label="世界书候选条目">
      {candidates.map((candidate) => <LorebookCandidateRow
        key={candidate.candidateId}
        candidate={candidate}
        checked={proposal.selectedCandidateIds.includes(candidate.candidateId)}
        disabled={disabled || proposal.state !== "pending"}
        onCheckedChange={(checked) => onToggleCandidate(candidate.candidateId, checked)}
      />)}
    </div> : <ProposalDiffs diffs={proposal.diffs} />}
    {proposal.state === "conflicted" ? <p className="agent-danger">当前卡片已被修改，请重新读取后生成提案。</p> : null}
    <div className="agent-proposal-actions"><Button variant="ghost" disabled={disabled} onClick={onDiscard}>丢弃</Button>{proposal.state === "pending" ? <Button disabled={disabled || (candidates.length > 0 && selectedCount === 0)} icon={<Check size={14} />} onClick={onApply}>{candidates.length ? `确认注入所选（${selectedCount}）` : "确认应用"}</Button> : null}</div>
  </article>;
}

const DIFF_LABELS: Record<string, string> = {
  "/name": "名称",
  "/description": "角色描述",
  "/personality": "性格",
  "/scenario": "场景",
  "/firstMessage": "首条开场白",
  "/alternateGreetings": "备用开场白",
  "/exampleDialogue": "示例对话",
  "/creatorNotes": "创作者备注",
  "/systemPrompt": "系统提示词",
  "/postHistoryInstructions": "历史消息指令",
  "/tags": "标签",
  "/creator": "创作者",
  "/characterVersion": "角色版本",
  "/worldBook": "世界书"
};

function ProposalDiffs({ diffs }: { diffs: AgentDiff[] }) {
  const visibleDiffs = diffs.slice(0, 2);
  const remainingDiffs = diffs.slice(2);
  return <section className="agent-proposal-diffs" aria-label={`共 ${diffs.length} 处修改`}>
    <p className="agent-proposal-diff-count">共 {diffs.length} 处修改</p>
    {visibleDiffs.map((diff) => <ProposalDiffRow key={diff.path} diff={diff} />)}
    {remainingDiffs.length ? <details className="agent-proposal-diff-details">
      <summary><span className="agent-proposal-diff-expand">展开其余 {remainingDiffs.length} 项</span><span className="agent-proposal-diff-collapse">收起</span></summary>
      <div className="agent-proposal-diff-remainder">
        {remainingDiffs.map((diff) => <ProposalDiffRow key={diff.path} diff={diff} />)}
      </div>
    </details> : null}
  </section>;
}

function ProposalDiffRow({ diff }: { diff: AgentDiff }) {
  const label = DIFF_LABELS[diff.path] ?? (diff.label || diff.path);
  return <article className="agent-proposal-diff-row">
    <header className="agent-proposal-diff-heading"><strong>{label}</strong><code>{diff.path}</code></header>
    <div className="agent-proposal-diff-values">
      <div><span>修改前</span><pre className={diff.before === "" ? "is-empty" : undefined} tabIndex={0} aria-label={`${label}修改前`}>{diff.before === "" ? "（空值）" : diff.before}</pre></div>
      <div><span>修改后</span><pre className={diff.after === "" ? "is-empty" : undefined} tabIndex={0} aria-label={`${label}修改后`}>{diff.after === "" ? "（空值）" : diff.after}</pre></div>
    </div>
  </article>;
}

function LorebookCandidateRow({ candidate, checked, disabled, onCheckedChange }: { candidate: LorebookCandidate; checked: boolean; disabled: boolean; onCheckedChange: (checked: boolean) => void }) {
  const errors = validateCandidate(candidate);
  const strategy = candidate.triggerStrategy ?? "keyword";
  const settings = [
    strategy,
    `位置 ${candidate.insertionPosition ?? 0}`,
    candidate.depth === undefined ? null : `深度 ${candidate.depth}`,
    candidate.role === undefined ? null : `角色 ${candidate.role}`,
    `顺序 ${candidate.insertionOrder ?? "自动"}`,
    `概率 ${candidate.probability ?? 100}%`,
    candidate.enabled === false ? "已禁用" : "已启用",
    `约 ${estimateCandidateTokens(candidate)} tokens`
  ].filter(Boolean).join(" · ");
  return <label className={errors.length ? "agent-candidate-row is-invalid" : "agent-candidate-row"}>
    <input type="checkbox" checked={checked} disabled={disabled || errors.length > 0} onChange={(event) => onCheckedChange(event.currentTarget.checked)} />
    <span className="agent-candidate-copy">
      <strong>{candidate.comment}</strong>
      <span>{(candidate.keys ?? []).slice(0, 4).join("、") || "无关键词"}</span>
      <span>{settings}</span>
      <p>{candidate.content.length > 180 ? `${candidate.content.slice(0, 180)}…` : candidate.content}</p>
      {errors.length ? <small role="alert">{errors.join(" ")}</small> : null}
    </span>
  </label>;
}
