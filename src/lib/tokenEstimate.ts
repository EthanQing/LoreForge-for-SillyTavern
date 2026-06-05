export function estimateTokens(text: string): number {
  if (!text.trim()) {
    return 0;
  }
  const cjk = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const rest = text.replace(/[\u3400-\u9fff]/g, "");
  const wordish = rest.match(/[A-Za-z0-9_'-]+|[^\sA-Za-z0-9_'-]/g)?.length ?? 0;
  return Math.max(1, Math.ceil(cjk * 0.7 + wordish * 0.75));
}
