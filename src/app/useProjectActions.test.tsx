import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCardStore } from "./store";
import { useProjectActions } from "./useProjectActions";
import { createBlankCard } from "../lib/schema";
import { applyCardProposal, createCardProposal } from "../lib/agent/contracts";
import { permissionForPreset } from "../lib/agent/permissions";
import { getAppliedProposalSaveStatus } from "../lib/agent/proposalPresentation";
import { pickCardSavePath, saveCardJson } from "../lib/tauri";

vi.mock("./store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./store")>();
  // Read the live store during the server-rendered hook harness, not its initial SSR snapshot.
  return {
    ...actual,
    useCardStore: Object.assign(
      <T,>(selector: (state: ReturnType<typeof actual.useCardStore.getState>) => T) => selector(actual.useCardStore.getState()),
      actual.useCardStore
    )
  };
});

vi.mock("../lib/tauri", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/tauri")>(),
  saveCardJson: vi.fn(),
  pickCardSavePath: vi.fn()
}));

function projectActions() {
  let actions: ReturnType<typeof useProjectActions> | undefined;
  function Harness() {
    actions = useProjectActions();
    return null;
  }
  renderToStaticMarkup(<Harness />);
  return actions!;
}

describe("saving an applied Agent card snapshot", () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value)
    });
    useCardStore.setState(useCardStore.getInitialState(), true);
    vi.mocked(saveCardJson).mockImplementation(async (_path, card) => ({
      card, report: { valid: true, errors: [], warnings: [] }, warnings: [], source_format: "v3"
    }));
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(["saved", "draft-only", "failed"] as const)("retains the applied card and reports %s accurately", async (state) => {
    const card = createBlankCard();
    useCardStore.setState({ card, currentPath: state === "draft-only" ? null : "card.json" });
    const proposal = createCardProposal({
      workspaceId: "workspace-test", sessionId: "session-test", toolCallId: "tool-test",
      summary: "命名角色", permission: permissionForPreset("basic"),
      changes: [{ kind: "cardEdit", edits: [{ path: "/name", value: "Aster" }] }],
      card, cardRevision: 0
    });
    const outcome = applyCardProposal(proposal, card, 0);
    expect(outcome.state).toBe("applied");
    if (outcome.state !== "applied") throw new Error("Expected applied proposal");
    useCardStore.getState().applyAgentCard(outcome.card);
    if (state === "failed") vi.mocked(saveCardJson).mockRejectedValueOnce(new Error("Access denied"));

    const result = await projectActions().saveCardSnapshot(outcome.card, { promptIfUnbound: false });
    const savedProposal = { ...proposal, state: outcome.state, saveState: result.state };
    expect(savedProposal).toMatchObject({ state: "applied", saveState: state });
    expect(useCardStore.getState().card.data.name).toBe("Aster");
    expect([...storage.values()].some((value) => JSON.parse(value)?.data?.name === "Aster")).toBe(true);
    expect(useCardStore.getState().dirty).toBe(state !== "saved");
    expect(pickCardSavePath).not.toHaveBeenCalled();

    const message = getAppliedProposalSaveStatus(result);
    if (state === "saved") {
      expect(saveCardJson).toHaveBeenCalledWith("card.json", outcome.card);
      expect(message).toContain("已应用并写入文件");
    } else if (state === "draft-only") {
      expect(saveCardJson).not.toHaveBeenCalled();
      expect(message).toContain("已保存为本地草稿");
      expect(message).toContain("尚未写入文件");
    } else {
      expect(result).toEqual({ state: "failed", error: "Access denied" });
      expect(message).toContain("已应用并保存为本地草稿");
      expect(message).toContain("写入文件失败");
      expect(message).toContain("Access denied");
      expect(savedProposal).not.toHaveProperty("error");
    }
  });

  it("preserves a string error from the file command", async () => {
    useCardStore.setState({ currentPath: "card.json" });
    vi.mocked(saveCardJson).mockRejectedValueOnce("Disk full");
    const result = await projectActions().saveCardSnapshot(createBlankCard(), { promptIfUnbound: false });
    expect(result).toEqual({ state: "failed", error: "Disk full" });
    expect(useCardStore.getState().status).toBe("Disk full");
  });

  it("keeps manual unbound save and dialog cancellation working", async () => {
    vi.mocked(pickCardSavePath).mockResolvedValueOnce("manual.json");
    await projectActions().saveCurrentCard();
    expect(saveCardJson).toHaveBeenCalledOnce();
    expect(useCardStore.getState().currentPath).toBe("manual.json");

    useCardStore.setState({ currentPath: null });
    vi.mocked(pickCardSavePath).mockResolvedValueOnce(null);
    expect(await projectActions().saveCardSnapshot(createBlankCard())).toEqual({ state: "draft-only" });
    expect(saveCardJson).toHaveBeenCalledOnce();
  });
});
