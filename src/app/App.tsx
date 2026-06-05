import { useEffect } from "react";
import {
  BookOpen,
  CheckCircle2,
  FileBox,
  FileText,
  Home,
  Image,
  MessageSquareText,
  Moon,
  Sparkles,
  Sun,
  UserRound
} from "lucide-react";
import { useCardStore } from "./store";
import { Button } from "../components/Button";
import { ImportExportPanel } from "../features/import-export/ImportExportPanel";
import { BasicInfoPanel } from "../features/card-editor/BasicInfoPanel";
import { PromptPanel } from "../features/card-editor/PromptPanel";
import { GreetingsPanel } from "../features/card-editor/GreetingsPanel";
import { LorebookPanel } from "../features/lorebook/LorebookPanel";
import { AssetsPanel } from "../features/assets/AssetsPanel";
import { PreviewPanel } from "../features/card-editor/PreviewPanel";
import { ValidationPanel } from "../features/card-editor/ValidationPanel";

const tabs = [
  { id: "home", label: "Project", icon: Home },
  { id: "basic", label: "Basic", icon: UserRound },
  { id: "prompts", label: "Prompts", icon: FileText },
  { id: "greetings", label: "Greetings", icon: MessageSquareText },
  { id: "lorebook", label: "Lorebook", icon: BookOpen },
  { id: "assets", label: "Assets", icon: Image },
  { id: "preview", label: "Preview", icon: Sparkles },
  { id: "validation", label: "Validation", icon: CheckCircle2 }
] as const;

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
    case "validation":
      return <ValidationPanel />;
    default:
      return <ImportExportPanel />;
  }
}

export function App() {
  const activeTab = useCardStore((state) => state.activeTab);
  const setActiveTab = useCardStore((state) => state.setActiveTab);
  const card = useCardStore((state) => state.card);
  const dirty = useCardStore((state) => state.dirty);
  const theme = useCardStore((state) => state.theme);
  const setTheme = useCardStore((state) => state.setTheme);
  const report = useCardStore((state) => state.report);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

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

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark">
            <FileBox size={24} />
          </div>
          <div>
            <h1>Card Creator</h1>
            <span>CCv3</span>
          </div>
        </div>
        <nav className="tab-list">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                className={activeTab === tab.id ? "tab-button active" : "tab-button"}
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <Button
            aria-label="Toggle theme"
            icon={theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? "Light" : "Dark"}
          </Button>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <strong>{card.data.nickname || card.data.name || "Untitled Card"}</strong>
            <span>{card.spec} / {card.spec_version}</span>
          </div>
          <div className="topbar-status">
            <span className={dirty ? "state-pill state-pill-hot" : "state-pill"}>{dirty ? "Unsaved" : "Saved"}</span>
            <span className={report.valid ? "state-pill" : "state-pill state-pill-hot"}>
              {report.errors.length} errors / {report.warnings.length} warnings
            </span>
          </div>
        </header>
        <ActivePanel />
      </section>
    </main>
  );
}
