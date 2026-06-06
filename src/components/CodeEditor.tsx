import CodeMirror, { ReactCodeMirrorProps } from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { Decoration, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

type EditorMode = "prompt" | "json" | "plain";

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  mode?: EditorMode;
  minHeight?: string;
  maxHeight?: string;
  readOnly?: boolean;
}

const macroMatcher = /\{\{char\}\}|\{\{user\}\}|<char>|<bot>|<user>/g;

function buildMacroDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    for (const match of text.matchAll(macroMatcher)) {
      const start = from + (match.index ?? 0);
      builder.add(start, start + match[0].length, Decoration.mark({ class: "cm-macro-token" }));
    }
  }
  return builder.finish();
}

const macroHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildMacroDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildMacroDecorations(update.view);
      }
    }
  },
  {
    decorations: (value) => value.decorations,
  },
);

export function CodeEditor({ value, onChange, mode = "plain", minHeight = "160px", maxHeight = "360px", readOnly = false }: CodeEditorProps) {
  const extensions: ReactCodeMirrorProps["extensions"] = [EditorView.lineWrapping];
  if (mode === "json") {
    extensions.push(json());
  }
  if (mode === "prompt") {
    extensions.push(markdown(), macroHighlighter);
  }

  return (
    <div className="code-editor-shell" data-context-menu={mode === "json" ? "json" : undefined} data-editor-readonly={readOnly ? "true" : undefined}>
      <CodeMirror
        basicSetup={{
          foldGutter: false,
          lineNumbers: false,
          highlightActiveLine: false,
        }}
        editable={!readOnly}
        extensions={extensions}
        height="auto"
        maxHeight={maxHeight}
        minHeight={minHeight}
        value={value}
        onChange={(next) => onChange?.(next)}
      />
    </div>
  );
}
