import { Download, FileArchive, FileJson, FolderOpen, ImageDown, Save } from "lucide-react";
import { Button } from "../../components/Button";
import { useCardStore } from "../../app/store";
import { dataImageToPngDataUrl, fileUriToPath, findMainIconAsset, isDataImageUri } from "../../lib/imageAssets";
import { useI18n } from "../../lib/i18n";
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
  const { t } = useI18n();
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
        status: parsed.warnings.length > 0 ? parsed.warnings.join(" ") : t("status.cardOpened"),
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
      const cover = findMainIconAsset(card);
      const coverUri = typeof cover?.uri === "string" ? cover.uri : "";
      const coverBase =
        coverUri && isDataImageUri(coverUri)
          ? { basePngDataUrl: await dataImageToPngDataUrl(coverUri) }
          : coverUri
            ? { basePngPath: fileUriToPath(coverUri) }
            : {};
      const basePath = coverBase.basePngDataUrl || coverBase.basePngPath ? null : await pickPngOpenPath();
      if (!coverBase.basePngDataUrl && !coverBase.basePngPath && !basePath) {
        return;
      }
      const path = await pickPngSavePath();
      if (!path) {
        return;
      }
      const parsed = await exportCardPng(path, card, { compatibility_v2: true }, basePath ? { basePngPath: basePath } : coverBase);
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
        <h2>{t("project.title")}</h2>
        <span className={dirty ? "state-pill state-pill-hot" : "state-pill"}>{dirty ? t("common.unsaved") : t("common.saved")}</span>
      </div>
      <div className="action-grid">
        <Button icon={<FileJson size={18} />} variant="primary" onClick={newCard}>
          {t("project.newCard")}
        </Button>
        <Button icon={<FolderOpen size={18} />} onClick={() => openCard()}>
          {t("project.openCard")}
        </Button>
        <Button icon={<Save size={18} />} onClick={exportJson}>
          {t("project.exportJson")}
        </Button>
        <Button icon={<ImageDown size={18} />} onClick={exportPng}>
          {t("project.exportPng")}
        </Button>
        <Button icon={<FileArchive size={18} />} onClick={exportCharxFile}>
          {t("project.exportCharx")}
        </Button>
        <Button icon={<Download size={18} />} onClick={() => setStatus(t("status.draftAutosaved"))}>
          {t("project.draftStatus")}
        </Button>
      </div>
      <div className="status-line" role="status" aria-live="polite">{status}</div>
      <div className="recent-list">
        <h3>{t("project.recent")}</h3>
        {recent.length === 0 ? <p className="muted">{t("project.noRecentFiles")}</p> : null}
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
