import { markdown } from "@codemirror/lang-markdown";
import { Prec, RangeSetBuilder } from "@codemirror/state";
import CodeMirror, { type ReactCodeMirrorProps } from "@uiw/react-codemirror";
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from "react";
import { Decoration, EditorView, keymap, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { getMarkdownEnterResult } from "./markdownInput";

export interface MarkdownComposerHandle {
  focus: () => void;
  setSelectionRange: (start: number, end: number) => void;
}

interface MarkdownComposerProps {
  value: string;
  disabled?: boolean;
  placeholder: string;
  ariaLabel: string;
  mentionListboxId?: string;
  mentionExpanded: boolean;
  activeMentionId?: string;
  onChange: (value: string, cursor: number) => void;
  onKeyDown: (event: globalThis.KeyboardEvent, view: EditorView) => boolean;
  onBlur: () => void;
}

interface PendingDecoration {
  from: number;
  to: number;
  decoration: Decoration;
}

const mentionPattern = /@(?:(?:"(?:\\.|[^"\\\n])*"(?:#\d+)?)|(?:字段|开场白)\/[^\s，。！？、；：,.!?;:]+|整张卡片|基础信息|提示词|开场白|世界书)/gu;

const liveMarkdownPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildLiveMarkdownDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildLiveMarkdownDecorations(update.view);
      }
    }
  },
  {
    decorations: (value) => value.decorations
  }
);

export const MarkdownComposer = forwardRef<MarkdownComposerHandle, MarkdownComposerProps>(function MarkdownComposer(
  {
    value,
    disabled = false,
    placeholder,
    ariaLabel,
    mentionListboxId,
    mentionExpanded,
    activeMentionId,
    onChange,
    onKeyDown,
    onBlur
  },
  ref
) {
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onKeyDownRef = useRef(onKeyDown);
  onChangeRef.current = onChange;
  onKeyDownRef.current = onKeyDown;
  const handleUpdate = useCallback((update: ViewUpdate) => {
    if (!update.docChanged && !update.selectionSet) return;
    onChangeRef.current(update.state.doc.toString(), update.state.selection.main.head);
  }, []);
  const extensions = useMemo<ReactCodeMirrorProps["extensions"]>(() => [
    EditorView.lineWrapping,
    markdown(),
    liveMarkdownPlugin,
    Prec.high(keymap.of([{ key: "Enter", run: continueMarkdownLine }])),
    Prec.high(EditorView.domEventHandlers({
      keydown: (event, view) => {
        if (deleteMentionAtCursor(event, view)) return true;
        return onKeyDownRef.current(event, view);
      }
    })),
    EditorView.contentAttributes.of({
      role: "combobox",
      "aria-autocomplete": "list",
      "aria-expanded": String(mentionExpanded),
      "aria-haspopup": "listbox",
      "aria-label": ariaLabel,
      "aria-multiline": "true",
      ...(mentionListboxId ? { "aria-controls": mentionListboxId } : {}),
      ...(activeMentionId ? { "aria-activedescendant": activeMentionId } : {}),
      ...(disabled ? { "aria-disabled": "true" } : {})
    })
  ], [activeMentionId, ariaLabel, disabled, mentionExpanded, mentionListboxId]);

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    setSelectionRange: (start, end) => {
      const view = viewRef.current;
      if (!view) return;
      const from = Math.max(0, Math.min(start, view.state.doc.length));
      const to = Math.max(from, Math.min(end, view.state.doc.length));
      view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true });
      view.focus();
    }
  }), []);

  return (
    <CodeMirror
      aria-label={ariaLabel}
      autoFocus={false}
      basicSetup={{
        foldGutter: false,
        lineNumbers: false,
        highlightActiveLine: false
      }}
      className="agent-composer-editor"
      editable={!disabled}
      extensions={extensions}
      height="auto"
      maxHeight="220px"
      minHeight="88px"
      onBlur={onBlur}
      onCreateEditor={(view) => {
        viewRef.current = view;
      }}
      onUpdate={handleUpdate}
      placeholder={placeholder}
      value={value}
    />
  );
});

function continueMarkdownLine(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;

  const line = view.state.doc.lineAt(selection.head);
  const result = getMarkdownEnterResult(line.text, selection.head - line.from);
  if (!result) return false;

  const from = line.from + result.fromOffset;
  const to = line.from + result.toOffset;
  const cursor = line.from + result.cursorOffset;
  view.dispatch({
    changes: { from, to, insert: result.insert },
    selection: { anchor: cursor },
    scrollIntoView: true,
    userEvent: "input"
  });
  return true;
}

function deleteMentionAtCursor(event: globalThis.KeyboardEvent, view: EditorView): boolean {
  if (event.isComposing || (event.key !== "Backspace" && event.key !== "Delete") || event.altKey || event.ctrlKey || event.metaKey) {
    return false;
  }

  const selection = view.state.selection.main;
  const ranges = selection.empty
    ? findMentionRangesAtLine(view, selection.head)
    : findMentionRanges(view, selection.from, selection.to);
  let deletion: { from: number; to: number } | undefined;

  if (!selection.empty) {
    const overlapping = ranges.filter((range) => range.to > selection.from && range.from < selection.to);
    if (overlapping.length > 0) {
      deletion = {
        from: Math.min(selection.from, ...overlapping.map((range) => range.from)),
        to: Math.max(selection.to, ...overlapping.map((range) => range.to))
      };
    }
  } else {
    const position = selection.head;
    const mention = ranges.find((range) => {
      if (event.key === "Backspace") {
        return (position > range.from && position <= range.to)
          || (position === range.to + 1 && view.state.doc.sliceString(range.to, position) === " ");
      }
      return position >= range.from && position < range.to;
    });
    if (mention) {
      deletion = { from: mention.from, to: mention.to };
      if (view.state.doc.sliceString(mention.to, mention.to + 1) === " ") {
        deletion.to += 1;
      }
    }
  }

  if (!deletion) return false;

  event.preventDefault();
  view.dispatch({
    changes: deletion,
    selection: { anchor: deletion.from },
    scrollIntoView: true,
    userEvent: event.key === "Backspace" ? "delete.backward" : "delete.forward"
  });
  return true;
}

interface MentionRange {
  from: number;
  to: number;
}

function findMentionRanges(view: EditorView, from: number, to: number): MentionRange[] {
  const doc = view.state.doc;
  const firstLine = doc.lineAt(from);
  const lastLine = doc.lineAt(to);
  const ranges: MentionRange[] = [];
  for (let lineNumber = firstLine.number; lineNumber <= lastLine.number; lineNumber += 1) {
    for (const range of findMentionRangesAtLine(view, lineNumber)) {
      if (range.to > from && range.from < to) ranges.push(range);
    }
  }
  return ranges;
}

function findMentionRangesAtLine(view: EditorView, lineNumber: number): MentionRange[] {
  const line = view.state.doc.line(lineNumber);
  return Array.from(line.text.matchAll(mentionPattern), (match) => {
    const from = line.from + (match.index ?? 0);
    return { from, to: from + match[0].length };
  });
}

function buildLiveMarkdownDecorations(view: EditorView): DecorationSet {
  const doc = view.state.doc;
  const activeLines = new Set<number>();
  for (const selection of view.state.selection.ranges) {
    activeLines.add(doc.lineAt(selection.anchor).number);
    activeLines.add(doc.lineAt(selection.head).number);
  }

  const pending: PendingDecoration[] = [];
  const visitedLines = new Set<number>();
  for (const range of view.visibleRanges) {
    let line = doc.lineAt(range.from);
    const lastLineNumber = doc.lineAt(range.to).number;
    while (line.number <= lastLineNumber && !visitedLines.has(line.number)) {
      visitedLines.add(line.number);
      addLineDecorations(pending, line.from, line.text, activeLines.has(line.number));
      if (line.to >= doc.length) break;
      line = doc.line(line.number + 1);
    }
  }

  pending.sort((left, right) => left.from - right.from || left.to - right.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const item of pending) {
    if (item.from < item.to) builder.add(item.from, item.to, item.decoration);
  }
  return builder.finish();
}

function addLineDecorations(pending: PendingDecoration[], lineFrom: number, text: string, active: boolean): void {
  addMentionDecorations(pending, lineFrom, text);

  const heading = text.match(/^(\s{0,3})(#{1,6})(\s+)(.*)$/);
  if (heading) {
    const contentStart = heading[1].length + heading[2].length + heading[3].length;
    addMark(pending, lineFrom + contentStart, lineFrom + text.length, `cm-live-heading-${heading[2].length}`);
    if (!active) addReplace(pending, lineFrom + heading[1].length, lineFrom + contentStart);
  }

  const list = text.match(/^(\s*)([-+*]|\d+[.)])(\s+)/);
  if (list) {
    const markerStart = lineFrom + list[1].length;
    const markerEnd = markerStart + list[2].length;
    addMark(pending, markerStart, markerEnd, "cm-live-list-marker");
  }

  const quote = text.match(/^(\s*)(>+)(\s?)(.*)$/);
  if (quote) {
    const contentStart = quote[1].length + quote[2].length + quote[3].length;
    addMark(pending, lineFrom + contentStart, lineFrom + text.length, "cm-live-blockquote");
  }

  if (/^\s{0,3}(`{3,}|~{3,})/.test(text)) {
    addMark(pending, lineFrom, lineFrom + text.length, "cm-live-code-fence");
    return;
  }

  if (/^\s{0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(text)) {
    addMark(pending, lineFrom, lineFrom + text.length, "cm-live-horizontal-rule");
  }

  addDelimitedDecorations(pending, lineFrom, text, active, /(\*\*|__)(?=\S)(.*?\S)\1/g, "cm-live-strong");
  addDelimitedDecorations(pending, lineFrom, text, active, /(~~)(?=\S)(.*?\S)\1/g, "cm-live-strikethrough");
  addDelimitedDecorations(pending, lineFrom, text, active, /(`)([^`\n]+)(`)/g, "cm-live-inline-code");
  addSimpleEmphasisDecorations(pending, lineFrom, text, active, /(^|[^*])\*(?!\*)(?=\S)([^*\n]+?\S)\*(?!\*)/g);
  addSimpleEmphasisDecorations(pending, lineFrom, text, active, /(^|[^_])_(?!_)(?=\S)([^_\n]+?\S)_(?!_)/g);

  const linkPattern = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;
  for (const match of text.matchAll(linkPattern)) {
    const index = match.index ?? 0;
    const labelStart = index + 1;
    const labelEnd = labelStart + match[1].length;
    addMark(pending, lineFrom + labelStart, lineFrom + labelEnd, "cm-live-link");
    if (!active) {
      addReplace(pending, lineFrom + index, lineFrom + labelStart);
      addReplace(pending, lineFrom + labelEnd, lineFrom + index + match[0].length);
    }
  }
}

function addMentionDecorations(pending: PendingDecoration[], lineFrom: number, text: string): void {
  for (const match of text.matchAll(mentionPattern)) {
    const index = match.index ?? 0;
    const tokenStart = lineFrom + index;
    const tokenEnd = tokenStart + match[0].length;
    addMentionMark(pending, tokenStart, tokenEnd, match[0]);

    const openingLength = match[0].startsWith('@"') ? 2 : 1;
    addReplace(pending, tokenStart, tokenStart + openingLength);
    if (openingLength === 2) {
      const closingQuote = match[0].lastIndexOf('"');
      if (closingQuote >= openingLength) {
        addReplace(pending, tokenStart + closingQuote, tokenStart + closingQuote + 1);
      }
    }
  }
}

function addSimpleEmphasisDecorations(pending: PendingDecoration[], lineFrom: number, text: string, active: boolean, pattern: RegExp): void {
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    const markerStart = index + match[1].length;
    const contentStart = markerStart + 1;
    const contentEnd = contentStart + match[2].length;
    addMark(pending, lineFrom + contentStart, lineFrom + contentEnd, "cm-live-emphasis");
    if (!active) {
      addReplace(pending, lineFrom + markerStart, lineFrom + contentStart);
      addReplace(pending, lineFrom + contentEnd, lineFrom + contentEnd + 1);
    }
  }
}

function addDelimitedDecorations(
  pending: PendingDecoration[],
  lineFrom: number,
  text: string,
  active: boolean,
  pattern: RegExp,
  className: string
): void {
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    const openingLength = match[1].length;
    const contentStart = index + openingLength;
    const contentEnd = contentStart + match[2].length;
    addMark(pending, lineFrom + contentStart, lineFrom + contentEnd, className);
    if (!active) {
      addReplace(pending, lineFrom + index, lineFrom + contentStart);
      addReplace(pending, lineFrom + contentEnd, lineFrom + index + match[0].length);
    }
  }
}

function addMark(pending: PendingDecoration[], from: number, to: number, className: string): void {
  pending.push({ from, to, decoration: Decoration.mark({ class: className }) });
}

function addMentionMark(pending: PendingDecoration[], from: number, to: number, token: string): void {
  pending.push({
    from,
    to,
    decoration: Decoration.mark({
      class: "cm-live-mention",
      attributes: { title: token }
    })
  });
}

function addReplace(pending: PendingDecoration[], from: number, to: number): void {
  pending.push({ from, to, decoration: Decoration.replace({}) });
}
