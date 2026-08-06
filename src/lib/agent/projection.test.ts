import { describe, expect, it } from "vitest";
import { createBlankCard, createBlankLorebook } from "../schema";
import { permissionForPreset } from "./permissions";
import { projectCard, projectCardForPermission } from "./projection";

function cardWithBinding() {
  const card = createBlankCard(1);
  const book = createBlankLorebook();
  book.name = "Embedded World";
  card.data.character_book = book;
  card.data.extensions.world = "Linked World";
  return card;
}

describe("agent card projection", () => {
  it("exposes the SillyTavern binding as read-only lorebook context", () => {
    const card = cardWithBinding();

    expect(projectCard(card, 4).lorebook).toMatchObject({
      name: "Embedded World",
      linkedWorldName: "Linked World"
    });
    expect(projectCardForPermission(card, 4, permissionForPreset("worldbook"))).toMatchObject({
      cardRevision: 4,
      lorebook: {
        name: "Embedded World",
        linkedWorldName: "Linked World"
      }
    });
  });
});
