export const mentionPattern = /@(?:(?:"(?:\\.|[^"\\\n])*"(?:#\d+)?)|(?:字段|开场白)\/[^\s，。！？、；：,.!?;:]+|整张卡片|基础信息|提示词|开场白|世界书)/gu;

export function getMentionDisplayLabel(token: string): string {
  const quoted = token.match(/^@"((?:\\.|[^"\\])*)"(#\d+)?$/u);
  if (quoted) {
    return `${quoted[1].replace(/\\(["\\])/gu, "$1")}${quoted[2] ?? ""}`;
  }
  return token.startsWith("@") ? token.slice(1) : token;
}
