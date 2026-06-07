import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BookOpen,
  BarChart3,
  CheckCircle2,
  FileBox,
  FileText,
  Home,
  Image,
  MessageSquareText,
  Moon,
  Save,
  Settings,
  Sparkles,
  Sun,
  UserRound
} from "lucide-react";
import { useCardStore } from "./store";
import { Button } from "../components/Button";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { useI18n, type TranslationKey } from "../lib/i18n";
import { ImportExportPanel } from "../features/import-export/ImportExportPanel";
import { BasicInfoPanel } from "../features/card-editor/BasicInfoPanel";
import { PromptPanel } from "../features/card-editor/PromptPanel";
import { GreetingsPanel } from "../features/card-editor/GreetingsPanel";
import { LorebookPanel } from "../features/lorebook/LorebookPanel";
import { AssetsPanel } from "../features/assets/AssetsPanel";
import { PreviewPanel } from "../features/card-editor/PreviewPanel";
import { ValidationPanel } from "../features/card-editor/ValidationPanel";
import { TokenStatsPanel } from "../features/card-editor/TokenStatsPanel";
import { SettingsPanel } from "../features/settings/SettingsPanel";
import { AiChatDrawer } from "../features/ai-chat/AiChatDrawer";
import { ContextMenu } from "../components/ContextMenu";
import { getCardDisplayName, getCardIdentity } from "./cardIdentity";
import { useProjectActions } from "./useProjectActions";

import { PageTransition } from "../components/PageTransition";

const tabs = [
  { id: "home", labelKey: "nav.project", icon: Home },
  { id: "basic", labelKey: "nav.basic", icon: UserRound },
  { id: "prompts", labelKey: "nav.prompts", icon: FileText },
  { id: "greetings", labelKey: "nav.greetings", icon: MessageSquareText },
  { id: "lorebook", labelKey: "nav.lorebook", icon: BookOpen },
  { id: "assets", labelKey: "nav.assets", icon: Image },
  { id: "preview", labelKey: "nav.preview", icon: Sparkles },
  { id: "tokenStats", labelKey: "nav.tokenStats", icon: BarChart3 },
  { id: "validation", labelKey: "nav.validation", icon: CheckCircle2 },
  { id: "settings", labelKey: "nav.settings", icon: Settings }
] satisfies Array<{ id: string; labelKey: TranslationKey; icon: typeof Home }>;

function ActivePanel() {
  const activeTab = useCardStore((state) => state.activeTab);
  switch (activeTab) {
    case "basic":
      return <BasicInfoPanel />;
    case "prompts":
      return <PromptPanel />;
    case "greetings":
      return <GreetingsPanel />;
    case "lorebook":
      return <LorebookPanel />;
    case "assets":
      return <AssetsPanel />;
    case "preview":
      return <PreviewPanel />;
    case "tokenStats":
      return <TokenStatsPanel />;
    case "validation":
      return <ValidationPanel />;
    case "settings":
      return <SettingsPanel />;
    default:
      return <ImportExportPanel />;
  }
}

export function App() {
  const { locale, t } = useI18n();
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const workspaceScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollPositionsRef = useRef<Record<string, number>>({});
  const activeTabRef = useRef("home");
  const activeTab = useCardStore((state) => state.activeTab);
  const setActiveTab = useCardStore((state) => state.setActiveTab);
  const card = useCardStore((state) => state.card);
  const dirty = useCardStore((state) => state.dirty);
  const currentPath = useCardStore((state) => state.currentPath);
  const cardOrigin = useCardStore((state) => state.cardOrigin);
  const theme = useCardStore((state) => state.theme);
  const setTheme = useCardStore((state) => state.setTheme);
  const report = useCardStore((state) => state.report);
  const { saveCurrentCard } = useProjectActions();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useLayoutEffect(() => {
    activeTabRef.current = activeTab;
    const scrollElement = workspaceScrollRef.current;
    if (!scrollElement) {
      return;
    }
    const nextScrollTop = scrollPositionsRef.current[activeTab] ?? 0;
    if (scrollElement.scrollTop !== nextScrollTop) {
      scrollElement.scrollTop = nextScrollTop;
    }
    if (scrollElement.scrollLeft !== 0) {
      scrollElement.scrollLeft = 0;
    }
  }, [activeTab]);

  const handleWorkspaceScroll = useCallback(() => {
    const scrollElement = workspaceScrollRef.current;
    if (!scrollElement) {
      return;
    }
    scrollPositionsRef.current[activeTabRef.current] = scrollElement.scrollTop;
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t("app.documentTitle");
    document.querySelector('meta[name="description"]')?.setAttribute("content", t("app.documentDescription"));
  }, [locale, t]);

  useEffect(() => {
    const warnOnLeave = (event: BeforeUnloadEvent) => {
      if (!dirty) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnOnLeave);
    return () => window.removeEventListener("beforeunload", warnOnLeave);
  }, [dirty]);

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") {
        return;
      }
      event.preventDefault();
      void saveCurrentCard();
    };

    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [saveCurrentCard]);

  const cardIdentity = getCardIdentity(cardOrigin, currentPath, t);

  return (
    <main className="app-shell" data-context-menu="workspace">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">
            <FileBox size={24} />
          </div>
          <div>
            <h1>{t("app.brand")}</h1>
            <span>CCv3</span>
          </div>
        </div>
        <nav className="tab-list" aria-label={t("a11y.mainNavigation")}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                aria-current={activeTab === tab.id ? "page" : undefined}
                className={activeTab === tab.id ? "tab-button active" : "tab-button"}
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{t(tab.labelKey)}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <Button
            aria-label={t("a11y.switchTheme", { theme: theme === "dark" ? t("theme.light") : t("theme.dark") })}
            icon={theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? t("theme.lightAction") : t("theme.darkAction")}
          </Button>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <strong>{getCardDisplayName(card, t)}</strong>
            <span>{card.spec} / {card.spec_version}</span>
            <div className="active-card-meta" title={cardIdentity.detail}>
              <span className={`document-pill document-pill-${cardIdentity.tone}`}>{cardIdentity.label}</span>
              <span className="document-path">{cardIdentity.detail}</span>
            </div>
          </div>
          <div className="topbar-status">
            <Button
              className={dirty ? "topbar-save-button topbar-save-button-dirty" : "topbar-save-button"}
              icon={<Save size={15} />}
              title={`${t("common.save")} (Ctrl/Cmd+S)`}
              onClick={() => void saveCurrentCard()}
            >
              {t("common.save")}
            </Button>
            <span className={dirty ? "state-pill state-pill-hot" : "state-pill"}>{dirty ? t("common.unsaved") : t("common.saved")}</span>
            <span className={report.valid ? "state-pill" : "state-pill state-pill-hot"}>
              {t("app.issueSummary", { errors: report.errors.length, warnings: report.warnings.length })}
            </span>
          </div>
        </header>
        <div className="workspace-scroll" ref={workspaceScrollRef} onScroll={handleWorkspaceScroll}>
          <ErrorBoundary resetKey={activeTab}>
            <PageTransition activeKey={activeTab}>
              <ActivePanel key={activeTab} />
            </PageTransition>
          </ErrorBoundary>
        </div>
      </section>
      {!aiChatOpen ? (
        <button className="ai-chat-fab" type="button" aria-label={t("a11y.aiChat")} title={t("aiChat.title")} onClick={() => setAiChatOpen(true)}>
          <Sparkles size={22} aria-hidden="true" />
        </button>
      ) : null}
      <AiChatDrawer open={aiChatOpen} onClose={() => setAiChatOpen(false)} />
      <ContextMenu />
    </main>
  );
}
