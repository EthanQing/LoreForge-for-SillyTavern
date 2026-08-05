import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { useCardStore } from "./store";
import { Button } from "../components/Button";
import { ContextMenu } from "../components/ContextMenu";
import { AgentStudio } from "../features/agent-studio/AgentStudio";
import { useProjectActions } from "./useProjectActions";
import { useI18n } from "../lib/i18n";
import { checkForUpdates, skipUpdateVersion, type AvailableUpdate, type UpdateProgress } from "../lib/updater";

export function App() {
  const { locale, t } = useI18n();
  const theme = useCardStore((state) => state.theme);
  const dirty = useCardStore((state) => state.dirty);
  const setStatus = useCardStore((state) => state.setStatus);
  const { saveCurrentCard } = useProjectActions();
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = locale;
    document.title = t("app.documentTitle");
    document.querySelector('meta[name="description"]')?.setAttribute("content", t("app.documentDescription"));
  }, [locale, t, theme]);

  useEffect(() => {
    let mounted = true;
    void checkForUpdates().then((result) => {
      if (mounted && result.status === "available") {
        setAvailableUpdate(result.update);
        setStatus(t("updates.availableStatus", { version: result.update.version }));
      }
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, [setStatus, t]);

  useEffect(() => {
    const warnOnLeave = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (!event.isComposing && !event.altKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveCurrentCard();
      }
    };
    window.addEventListener("beforeunload", warnOnLeave);
    window.addEventListener("keydown", handleSaveShortcut);
    return () => {
      window.removeEventListener("beforeunload", warnOnLeave);
      window.removeEventListener("keydown", handleSaveShortcut);
    };
  }, [dirty, saveCurrentCard]);

  const installUpdate = async () => {
    if (!availableUpdate?.install) return;
    setUpdateInstalling(true);
    try {
      await availableUpdate.install(setUpdateProgress);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setUpdateInstalling(false);
    }
  };

  const dismissUpdate = () => {
    if (availableUpdate) skipUpdateVersion(availableUpdate.version);
    setAvailableUpdate(null);
    setUpdateProgress(null);
  };

  return (
    <main className="app-shell card-workshop-shell">
      {availableUpdate ? <div className="update-banner card-workshop-update" role="status"><div><strong>{t("updates.available", { version: availableUpdate.version })}</strong>{updateProgress ? <small>{formatUpdateProgress(updateProgress)}</small> : null}</div><div className="update-banner-actions">{availableUpdate.install ? <Button disabled={updateInstalling} icon={<Download size={15} />} onClick={() => void installUpdate()}>{updateInstalling ? t("updates.installing") : t("updates.installNow")}</Button> : null}<Button variant="ghost" onClick={dismissUpdate}>{t("updates.later")}</Button></div></div> : null}
      <AgentStudio />
      <ContextMenu />
    </main>
  );
}

function formatUpdateProgress(progress: UpdateProgress): string {
  if (progress.finished) return "100%";
  if (!progress.total || progress.total <= 0) return Math.round(progress.downloaded / 1024) + " KB";
  return Math.min(100, Math.round((progress.downloaded / progress.total) * 100)) + "%";
}
