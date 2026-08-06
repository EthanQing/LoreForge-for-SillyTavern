import { describe, expect, it } from "vitest";
import { createBlankCard, createBlankLorebook } from "./schema";
import { validateCard } from "./validation";

describe("card validation", () => {
  it("warns when SillyTavern points at a different lorebook name", () => {
    const card = createBlankCard(1);
    const book = createBlankLorebook();
    book.name = "New World";
    card.data.character_book = book;
    card.data.extensions.world = "Old World";

    const report = validateCard(card);

    expect(report.valid).toBe(true);
    expect(report.warnings).toContainEqual({
      level: "warning",
      code: "lorebook_binding_mismatch",
      path: "data.extensions.world",
      message: expect.stringContaining("Old World")
    });
  });

  it("warns when only the surrounding whitespace differs", () => {
    const card = createBlankCard(1);
    const book = createBlankLorebook();
    book.name = " New World ";
    card.data.character_book = book;
    card.data.extensions.world = "New World";

    expect(validateCard(card).warnings).toContainEqual(expect.objectContaining({ code: "lorebook_binding_mismatch" }));
  });
});
