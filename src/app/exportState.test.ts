import { describe, expect, it } from "vitest";
import { keepEditorAssetsAfterMetadataExport } from "./exportState";
import { createBlankCard } from "../lib/schema";

describe("export state helpers", () => {
  it("keeps editor-only assets after exported metadata strips them", () => {
    const editorCard = createBlankCard(100);
    editorCard.data.assets = [{ type: "icon", name: "main", ext: "png", uri: "data:image/png;base64,abcdef" }];

    const exportedCard = createBlankCard(200);
    exportedCard.data.assets = undefined;

    const savedCard = keepEditorAssetsAfterMetadataExport(exportedCard, editorCard);

    expect(savedCard.data.modification_date).toBe(200);
    expect(savedCard.data.assets).toEqual(editorCard.data.assets);
  });

  it("leaves exported cards without editor assets unchanged", () => {
    const editorCard = createBlankCard(100);
    const exportedCard = createBlankCard(200);

    expect(keepEditorAssetsAfterMetadataExport(exportedCard, editorCard)).toBe(exportedCard);
  });
});
