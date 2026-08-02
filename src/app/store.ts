import { create } from "zustand";
import type { CardAsset, CharacterCardV3, Lorebook, LorebookEntry, ParsedCard, ValidationReport } from "../lib/schema";
import { createBlankCard, createBlankLorebook, createBlankLorebookEntry, unixNow } from "../lib/schema";
import { prepareCardForExport } from "../lib/migrations";
import { validateCard } from "../lib/validation";
import type { AiModel, AiSettings } from "../lib/ai";
import { defaultAiSettings, normalizeAiSettings } from "../lib/ai";
import { translate } from "../lib/i18n";

const DRAFT_KEY = "sillytavern-card-creator:draft";
const DRAFT_META_KEY = "sillytavern-card-creator:draft-meta";
const RECENT_KEY = "sillytavern-card-creator:recent";
const AI_SETTINGS_KEY = "sillytavern-card-creator:ai-settings";

export type CardOrigin = "draft" | "file" | "new";

interface DraftMeta {
  currentPath: string | null;
  origin: CardOrigin;
  dirty: boolean;
  workspaceId: string;
  cardRevision: number;
}

export interface RecentItem {
  path: string;
  name: string;
  savedAt: number;
}

interface CardStore {
  card: CharacterCardV3;
  workspaceId: string;
  cardRevision: number;
  report: ValidationReport;
  dirty: boolean;
  currentPath: string | null;
  cardOrigin: CardOrigin;
  activeTab: string;
  status: string;
  recent: RecentItem[];
  theme: "light" | "dark";
  aiSettings: AiSettings;
  setActiveTab: (tab: string) => void;
  setStatus: (status: string) => void;
  setTheme: (theme: "light" | "dark") => void;
  updateAiSettings: (settings: Partial<AiSettings>) => void;
  setAiModels: (models: AiModel[]) => void;
  replaceCard: (card: CharacterCardV3, options?: { dirty?: boolean; status?: string; path?: string; origin?: CardOrigin; workspaceId?: string }) => void;
  updateData: <K extends keyof CharacterCardV3["data"]>(key: K, value: CharacterCardV3["data"][K]) => void;
  updateCard: (updater: (card: CharacterCardV3) => CharacterCardV3) => void;
  applyAgentCard: (card: CharacterCardV3, status?: string) => void;
  newCard: () => void;
  markSaved: (card?: CharacterCardV3, path?: string) => void;
  refreshValidation: () => void;
  updateLorebook: (updater: (book: Lorebook) => Lorebook) => void;
  addLorebookEntry: () => void;
  updateLorebookEntry: (index: number, updater: (entry: LorebookEntry) => LorebookEntry) => void;
  removeLorebookEntry: (index: number) => void;
  reorderLorebookEntry: (from: number, to: number) => void;
  addAsset: (asset: CardAsset) => void;
  addAssets: (assets: CardAsset[]) => void;
  updateAsset: (index: number, updater: (asset: CardAsset) => CardAsset) => void;
  removeAsset: (index: number) => void;
  removeRecent: (path: string) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readModificationDate(card: unknown): number | undefined {
  if (!isRecord(card) || !isRecord(card.data)) {
    return undefined;
  }
  return typeof card.data.modification_date === "number" && Number.isFinite(card.data.modification_date)
    ? Math.trunc(card.data.modification_date)
    : undefined;
}

function normalizeStoredCard(card: unknown): CharacterCardV3 {
  const now = unixNow();
  return prepareCardForExport(isRecord(card) ? (card as CharacterCardV3) : createBlankCard(now), readModificationDate(card) ?? now);
}

function loadDraft(): CharacterCardV3 {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? normalizeStoredCard(JSON.parse(raw)) : createBlankCard();
  } catch {
    return createBlankCard();
  }
}

function loadRecent(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as RecentItem[]) : [];
  } catch {
    return [];
  }
}

function normalizeOrigin(value: unknown): CardOrigin {
  return value === "file" || value === "new" || value === "draft" ? value : "draft";
}

function loadDraftMeta(): DraftMeta {
  try {
    const raw = localStorage.getItem(DRAFT_META_KEY);
    if (!raw) {
      return { currentPath: null, origin: "draft", dirty: false, workspaceId: createWorkspaceId(), cardRevision: 0 };
    }
    const parsed = JSON.parse(raw) as Partial<DraftMeta>;
    const currentPath = typeof parsed.currentPath === "string" && parsed.currentPath.trim() ? parsed.currentPath : null;
    const origin = currentPath ? normalizeOrigin(parsed.origin) : normalizeOrigin(parsed.origin) === "file" ? "draft" : normalizeOrigin(parsed.origin);
    return {
      currentPath,
      origin,
      dirty: Boolean(parsed.dirty),
      workspaceId: typeof parsed.workspaceId === "string" && parsed.workspaceId.trim() ? parsed.workspaceId : createWorkspaceId(),
      cardRevision: typeof parsed.cardRevision === "number" && Number.isInteger(parsed.cardRevision) && parsed.cardRevision >= 0 ? parsed.cardRevision : 0
    };
  } catch {
    return { currentPath: null, origin: "draft", dirty: false, workspaceId: createWorkspaceId(), cardRevision: 0 };
  }
}

function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY);
    const settings = raw ? normalizeAiSettings(JSON.parse(raw)) : { ...defaultAiSettings };
    return { ...settings, apiKey: "" };
  } catch {
    return defaultAiSettings;
  }
}

function saveDraft(card: CharacterCardV3): void {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(card));
}

function hasStoredDraft(): boolean {
  return localStorage.getItem(DRAFT_KEY) !== null;
}

function saveDraftMeta(meta: DraftMeta): void {
  localStorage.setItem(DRAFT_META_KEY, JSON.stringify(meta));
}

function saveRecent(recent: RecentItem[]): void {
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 12)));
}

function saveAiSettings(settings: AiSettings): void {
  const { apiKey: _apiKey, ...safeSettings } = settings;
  localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(safeSettings));
}

function addRecent(recent: RecentItem[], path?: string, card?: CharacterCardV3): RecentItem[] {
  if (!path || !card) {
    return recent;
  }

  const name = card.data.name.trim() || path.split(/[\\/]/).pop() || translate("app.untitledCard");
  const next = [{ path, name, savedAt: unixNow() }, ...recent.filter((item) => item.path !== path)].slice(0, 12);
  saveRecent(next);
  return next;
}

function touch(card: CharacterCardV3): CharacterCardV3 {
  return {
    ...card,
    data: {
      ...card.data,
      modification_date: unixNow()
    }
  };
}

export function reorderLorebookEntriesForDisplay(entries: LorebookEntry[], from: number, to: number): LorebookEntry[] {
  if (from === to || from < 0 || to < 0 || from >= entries.length || to >= entries.length) {
    return entries;
  }
  const movedEntries = [...entries];
  const [moved] = movedEntries.splice(from, 1);
  if (!moved) {
    return entries;
  }
  movedEntries.splice(to, 0, moved);
  return movedEntries;
}

function createWorkspaceId(path?: string | null): string {
  if (path) {
    let hash = 2166136261;
    for (const character of path.replaceAll("\\", "/").toLowerCase()) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return `workspace-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }
  if (globalThis.crypto?.randomUUID) {
    return `workspace-${globalThis.crypto.randomUUID()}`;
  }
  return `workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function promoteAlternateGreetingToFirst(firstMessage: string, alternateGreetings: string[], index: number): string[] {
  if (index < 0 || index >= alternateGreetings.length) {
    return alternateGreetings;
  }
  return alternateGreetings.map((greeting, itemIndex) => (itemIndex === index ? firstMessage : greeting));
}

const initialCard = typeof window === "undefined" ? createBlankCard() : loadDraft();
const initialDraftMeta =
  typeof window === "undefined" || !hasStoredDraft()
    ? ({ currentPath: null, origin: "new", dirty: false, workspaceId: createWorkspaceId(), cardRevision: 0 } satisfies DraftMeta)
    : loadDraftMeta();
const initialAiSettings = typeof window === "undefined" ? defaultAiSettings : loadAiSettings();

export const useCardStore = create<CardStore>((set, get) => ({
  card: initialCard,
  workspaceId: initialDraftMeta.workspaceId,
  cardRevision: initialDraftMeta.cardRevision,
  report: validateCard(initialCard),
  dirty: initialDraftMeta.dirty,
  currentPath: initialDraftMeta.currentPath,
  cardOrigin: initialDraftMeta.origin,
  activeTab: "home",
  status: translate("status.draftLoaded"),
  recent: typeof window === "undefined" ? [] : loadRecent(),
  theme: "light",
  aiSettings: initialAiSettings,
  setActiveTab: (activeTab) => set({ activeTab }),
  setStatus: (status) => set({ status }),
  setTheme: (theme) => {
    document.documentElement.dataset.theme = theme;
    set({ theme });
  },
  updateAiSettings: (settings) => {
    const next = normalizeAiSettings({ ...get().aiSettings, ...settings });
    saveAiSettings(next);
    set({ aiSettings: next, status: translate("status.aiSettingsSaved") });
  },
  setAiModels: (models) => {
    const current = get().aiSettings;
    const model = models[0]?.id ?? current.model;
    const next = normalizeAiSettings({ ...current, availableModels: models, manualModelInput: false, model });
    saveAiSettings(next);
    set({ aiSettings: next, status: models.length ? translate("status.modelsLoaded", { count: models.length }) : translate("status.noModelsReturned") });
  },
  replaceCard: (card, options) => {
    const normalized = normalizeStoredCard(card);
    const report = validateCard(normalized);
    const dirty = options?.dirty ?? false;
    const currentPath = options?.path ?? null;
    const cardOrigin = currentPath ? "file" : options?.origin ?? "draft";
    const workspaceId = options?.workspaceId ?? (currentPath ? createWorkspaceId(currentPath) : get().workspaceId);
    const cardRevision = workspaceId === get().workspaceId ? get().cardRevision + 1 : 0;
    saveDraft(normalized);
    saveDraftMeta({ currentPath, origin: cardOrigin, dirty, workspaceId, cardRevision });
    set((state) => ({
      card: normalized,
      workspaceId,
      cardRevision,
      report,
      dirty,
      currentPath,
      cardOrigin,
      status: options?.status ?? state.status,
      recent: addRecent(state.recent, options?.path, normalized)
    }));
  },
  updateData: (key, value) => {
    get().updateCard((card) => ({
      ...card,
      data: {
        ...card.data,
        [key]: value
      }
    }));
  },
  updateCard: (updater) => {
    const card = touch(updater(get().card));
    const report = validateCard(card);
    const { currentPath, cardOrigin } = get();
    saveDraft(card);
    const cardRevision = get().cardRevision + 1;
    saveDraftMeta({ currentPath, origin: cardOrigin, dirty: true, workspaceId: get().workspaceId, cardRevision });
    set({ card, report, dirty: true, cardRevision, status: translate("status.draftSavedLocally") });
  },
  applyAgentCard: (card, status) => {
    const applied = prepareCardForExport(card);
    const report = validateCard(applied);
    const { currentPath, cardOrigin } = get();
    saveDraft(applied);
    const cardRevision = get().cardRevision + 1;
    saveDraftMeta({ currentPath, origin: cardOrigin, dirty: true, workspaceId: get().workspaceId, cardRevision });
    set({ card: applied, report, dirty: true, cardRevision, status: status ?? translate("status.draftSavedLocally") });
  },
  newCard: () => {
    const card = createBlankCard();
    const workspaceId = createWorkspaceId();
    saveDraft(card);
    saveDraftMeta({ currentPath: null, origin: "new", dirty: false, workspaceId, cardRevision: 0 });
    set({ card, workspaceId, cardRevision: 0, report: validateCard(card), dirty: false, currentPath: null, cardOrigin: "new", status: translate("status.newCardCreated"), activeTab: "basic" });
  },
  markSaved: (card, path) => {
    const saved = card ?? prepareCardForExport(get().card);
    const currentPath = path ?? get().currentPath;
    const cardOrigin = currentPath ? "file" : get().cardOrigin;
    saveDraft(saved);
    saveDraftMeta({ currentPath, origin: cardOrigin, dirty: false, workspaceId: get().workspaceId, cardRevision: get().cardRevision });
    set((state) => ({
      card: saved,
      report: validateCard(saved),
      dirty: false,
      currentPath,
      cardOrigin,
      status: translate("status.saved"),
      recent: addRecent(state.recent, path, saved)
    }));
  },
  refreshValidation: () => set((state) => ({ report: validateCard(state.card) })),
  updateLorebook: (updater) => {
    const current = get().card.data.character_book ?? createBlankLorebook();
    get().updateData("character_book", updater(current));
  },
  addLorebookEntry: () => {
    const current = get().card.data.character_book ?? createBlankLorebook();
    const nextOrder = current.entries.length ? Math.max(...current.entries.map((entry) => entry.insertion_order)) + 1 : 0;
    get().updateData("character_book", {
      ...current,
      entries: [...current.entries, createBlankLorebookEntry(nextOrder)]
    });
  },
  updateLorebookEntry: (index, updater) => {
    get().updateLorebook((book) => ({
      ...book,
      entries: book.entries.map((entry, entryIndex) => (entryIndex === index ? updater(entry) : entry))
    }));
  },
  removeLorebookEntry: (index) => {
    get().updateLorebook((book) => ({
      ...book,
      entries: book.entries.filter((_, entryIndex) => entryIndex !== index)
    }));
  },
  reorderLorebookEntry: (from, to) => {
    get().updateLorebook((book) => {
      return {
        ...book,
        entries: reorderLorebookEntriesForDisplay(book.entries, from, to)
      };
    });
  },
  addAsset: (asset) => get().updateData("assets", [...(get().card.data.assets ?? []), asset]),
  addAssets: (assets) => {
    if (assets.length === 0) {
      return;
    }
    get().updateData("assets", [...(get().card.data.assets ?? []), ...assets]);
  },
  updateAsset: (index, updater) => {
    get().updateData(
      "assets",
      (get().card.data.assets ?? []).map((asset, assetIndex) => (assetIndex === index ? updater(asset) : asset))
    );
  },
  removeAsset: (index) => get().updateData("assets", (get().card.data.assets ?? []).filter((_, assetIndex) => assetIndex !== index)),
  removeRecent: (path) => {
    const next = get().recent.filter((item) => item.path !== path);
    saveRecent(next);
    set({ recent: next, status: translate("status.recentRemoved") });
  }
}));

export function applyParsedCard(parsed: ParsedCard, path?: string): void {
  useCardStore.getState().replaceCard(parsed.card, {
    dirty: false,
    status: parsed.warnings.length ? parsed.warnings.join(" ") : translate("status.cardOpened"),
    path
  });
}
