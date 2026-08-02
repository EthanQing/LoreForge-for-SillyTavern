import { describe, expect, it } from "vitest";
import { createBlankCard } from "../lib/schema";
import { pickPngExportRequest, resolvePngExportBase } from "./pngExportFlow";

describe("PNG export flow", () => {
  it("selects a missing cover before the export destination", async () => {
    const card = createBlankCard();
    const events: string[] = [];

    const request = await pickPngExportRequest(card, {
      pickBasePath: async () => {
        events.push("cover");
        return "C:\\cards\\cover.png";
      },
      pickSavePath: async () => {
        events.push("destination");
        return "C:\\cards\\exported.png";
      },
    });

    expect(events).toEqual(["cover", "destination"]);
    expect(request).toEqual({
      path: "C:\\cards\\exported.png",
      base: { basePngPath: "C:\\cards\\cover.png" },
    });
  });

  it("does not ask for a destination when cover selection is cancelled", async () => {
    const card = createBlankCard();
    let destinationPicked = false;

    const request = await pickPngExportRequest(card, {
      pickBasePath: async () => null,
      pickSavePath: async () => {
        destinationPicked = true;
        return "C:\\cards\\exported.png";
      },
    });

    expect(request).toBeNull();
    expect(destinationPicked).toBe(false);
  });

  it("uses the card cover without showing the cover picker", async () => {
    const card = createBlankCard();
    card.data.assets = [{ type: "icon", name: "main", ext: "png", uri: "file:///C:/cards/cover.png" }];

    const base = await resolvePngExportBase(card, null, {
      pickBasePath: async () => {
        throw new Error("cover picker should not open");
      },
    });

    expect(base).toEqual({ basePngPath: "C:/cards/cover.png" });
  });

  it("uses the existing PNG as the base when overwriting a PNG card", async () => {
    const card = createBlankCard();

    const base = await resolvePngExportBase(card, "C:\\cards\\existing.png", {
      pickBasePath: async () => {
        throw new Error("cover picker should not open");
      },
    });

    expect(base).toEqual({ basePngPath: "C:\\cards\\existing.png" });
  });
});
