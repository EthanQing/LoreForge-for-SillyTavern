import { Download, FileArchive, FileJson, FolderOpen, ImageDown, Save } from "lucide-react";
import { Button } from "../../components/Button";
import { useCardStore } from "../../app/store";
import { useProjectActions } from "../../app/useProjectActions";
import { getCardDisplayName, getCardIdentity } from "../../app/cardIdentity";
import { useI18n } from "../../lib/i18n";

export function ImportExportPanel() {
  const { t } = useI18n();
  const card = useCardStore((state) => state.card);
  const dirty = useCardStore((state) => state.dirty);
  const currentPath = useCardStore((state) => state.currentPath);
  const cardOrigin = useCardStore((state) => state.cardOrigin);
  const status = useCardStore((state) => state.status);
  const { recent, createNewCard, openCard, saveCurrentCard, exportJson, exportPng, exportCharxFile, showDraftStatus } = useProjectActions();
  const cardIdentity = getCardIdentity(cardOrigin, currentPath, t);

  return (
    <section className="panel" data-context-menu="project">
      <div className="panel-heading">
        <h2>{t("project.title")}</h2>
        <span className={dirty ? "state-pill state-pill-hot" : "state-pill"}>{dirty ? t("common.unsaved") : t("common.saved")}</span>
      </div>
      <div className="active-card-summary">
        <div>
          <span>{t("project.currentEditing")}</span>
          <strong>{getCardDisplayName(card, t)}</strong>
          <small title={cardIdentity.detail}>{cardIdentity.detail}</small>
        </div>
        <span className={`document-pill document-pill-${cardIdentity.tone}`}>{cardIdentity.label}</span>
      </div>
      <div className="action-grid">
        <Button icon={<FileJson size={18} />} variant="primary" onClick={createNewCard}>
          {t("project.newCard")}
        </Button>
        <Button icon={<FolderOpen size={18} />} onClick={() => openCard()}>
          {t("project.openCard")}
        </Button>
        <Button icon={<Save size={18} />} variant="primary" onClick={saveCurrentCard}>
          {t("common.save")}
        </Button>
        <Button icon={<FileJson size={18} />} onClick={exportJson}>
          {t("project.exportJson")}
        </Button>
        <Button icon={<ImageDown size={18} />} onClick={exportPng}>
          {t("project.exportPng")}
        </Button>
        <Button icon={<FileArchive size={18} />} onClick={exportCharxFile}>
          {t("project.exportCharx")}
        </Button>
        <Button icon={<Download size={18} />} onClick={showDraftStatus}>
          {t("project.draftStatus")}
        </Button>
      </div>
      <div className="status-line" role="status" aria-live="polite">{status}</div>
      <div className="recent-list">
        <h3>{t("project.recent")}</h3>
        {recent.length === 0 ? <p className="muted">{t("project.noRecentFiles")}</p> : null}
        {recent.map((item) => (
          <button className="recent-item" data-context-menu="recent" data-path={item.path} key={item.path} type="button" onClick={() => openCard(item.path)}>
            <strong>{item.name}</strong>
            <span>{item.path}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
