import { Download, FileArchive, FileJson, FolderOpen, ImageDown, Save } from "lucide-react";
import { Button } from "../../components/Button";
import { useCardStore } from "../../app/store";
import {
  exportCardPng,
  exportCharx,
  openCardFile,
  pickCharxSavePath,
  pickJsonSavePath,
  pickOpenCardPath,
  pickPngOpenPath,
  pickPngSavePath,
  saveCardJson,
} from "../../lib/tauri";

export function ImportExportPanel() {
  const card = useCardStore((state) => state.card);
  const dirty = useCardStore((state) => state.dirty);
  const status = useCardStore((state) => state.status);
  const recent = useCardStore((state) => state.recent);
  const newCard = useCardStore((state) => state.newCard);
  const replaceCard = useCardStore((state) => state.replaceCard);
  const markSaved = useCardStore((state) => state.markSaved);
  const setStatus = useCardStore((state) => state.setStatus);

  const openCard = async (forcedPath?: string) => {
    try {
      const path = forcedPath ?? (await pickOpenCardPath());
      if (!path) {
        return;
      }
      const parsed = await openCardFile(path);
      replaceCard(parsed.card, {
        dirty: false,
        path,
        status: parsed.warnings.length > 0 ? parsed.warnings.join(" ") : "Card opened",
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const exportJson = async () => {
    try {
      const path = await pickJsonSavePath();
      if (!path) {
        return;
      }
      const parsed = await saveCardJson(path, card);
      markSaved(parsed.card, path);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const exportPng = async () => {
    try {
      const basePath = await pickPngOpenPath();
      if (!basePath) {
        return;
      }
      const path = await pickPngSavePath();
      if (!path) {
        return;
      }
      const parsed = await exportCardPng(path, basePath, card, { compatibility_v2: true });
      markSaved(parsed.card, path);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const exportCharxFile = async () => {
    try {
      const path = await pickCharxSavePath();
      if (!path) {
        return;
      }
      const parsed = await exportCharx(path, card, []);
      markSaved(parsed.card, path);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Project</h2>
        <span className={dirty ? "state-pill state-pill-hot" : "state-pill"}>{dirty ? "Unsaved" : "Saved"}</span>
      </div>
      <div className="action-grid">
        <Button icon={<FileJson size={18} />} variant="primary" onClick={newCard}>
          New Card
        </Button>
        <Button icon={<FolderOpen size={18} />} onClick={() => openCard()}>
          Open JSON / PNG / CHARX
        </Button>
        <Button icon={<Save size={18} />} onClick={exportJson}>
          Export JSON
        </Button>
        <Button icon={<ImageDown size={18} />} onClick={exportPng}>
          Export PNG
        </Button>
        <Button icon={<FileArchive size={18} />} onClick={exportCharxFile}>
          Export CHARX
        </Button>
        <Button icon={<Download size={18} />} onClick={() => setStatus("Draft is autosaved locally")}>
          Draft Status
        </Button>
      </div>
      <div className="status-line">{status}</div>
      <div className="recent-list">
        <h3>Recent</h3>
        {recent.length === 0 ? <p className="muted">No recent files</p> : null}
        {recent.map((item) => (
          <button className="recent-item" key={item.path} type="button" onClick={() => openCard(item.path)}>
            <strong>{item.name}</strong>
            <span>{item.path}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
