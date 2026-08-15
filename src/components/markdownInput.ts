export interface MarkdownEnterResult {
  fromOffset: number;
  toOffset: number;
  insert: string;
  cursorOffset: number;
}

export function getMarkdownEnterResult(lineText: string, cursorOffset: number): MarkdownEnterResult | null {
  if (cursorOffset !== lineText.length) {
    return null;
  }

  const unordered = lineText.match(/^(\s*)([-+*])\s+(.*)$/);
  if (unordered) {
    if (!unordered[3].trim()) {
      return createBlankLineResult(lineText.length);
    }
    return continueList(lineText.length, `${unordered[1]}${unordered[2]} `);
  }

  const ordered = lineText.match(/^(\s*)(\d+)([.)])\s+(.*)$/);
  if (ordered) {
    if (!ordered[4].trim()) {
      return createBlankLineResult(lineText.length);
    }
    const currentNumber = Number.parseInt(ordered[2], 10);
    const nextNumber = Number.isSafeInteger(currentNumber) && currentNumber < Number.MAX_SAFE_INTEGER
      ? currentNumber + 1
      : currentNumber;
    return continueList(lineText.length, `${ordered[1]}${nextNumber}${ordered[3]} `);
  }

  const quote = lineText.match(/^(\s*(?:>\s*)+)(.*)$/);
  if (quote) {
    if (!quote[2].trim()) {
      return createBlankLineResult(lineText.length);
    }
    const prefix = quote[1].endsWith(" ") ? quote[1] : `${quote[1]} `;
    return continueList(lineText.length, prefix);
  }

  return null;
}

function continueList(cursorOffset: number, prefix: string): MarkdownEnterResult {
  const insert = `\n${prefix}`;
  return {
    fromOffset: cursorOffset,
    toOffset: cursorOffset,
    insert,
    cursorOffset: cursorOffset + insert.length
  };
}

function createBlankLineResult(lineLength: number): MarkdownEnterResult {
  return {
    fromOffset: 0,
    toOffset: lineLength,
    insert: "\n",
    cursorOffset: 1
  };
}
