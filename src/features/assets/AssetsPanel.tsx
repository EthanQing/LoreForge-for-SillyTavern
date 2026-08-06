import { Copy, ImagePlus, Info, Link2, Package, Plus, Star, Trash2 } from "lucide-react";
import { ChangeEvent, memo, useMemo, useRef, useState } from "react";
import { useCardStore } from "../../app/store";
import { useProjectActions } from "../../app/useProjectActions";
import { Button } from "../../components/Button";
import { SelectField, TextField } from "../../components/Field";
import { useI18n, type TranslationKey } from "../../lib/i18n";
import { dataImageToPngDataUrl, extensionFromName, fileUriToPath, isDataImageUri, readFileAsDataUrl, readFileAsPngDataUrl } from "../../lib/imageAssets";
import type { CardAsset } from "../../lib/schema";

const emptyAssets: CardAsset[] = [];
const INLINE_URI_LIMIT = 180;

const assetTypeLabelKeys: Record<string, TranslationKey> = {
  icon: "assetType.icon",
  background: "assetType.background",
  user_icon: "assetType.userIcon",
  emotion: "assetType.emotion",
  other: "assetType.other",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAssetForUi(asset: unknown, index: number): CardAsset {
  const raw = isRecord(asset) ? asset : {};
  const ext = typeof raw.ext === "string" ? raw.ext.toLowerCase().replace(/^\./, "") : "";
  return {
    ...raw,
    type: typeof raw.type === "string" && raw.type ? raw.type : "other",
    uri: typeof raw.uri === "string" ? raw.uri : "",
    name: typeof raw.name === "string" && raw.name ? raw.name : `asset-${index + 1}`,
    ext: ext || "unknown",
  } as CardAsset;
}

function createDefaultReferenceAsset(assets: CardAsset[]): CardAsset {
  return {
    type: "other",
    uri: "",
    name: `asset-${assets.length + 1}`,
    ext: "unknown",
  };
}

function isLargeInlineUri(uri: string): boolean {
  return uri.startsWith("data:") || uri.length > INLINE_URI_LIMIT;
}

function isMainCover(asset: CardAsset): boolean {
  return asset.type === "icon" && asset.name === "main";
}

function canUseAsPngCover(asset: CardAsset): boolean {
  return isDataImageUri(asset.uri) || Boolean(fileUriToPath(asset.uri));
}

function summarizeUri(uri: string): string {
  if (uri.length <= 96) {
    return uri || "empty";
  }
  return `${uri.slice(0, 42)}...${uri.slice(-28)}`;
}

function formatUriSize(uri: string): string {
  if (!uri) {
    return "0 KB";
  }
  const kilobytes = Math.max(1, Math.round(uri.length / 1024));
  return `${kilobytes} KB`;
}

interface AssetUriFieldProps {
  label: string;
  editLabel: string;
  hideLabel: string;
  summaryLabel: string;
  uri: string;
  onChange: (value: string) => void;
  validationPath?: string;
}

const AssetUriField = memo(function AssetUriField({ editLabel, hideLabel, label, onChange, summaryLabel, uri, validationPath }: AssetUriFieldProps) {
  const [editingLargeUri, setEditingLargeUri] = useState(false);
  const largeInlineUri = isLargeInlineUri(uri);

  if (!largeInlineUri || editingLargeUri) {
    return (
      <div className="asset-uri-editor">
        <TextField validationPath={validationPath} label={label} value={uri} onChange={(event) => onChange(event.target.value)} />
        {largeInlineUri ? <Button onClick={() => setEditingLargeUri(false)}>{hideLabel}</Button> : null}
      </div>
    );
  }

  return (
    <div className="field asset-uri-summary-field" data-validation-path={validationPath}>
      <span className="field-label">
        {label}
        <small>{summaryLabel}</small>
      </span>
      <div className="asset-uri-summary">
        <span>{formatUriSize(uri)}</span>
        <code title={uri}>{summarizeUri(uri)}</code>
        <Button onClick={() => setEditingLargeUri(true)}>{editLabel}</Button>
      </div>
    </div>
  );
});

export function AssetsPanel() {
  const { t } = useI18n();
  const storedAssets = useCardStore((state) => state.card.data.assets);
  const updateData = useCardStore((state) => state.updateData);
  const addAssets = useCardStore((state) => state.addAssets);
  const updateAsset = useCardStore((state) => state.updateAsset);
  const removeAsset = useCardStore((state) => state.removeAsset);
  const { copyAsset } = useProjectActions();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const assets = useMemo(() => (Array.isArray(storedAssets) ? storedAssets.map(normalizeAssetForUi) : emptyAssets), [storedAssets]);
  const coverAsset = assets.find(isMainCover);
  const coverStatusLabel = coverAsset
    ? canUseAsPngCover(coverAsset)
      ? t("assets.coverReady")
      : t("assets.coverReference")
    : t("assets.coverMissing");
  const coverHint = coverAsset && !canUseAsPngCover(coverAsset) ? t("assets.coverReferenceHint") : t("assets.coverHint");
  const embeddedImageCount = assets.filter((asset) => isDataImageUri(asset.uri)).length;
  const referenceCount = assets.filter((asset) => !isDataImageUri(asset.uri)).length;

  const addReferenceAsset = () => {
    addAssets([createDefaultReferenceAsset(assets)]);
  };

  const setCoverAsset = (asset: CardAsset, sourceIndex?: number) => {
    const latestStoredAssets = useCardStore.getState().card.data.assets;
    const latestAssets = Array.isArray(latestStoredAssets) ? latestStoredAssets.map(normalizeAssetForUi) : emptyAssets;
    updateData("assets", [
      asset,
      ...latestAssets.filter((item, itemIndex) => itemIndex !== sourceIndex && !(item.type === "icon" && item.name === "main")),
    ]);
  };

  const uploadCover = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setCoverAsset({
      type: "icon",
      uri: await readFileAsPngDataUrl(file),
      name: "main",
      ext: "png",
    });
    event.target.value = "";
  };

  const addImageAsset = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }
    const uploadedAssets: CardAsset[] = await Promise.all(
      files.map(async (file, index): Promise<CardAsset> => ({
        type: "other",
        uri: await readFileAsDataUrl(file),
        name: file.name.replace(/\.[^.]+$/, "") || `image-${index + 1}`,
        ext: extensionFromName(file.name),
      }))
    );
    addAssets(uploadedAssets);
    event.target.value = "";
  };

  const promoteAssetToCover = async (asset: CardAsset, index: number) => {
    setCoverAsset(
      {
        ...asset,
        type: "icon",
        name: "main",
        ext: isDataImageUri(asset.uri) ? "png" : asset.ext.toLowerCase().replace(/^\./, "") || "png",
        uri: isDataImageUri(asset.uri) ? await dataImageToPngDataUrl(asset.uri) : asset.uri,
      },
      index
    );
  };

  return (
    <section className="panel assets-panel" data-context-menu="project">
      <div className="panel-heading assets-panel-heading">
        <div className="assets-heading-copy">
          <span className="assets-kicker">{t("assets.kicker")}</span>
          <h2>{t("assets.title")}</h2>
          <p>{t("assets.subtitle")}</p>
        </div>
        <div className="inline-row compact">
          <input ref={coverInputRef} className="hidden-file" type="file" accept="image/*" onChange={uploadCover} />
          <input ref={inputRef} className="hidden-file" type="file" accept="image/*" multiple onChange={addImageAsset} />
          <Button icon={<Star size={16} />} variant="primary" onClick={() => coverInputRef.current?.click()}>
            {t("assets.cover")}
          </Button>
          <Button icon={<ImagePlus size={16} />} onClick={() => inputRef.current?.click()}>
            {t("assets.image")}
          </Button>
          <Button icon={<Plus size={16} />} variant="primary" onClick={addReferenceAsset}>
            {t("assets.asset")}
          </Button>
        </div>
      </div>

      <div className="asset-overview">
        <article className={`asset-cover-card ${coverAsset ? "has-cover" : "is-empty"}`}>
          <div className="asset-cover-preview">
            {coverAsset && isDataImageUri(coverAsset.uri) ? (
              <img alt={coverAsset.name} decoding="async" src={coverAsset.uri} />
            ) : (
              <div className="asset-cover-placeholder">
                <Star size={28} aria-hidden="true" />
                <span>{coverStatusLabel}</span>
              </div>
            )}
          </div>
          <div className="asset-cover-copy">
            <span className="assets-kicker">{t("assets.coverSection")}</span>
            <strong>{coverAsset ? coverAsset.name : t("assets.coverMissing")}</strong>
            <p>{coverHint}</p>
            <Button icon={<Star size={16} />} variant="primary" onClick={() => coverInputRef.current?.click()}>
              {coverAsset ? t("assets.replaceCover") : t("assets.cover")}
            </Button>
          </div>
        </article>

        <div className="asset-overview-side">
          <article className="asset-purpose-card">
            <div className="asset-purpose-heading">
              <Info size={16} aria-hidden="true" />
              <strong>{t("assets.whyTitle")}</strong>
            </div>
            <ul className="asset-purpose-list">
              <li>
                <Star size={15} aria-hidden="true" />
                <span>
                  <strong>{t("assets.usageCoverLabel")}</strong>
                  {t("assets.usageCover")}
                </span>
              </li>
              <li>
                <ImagePlus size={15} aria-hidden="true" />
                <span>
                  <strong>{t("assets.usageImagesLabel")}</strong>
                  {t("assets.usageImages")}
                </span>
              </li>
              <li>
                <Link2 size={15} aria-hidden="true" />
                <span>
                  <strong>{t("assets.usageReferencesLabel")}</strong>
                  {t("assets.usageReferences")}
                </span>
              </li>
            </ul>
          </article>
          <div className="asset-stat-grid" aria-label={t("assets.statsLabel")}>
            <div>
              <strong>{assets.length}</strong>
              <span>{t("assets.total")}</span>
            </div>
            <div>
              <strong>{embeddedImageCount}</strong>
              <span>{t("assets.embedded")}</span>
            </div>
            <div>
              <strong>{referenceCount}</strong>
              <span>{t("assets.reference")}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="asset-library-heading">
        <div>
          <h3>{t("assets.libraryTitle")}</h3>
          <span>{assets.length ? t("assets.libraryCount", { count: assets.length }) : t("assets.libraryEmptyHint")}</span>
        </div>
      </div>

      {assets.length === 0 ? (
        <div className="asset-empty-state">
          <Package size={28} aria-hidden="true" />
          <div>
            <p>{t("assets.emptyTitle")}</p>
            <span>{t("assets.emptyBody")}</span>
          </div>
        </div>
      ) : (
        <div className="asset-grid" data-validation-path="data.assets">
          {assets.map((asset, index) => (
            <article
              className={`asset-card ${isMainCover(asset) ? "is-cover" : ""}`}
              data-context-menu="asset"
              data-index={index}
              data-validation-path={`data.assets.${index}`}
              key={`${asset.type}-${asset.name}-${index}`}
            >
              <div className="asset-preview">
                {isDataImageUri(asset.uri) ? (
                  <img alt={asset.name} decoding="async" loading="lazy" src={asset.uri} />
                ) : (
                  <span>{t(assetTypeLabelKeys[asset.type] ?? "assetType.other")}</span>
                )}
              </div>
              <div className="asset-card-content">
                <div className="asset-card-heading">
                  <div className="asset-card-title">
                    <strong title={asset.name}>{asset.name}</strong>
                    <span className="asset-type-badge">{t(assetTypeLabelKeys[asset.type] ?? "assetType.other")}</span>
                  </div>
                  {isMainCover(asset) ? <span className="asset-cover-badge">{coverStatusLabel}</span> : null}
                </div>
                <div className="asset-card-meta">
                  <span>{asset.ext}</span>
                  <span>{isDataImageUri(asset.uri) ? t("assets.embedded") : t("assets.reference")}</span>
                </div>
                <details className="asset-details">
                  <summary>{t("assets.editDetails")}</summary>
                  <div className="asset-fields">
                    <SelectField
                      validationPath={`data.assets.${index}.type`}
                      label={t("assets.type")}
                      value={asset.type}
                      onChange={(event) => updateAsset(index, (item) => ({ ...item, type: event.target.value }))}
                    >
                      <option value="icon">{t("assetType.icon")}</option>
                      <option value="background">{t("assetType.background")}</option>
                      <option value="user_icon">{t("assetType.userIcon")}</option>
                      <option value="emotion">{t("assetType.emotion")}</option>
                      <option value="other">{t("assetType.other")}</option>
                    </SelectField>
                    <TextField
                      validationPath={`data.assets.${index}.name`}
                      label={t("field.name")}
                      value={asset.name}
                      onChange={(event) => updateAsset(index, (item) => ({ ...item, name: event.target.value }))}
                    />
                    <TextField
                      validationPath={`data.assets.${index}.ext`}
                      label={t("assets.ext")}
                      value={asset.ext}
                      onChange={(event) =>
                        updateAsset(index, (item) => ({ ...item, ext: event.target.value.toLowerCase().replace(/^\./, "") }))
                      }
                    />
                    <AssetUriField
                      editLabel={t("assets.editUri")}
                      hideLabel={t("assets.hideUri")}
                      label={t("assets.uri")}
                      summaryLabel={t("assets.uriFolded")}
                      uri={asset.uri}
                      validationPath={`data.assets.${index}.uri`}
                      onChange={(value) => updateAsset(index, (item) => ({ ...item, uri: value }))}
                    />
                    <div className="asset-card-actions">
                      <Button icon={<Copy size={16} />} onClick={() => void copyAsset(index)}>
                        {t("assets.copyDefinition")}
                      </Button>
                      <Button
                        disabled={isMainCover(asset)}
                        icon={<Star size={16} />}
                        onClick={() => void promoteAssetToCover(asset, index)}
                      >
                        {t("assets.setCover")}
                      </Button>
                      <Button icon={<Trash2 size={16} />} variant="danger" onClick={() => removeAsset(index)}>
                        {t("common.delete")}
                      </Button>
                    </div>
                  </div>
                </details>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
