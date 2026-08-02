import { Check } from "lucide-react";
import { Button } from "../../components/Button";
import { estimateCandidateTokens, validateCandidate, type LorebookCandidate } from "../../lib/agent/changes";
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
    </div> : <div className="agent-proposal-diffs">{proposal.diffs.slice(0, 4).map((diff) => <div key={diff.path}><code>{diff.path}</code><span>{diff.after}</span></div>)}</div>}
    {proposal.state === "conflicted" ? <p className="agent-danger">当前卡片已被修改，请重新读取后生成提案。</p> : null}
    <div className="agent-proposal-actions"><Button variant="ghost" disabled={disabled} onClick={onDiscard}>丢弃</Button>{proposal.state === "pending" ? <Button disabled={disabled || (candidates.length > 0 && selectedCount === 0)} icon={<Check size={14} />} onClick={onApply}>{candidates.length ? `确认注入所选（${selectedCount}）` : "确认应用"}</Button> : null}</div>
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
