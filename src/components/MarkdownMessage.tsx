import type { ReactNode } from "react";

interface MarkdownMessageProps {
  text: string;
  className?: string;
}

type TableAlignment = "left" | "center" | "right";

const INLINE_TOKEN_PATTERN = /(!?\[[^\]]+\]\([^\n]*?\)|\*\*[\s\S]+?\*\*|__[\s\S]+?__|~~[\s\S]+?~~|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g;

export function MarkdownMessage({ text, className }: MarkdownMessageProps): ReactNode {
  const classes = ["markdown-message", className].filter(Boolean).join(" ");
  return <div className={classes}>{renderBlocks(text.replace(/\r\n?/g, "\n"), "markdown")}</div>;
}

function renderBlocks(text: string, keyPrefix: string): ReactNode[] {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  let blockIndex = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^ {0,3}(`{3,}|~{3,})\s*([\w-]*)\s*$/);
    if (fence) {
      const marker = fence[1];
      const language = sanitizeLanguage(fence[2]);
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !isClosingFence(lines[index], marker)) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(
        <pre className="markdown-code-block" key={`${keyPrefix}-code-${blockIndex}`}>
          <code className={language ? `language-${language}` : undefined}>{codeLines.join("\n")}</code>
        </pre>
      );
      blockIndex += 1;
      continue;
    }

    const heading = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const content = renderInline(heading[2], `${keyPrefix}-heading-${blockIndex}`);
      blocks.push(renderHeading(heading[1].length, content, `${keyPrefix}-heading-${blockIndex}`));
      index += 1;
      blockIndex += 1;
      continue;
    }

    if (isHorizontalRule(line)) {
      blocks.push(<hr key={`${keyPrefix}-rule-${blockIndex}`} />);
      index += 1;
      blockIndex += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const table = renderTable(lines, index, `${keyPrefix}-table-${blockIndex}`);
      blocks.push(table.node);
      index = table.nextIndex;
      blockIndex += 1;
      continue;
    }

    if (/^ {0,3}>/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^ {0,3}>/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^ {0,3}> ?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote key={`${keyPrefix}-quote-${blockIndex}`}>
          {renderBlocks(quoteLines.join("\n"), `${keyPrefix}-quote-${blockIndex}`)}
        </blockquote>
      );
      blockIndex += 1;
      continue;
    }

    const listItem = parseListItem(line);
    if (listItem) {
      const items: string[] = [];
      const ordered = listItem.ordered;
      while (index < lines.length) {
        const current = parseListItem(lines[index]);
        if (!current || current.ordered !== ordered) break;
        items.push(current.content);
        index += 1;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={`${keyPrefix}-list-${blockIndex}`}>
          {items.map((item, itemIndex) => <li key={`${keyPrefix}-list-${blockIndex}-${itemIndex}`}>{renderInline(item, `${keyPrefix}-list-${blockIndex}-${itemIndex}`)}</li>)}
        </List>
      );
      blockIndex += 1;
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push(
      <p key={`${keyPrefix}-paragraph-${blockIndex}`}>
        {paragraphLines.flatMap((paragraphLine, lineIndex) => [
          lineIndex > 0 ? <br key={`${keyPrefix}-paragraph-${blockIndex}-break-${lineIndex}`} /> : null,
          ...renderInline(paragraphLine, `${keyPrefix}-paragraph-${blockIndex}-${lineIndex}`)
        ])}
      </p>
    );
    blockIndex += 1;
  }

  return blocks;
}

function renderHeading(level: number, content: ReactNode[], key: string): ReactNode {
  switch (level) {
    case 1: return <h1 key={key}>{content}</h1>;
    case 2: return <h2 key={key}>{content}</h2>;
    case 3: return <h3 key={key}>{content}</h3>;
    case 4: return <h4 key={key}>{content}</h4>;
    case 5: return <h5 key={key}>{content}</h5>;
    default: return <h6 key={key}>{content}</h6>;
  }
}

function renderTable(lines: string[], startIndex: number, keyPrefix: string): { node: ReactNode; nextIndex: number } {
  const headers = splitTableRow(lines[startIndex]);
  const alignments = splitTableRow(lines[startIndex + 1]).map(parseTableAlignment);
  const rows: string[][] = [];
  let index = startIndex + 2;
  while (index < lines.length && lines[index].trim() && lines[index].includes("|")) {
    rows.push(splitTableRow(lines[index]));
    index += 1;
  }

  return {
    nextIndex: index,
    node: (
      <div className="markdown-table-wrap" key={keyPrefix}>
        <table>
          <thead>
            <tr>{headers.map((cell, cellIndex) => renderTableCell("th", cell, alignments[cellIndex] ?? "left", `${keyPrefix}-head-${cellIndex}`))}</tr>
          </thead>
          {rows.length > 0 ? <tbody>{rows.map((row, rowIndex) => <tr key={`${keyPrefix}-row-${rowIndex}`}>{headers.map((_, cellIndex) => renderTableCell("td", row[cellIndex] ?? "", alignments[cellIndex] ?? "left", `${keyPrefix}-row-${rowIndex}-${cellIndex}`))}</tr>)}</tbody> : null}
        </table>
      </div>
    )
  };
}

function renderTableCell(tag: "th" | "td", content: string, alignment: TableAlignment, key: string): ReactNode {
  const className = `markdown-table-cell markdown-table-cell-${alignment}`;
  return tag === "th"
    ? <th className={className} key={key}>{renderInline(content, key)}</th>
    : <td className={className} key={key}>{renderInline(content, key)}</td>;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const pattern = new RegExp(INLINE_TOKEN_PATTERN.source, "g");

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    nodes.push(renderInlineToken(match[0], `${keyPrefix}-${match.index}`));
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function renderInlineToken(token: string, key: string): ReactNode {
  if (token.startsWith("[") || token.startsWith("![")) {
    const link = parseLinkToken(token);
    if (!link) return token;
    const href = safeHref(link.href);
    if (!href) return renderInline(link.label, key);
    return <a href={href} key={key} target="_blank" rel="noreferrer">{renderInline(link.label, `${key}-label`)}</a>;
  }
  if (token.startsWith("**") || token.startsWith("__")) return <strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>;
  if (token.startsWith("~~")) return <del key={key}>{renderInline(token.slice(2, -2), key)}</del>;
  if (token.startsWith("`")) return <code key={key}>{token.slice(1, -1)}</code>;
  return <em key={key}>{renderInline(token.slice(1, -1), key)}</em>;
}

function parseLinkToken(token: string): { label: string; href: string } | null {
  const image = token.startsWith("![");
  const labelStart = image ? 2 : 1;
  const labelEnd = token.indexOf("](", labelStart);
  if (labelEnd < 0 || !token.endsWith(")")) return null;
  const label = token.slice(labelStart, labelEnd);
  const destination = token.slice(labelEnd + 2, -1).trim();
  const href = destination.split(/\s+/, 1)[0];
  return label && href ? { label, href } : null;
}

function safeHref(href: string): string | null {
  if (/^(https?:|mailto:|#|\/|\.\.?\/)/i.test(href)) return href;
  return null;
}

function sanitizeLanguage(language: string): string {
  return language.replace(/[^a-zA-Z0-9_-]/g, "");
}

function isClosingFence(line: string, marker: string): boolean {
  const character = marker[0];
  return new RegExp(`^ {0,3}${character}{${marker.length},}\\s*$`).test(line);
}

function isHorizontalRule(line: string): boolean {
  return /^ {0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(line);
}

function isTableStart(lines: string[], index: number): boolean {
  return index + 1 < lines.length && lines[index].includes("|") && isTableSeparator(lines[index + 1]);
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function splitTableRow(line: string): string[] {
  const value = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  for (const character of value) {
    if (character === "|" && !escaped) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    if (character === "\\" && !escaped) {
      escaped = true;
      cell += character;
      continue;
    }
    cell += character;
    escaped = false;
  }
  cells.push(cell.trim());
  return cells.map((item) => item.replace(/\\\|/g, "|"));
}

function parseTableAlignment(cell: string): TableAlignment {
  if (cell.startsWith(":") && cell.endsWith(":")) return "center";
  if (cell.endsWith(":")) return "right";
  return "left";
}

function parseListItem(line: string): { ordered: boolean; content: string } | null {
  const ordered = line.match(/^ {0,3}\d+[.)]\s+(.+)$/);
  if (ordered) return { ordered: true, content: ordered[1] };
  const unordered = line.match(/^ {0,3}[-+*]\s+(.+)$/);
  return unordered ? { ordered: false, content: unordered[1] } : null;
}

function isBlockStart(lines: string[], index: number): boolean {
  const line = lines[index];
  return /^ {0,3}(#{1,6})\s+/.test(line)
    || /^ {0,3}(`{3,}|~{3,})/.test(line)
    || /^ {0,3}>/.test(line)
    || isHorizontalRule(line)
    || Boolean(parseListItem(line))
    || isTableStart(lines, index);
}
