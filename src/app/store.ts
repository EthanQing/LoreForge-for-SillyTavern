import { create } from "zustand";
import type { CardAsset, CharacterCardV3, Lorebook, LorebookEntry, ParsedCard, ValidationReport } from "../lib/schema";
import { createBlankCard, createBlankLorebook, createBlankLorebookEntry, unixNow } from "../lib/schema";
import { prepareCardForExport } from "../lib/migrations";
import { validateCard } from "../lib/validation";

const DRAFT_KEY = "sillytavern-card-creator:draft";
const RECENT_KEY = "sillytavern-card-creator:recent";

interface RecentItem {
  path: string;
  name: string;
  savedAt: number;
}

interface CardStore {
  card: CharacterCardV3;
  report: ValidationReport;
  dirty: boolean;
  activeTab: string;
  status: string;
  recent: RecentItem[];
  theme: "light" | "dark";
  setActiveTab: (tab: string) => void;
  setStatus: (status: string) => void;
  setTheme: (theme: "light" | "dark") => void;
  replaceCard: (card: CharacterCardV3, options?: { dirty?: boolean; status?: string; path?: string }) => void;
  updateData: <K extends keyof CharacterCardV3["data"]>(key: K, value: CharacterCardV3["data"][K]) => void;
  updateCard: (updater: (card: CharacterCardV3) => CharacterCardV3) => void;
  newCard: () => void;
  markSaved: (card?: CharacterCardV3, path?: string) => void;
  refreshValidation: () => void;
  updateLorebook: (updater: (book: Lorebook) => Lorebook) => void;
  addLorebookEntry: () => void;
  updateLorebookEntry: (index: number, updater: (entry: LorebookEntry) => LorebookEntry) => void;
  removeLorebookEntry: (index: number) => void;
  reorderLorebookEntry: (from: number, to: number) => void;
  addAsset: (asset: CardAsset) => void;
  updateAsset: (index: number, updater: (asset: CardAsset) => CardAsset) => void;
  removeAsset: (index: number) => void;
}

function loadDraft(): CharacterCardV3 {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as CharacterCardV3) : createBlankCard();
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

function saveDraft(card: CharacterCardV3): void {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(card));
}

function saveRecent(recent: RecentItem[]): void {
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 12)));
}

function addRecent(recent: RecentItem[], path?: string, card?: CharacterCardV3): RecentItem[] {
  if (!path || !card) {
    return recent;
  }

  const name = card.data.name.trim() || path.split(/[\\/]/).pop() || "Untitled";
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

const initialCard = typeof window === "undefined" ? createBlankCard() : loadDraft();

export const useCardStore = create<CardStore>((set, get) => ({
  card: initialCard,
  report: validateCard(initialCard),
  dirty: false,
  activeTab: "home",
  status: "Draft loaded",
  recent: typeof window === "undefined" ? [] : loadRecent(),
  theme: "light",
  setActiveTab: (activeTab) => set({ activeTab }),
  setStatus: (status) => set({ status }),
  setTheme: (theme) => {
    document.documentElement.dataset.theme = theme;
    set({ theme });
  },
  replaceCard: (card, options) => {
    const report = validateCard(card);
    saveDraft(card);
    set((state) => ({
      card,
      report,
      dirty: options?.dirty ?? false,
      status: options?.status ?? state.status,
      recent: addRecent(state.recent, options?.path, card)
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
    saveDraft(card);
    set({ card, report, dirty: true, status: "Draft saved locally" });
  },
  newCard: () => {
    const card = createBlankCard();
    saveDraft(card);
    set({ card, report: validateCard(card), dirty: false, status: "New card created", activeTab: "basic" });
  },
  markSaved: (card, path) => {
    const saved = card ?? prepareCardForExport(get().card);
    saveDraft(saved);
    set((state) => ({
      card: saved,
      report: validateCard(saved),
      dirty: false,
      status: "Saved",
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
      const entries = [...book.entries];
      const [moved] = entries.splice(from, 1);
      entries.splice(to, 0, moved);
      return {
        ...book,
        entries: entries.map((entry, index) => ({ ...entry, insertion_order: index }))
      };
    });
  },
  addAsset: (asset) => get().updateData("assets", [...(get().card.data.assets ?? []), asset]),
  updateAsset: (index, updater) => {
    get().updateData(
      "assets",
      (get().card.data.assets ?? []).map((asset, assetIndex) => (assetIndex === index ? updater(asset) : asset))
    );
  },
  removeAsset: (index) => get().updateData("assets", (get().card.data.assets ?? []).filter((_, assetIndex) => assetIndex !== index))
}));

export function applyParsedCard(parsed: ParsedCard, path?: string): void {
  useCardStore.getState().replaceCard(parsed.card, {
    dirty: false,
    status: parsed.warnings.length ? parsed.warnings.join(" ") : "Card opened",
    path
  });
}
