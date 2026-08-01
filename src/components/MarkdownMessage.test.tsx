import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownMessage } from "./MarkdownMessage";

describe("MarkdownMessage", () => {
  it("renders the Markdown blocks used by agent replies", () => {
    const markup = renderToStaticMarkup(
      <MarkdownMessage text={'## 角色档案\n\n**名称**：樱井优香\n\n| 字段 | 内容 |\n| --- | :---: |\n| 标签 | 现代都市 |\n\n- 留学生\n- 中文流利'} />
    );

    expect(markup).toContain("<h2>角色档案</h2>");
    expect(markup).toContain("<strong>名称</strong>");
    expect(markup).toContain("<table>");
    expect(markup).toContain("<th class=\"markdown-table-cell markdown-table-cell-center\">内容</th>");
    expect(markup).toContain("<ul><li>留学生</li><li>中文流利</li></ul>");
  });

  it("keeps unsafe links as text", () => {
    const markup = renderToStaticMarkup(<MarkdownMessage text="[危险链接](javascript:alert(1)) [安全链接](https://example.com)" />);

    expect(markup).not.toContain("href=\"javascript");
    expect(markup).toContain("危险链接");
    expect(markup).toContain('href="https://example.com"');
  });

  it("keeps code blocks contained and preserves their content", () => {
    const markup = renderToStaticMarkup(<MarkdownMessage text={'```json\n{"name":"樱井优香"}\n```'} />);

    expect(markup).toContain('class="language-json"');
    expect(markup).toContain("{&quot;name&quot;:&quot;樱井优香&quot;}");
  });
});
