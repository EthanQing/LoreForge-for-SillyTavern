import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CodeEditor } from "./CodeEditor";

vi.mock("@uiw/react-codemirror", () => ({
  default: ({ value }: { value: string }) => <textarea aria-label="mock code editor" value={value} readOnly />
}));

describe("CodeEditor", () => {
  it("renders a live Markdown preview for editable prompt fields", () => {
    const markup = renderToStaticMarkup(<CodeEditor mode="prompt" value={"## 标题\n\n**内容**"} />);

    expect(markup).toContain('class="code-editor-preview"');
    expect(markup).toContain("<h2>标题</h2>");
    expect(markup).toContain("<strong>内容</strong>");
  });

  it("does not add the Markdown preview to non-prompt or read-only editors", () => {
    expect(renderToStaticMarkup(<CodeEditor mode="plain" value="**原文**" />)).not.toContain("code-editor-preview");
    expect(renderToStaticMarkup(<CodeEditor mode="json" value='{"name":"角色"}' />)).not.toContain("code-editor-preview");
    expect(renderToStaticMarkup(<CodeEditor mode="prompt" readOnly value="**原文**" />)).not.toContain("code-editor-preview");
  });
});
