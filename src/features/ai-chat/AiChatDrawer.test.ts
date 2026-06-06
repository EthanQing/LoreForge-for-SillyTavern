import { describe, expect, it } from "vitest";
import {
  buildMentionTargets,
  filterMentionTargets,
  filterWorkflowActions,
  findActiveMentionQuery,
  findActiveWorkflowQuery
} from "./AiChatDrawer";
import type { AiWorkflowAction } from "../../lib/aiAgent";
import { createBlankCard } from "../../lib/schema";

describe("AI chat mention autocomplete", () => {
  it("detects the active mention query at the cursor", () => {
    const value = "请 @基";
    expect(findActiveMentionQuery(value, value.length)).toEqual({
      start: 2,
      end: 4,
      query: "基"
    });
  });

  it("stops mention query detection after punctuation", () => {
    const value = "@基础，帮我补全";
    expect(findActiveMentionQuery(value, value.length)).toBeUndefined();
  });

  it("matches broad mention targets by partial input", () => {
    const targets = buildMentionTargets(createBlankCard());
    expect(filterMentionTargets(targets, "基")[0].value).toBe("@基础");
    expect(filterMentionTargets(targets, "world")[0].value).toBe("@世界书");
  });

  it("includes lorebook entries as selectable mention targets", () => {
    const card = createBlankCard();
    card.data.character_book = {
      extensions: {},
      entries: [
        {
          id: "wb_city",
          name: "灰港",
          keys: ["港口"],
          content: "灰港是一座潮湿的贸易城。",
          extensions: {},
          enabled: true,
          insertion_order: 0,
          use_regex: false
        }
      ]
    };

    const targets = buildMentionTargets(card);
    expect(filterMentionTargets(targets, "灰")[0].value).toBe("@灰港");
    expect(filterMentionTargets(targets, "港口")[0].value).toBe("@灰港");
  });
});

describe("AI chat workflow commands", () => {
  const actions: AiWorkflowAction[] = [
    "diagnose",
    "complete_draft",
    "extract_source",
    "consistency_repair",
    "token_optimize",
    "worldbook_build",
    "import_cleanup"
  ];
  const labels: Record<AiWorkflowAction, string> = {
    diagnose: "Card Diagnosis",
    complete_draft: "Complete Draft",
    extract_source: "Extract Source",
    consistency_repair: "Consistency Repair",
    token_optimize: "Token Optimize",
    worldbook_build: "Build Lorebook",
    import_cleanup: "Import Cleanup"
  };

  it("detects slash workflow queries at the cursor", () => {
    const value = "please /worldbook";
    expect(findActiveWorkflowQuery(value, value.length)).toEqual({
      start: 7,
      end: value.length,
      query: "worldbook"
    });
    expect(findActiveWorkflowQuery("https://example.com/path", "https://example.com/path".length)).toBeUndefined();
  });

  it("matches workflow actions by label and id", () => {
    const getLabel = (action: AiWorkflowAction) => labels[action];

    expect(filterWorkflowActions(actions, "draft", getLabel)[0]).toBe("complete_draft");
    expect(filterWorkflowActions(actions, "Card Diagnosis", getLabel)[0]).toBe("diagnose");
    expect(filterWorkflowActions(actions, "worldbook", getLabel)[0]).toBe("worldbook_build");
  });
});
