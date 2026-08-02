import { describe, expect, it } from "vitest";
import { createBlankCard } from "../schema";
import { canEditCardField, canInjectLorebook, decodeAgentRequest, encodeAgentRequest, permissionForField, resolveAgentRequest } from "./permissions";

describe("agent request permissions", () => {
  it("turns @ targets into enforced scopes", () => {
    const request = resolveAgentRequest("@提示词 润色描述", createBlankCard(), "card");
    expect(request.instruction).toBe("润色描述");
    expect(canEditCardField(request.permission, "/description")).toBe(true);
    expect(canEditCardField(request.permission, "/name")).toBe(false);
    expect(canInjectLorebook(request.permission)).toBe(false);
  });

  it("rejects unknown mentions instead of falling back to full-card access", () => {
    expect(() => resolveAgentRequest("@不存在 修改", createBlankCard(), "card")).toThrow("无法识别");
  });

  it("rejects ambiguous lorebook titles", () => {
    const card = createBlankCard();
    card.data.character_book = {
      extensions: {},
      entries: [0, 1].map((id) => ({ id, comment: "城市", keys: [], secondary_keys: [], content: "", extensions: {}, enabled: true, insertion_order: id, use_regex: false }))
    };
    expect(() => resolveAgentRequest("@城市 修改", card, "card")).toThrow("多个世界书条目");
  });

  it("roundtrips persisted request scope envelopes", () => {
    const permission = permissionForField("/description", "描述");
    expect(decodeAgentRequest(encodeAgentRequest(permission, "润色"))).toEqual({ permission, instruction: "润色" });
  });

  it("does not trust capabilities from a persisted envelope", () => {
    const encoded = `<agent_scope data="${encodeURIComponent(JSON.stringify({ scope: { kind: "field", path: "/description", label: "描述" }, capabilities: ["read", "edit", "inject"] }))}">\n润色\n</agent_scope>`;
    expect(decodeAgentRequest(encoded).permission).toEqual(permissionForField("/description", "描述"));
  });
});
