import type { SaveCardSnapshotResult } from "../../app/useProjectActions";

export function getProposalSummary(summary: string): string {
  return summary.trim() || "未命名修改提案";
}

export function getAppliedProposalSaveStatus(result: SaveCardSnapshotResult): string {
  if (result.state === "saved") return "Agent 提案已应用并写入文件。";
  if (result.state === "draft-only") return "Agent 提案已应用，已保存为本地草稿，尚未写入文件。";
  return `Agent 提案已应用并保存为本地草稿，但写入文件失败：${result.error}。可稍后手动重新保存。`;
}
