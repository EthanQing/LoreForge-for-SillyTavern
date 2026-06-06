import { ImagePlus, Package, Plus, Star, Trash2 } from "lucide-react";
import { ChangeEvent, useRef } from "react";
import { useCardStore } from "../../app/store";
import { Button } from "../../components/Button";
import { SelectField, TextField } from "../../components/Field";
import { useI18n, type TranslationKey } from "../../lib/i18n";
import { dataImageToPngDataUrl, extensionFromName, isDataImageUri, readFileAsDataUrl, readFileAsPngDataUrl } from "../../lib/imageAssets";
import type { CardAsset } from "../../lib/schema";

const emptyAssets: CardAsset[] = [];

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

function createDefaultAsset(assets: CardAsset[]): CardAsset {
  return {
    type: "icon",
    uri: "ccdefault:",
    name: assets.some((item) => item.type === "icon") ? "icon" : "main",
    ext: "png",
  };
}

export function AssetsPanel() {
  const { t } = useI18n();
  const storedAssets = useCardStore((state) => state.card.data.assets);
  const updateData = useCardStore((state) => state.updateData);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const assets = Array.isArray(storedAssets) ? storedAssets.map(normalizeAssetForUi) : emptyAssets;

  const addAsset = (asset = createDefaultAsset(assets)) => {
    updateData("assets", [...assets, asset]);
  };

  const setCoverAsset = (asset: CardAsset, sourceIndex?: number) => {
    updateData("assets", [
      asset,
      ...assets.filter((item, itemIndex) => itemIndex !== sourceIndex && !(item.type === "icon" && item.name === "main")),
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
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const type = assets.some((asset) => asset.type === "icon") ? "other" : "icon";
    const name = type === "icon" ? "main" : file.name.replace(/\.[^.]+$/, "") || "asset";
    addAsset({
      type,
      uri: type === "icon" && name === "main" ? await readFileAsPngDataUrl(file) : await readFileAsDataUrl(file),
      name,
      ext: type === "icon" && name === "main" ? "png" : extensionFromName(file.name),
    });
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
    <section className="panel">
      <div className="panel-heading">
        <h2>{t("assets.title")}</h2>
        <div className="inline-row compact">
          <input ref={coverInputRef} className="hidden-file" type="file" accept="image/*" onChange={uploadCover} />
          <input ref={inputRef} className="hidden-file" type="file" accept="image/*" onChange={addImageAsset} />
          <Button icon={<Star size={16} />} variant="primary" onClick={() => coverInputRef.current?.click()}>
            {t("assets.cover")}
          </Button>
          <Button icon={<ImagePlus size={16} />} onClick={() => inputRef.current?.click()}>
            {t("assets.image")}
          </Button>
          <Button icon={<Plus size={16} />} variant="primary" onClick={() => addAsset()}>
            {t("assets.asset")}
          </Button>
        </div>
      </div>
      {assets.length === 0 ? (
        <div className="empty-state">
          <Package size={48} aria-hidden="true" />
          <p>{t("assets.emptyTitle")}</p>
          <span className="muted">{t("assets.emptyBody")}</span>
        </div>
      ) : null}
      <div className="asset-grid">
        {assets.map((asset, index) => (
          <article className="asset-card" key={`${asset.type}-${asset.name}-${index}`}>
            <div className="asset-preview">
              {asset.uri.startsWith("data:image/") ? <img alt={asset.name} src={asset.uri} /> : <span>{t(assetTypeLabelKeys[asset.type] ?? "assetType.other")}</span>}
            </div>
            <div className="asset-fields">
              <SelectField
                label={t("assets.type")}
                value={asset.type}
                onChange={(event) => updateData("assets", assets.map((item, itemIndex) => (itemIndex === index ? { ...item, type: event.target.value } : item)))}
              >
                <option value="icon">{t("assetType.icon")}</option>
                <option value="background">{t("assetType.background")}</option>
                <option value="user_icon">{t("assetType.userIcon")}</option>
                <option value="emotion">{t("assetType.emotion")}</option>
                <option value="other">{t("assetType.other")}</option>
              </SelectField>
              <TextField
                label={t("field.name")}
                value={asset.name}
                onChange={(event) => updateData("assets", assets.map((item, itemIndex) => (itemIndex === index ? { ...item, name: event.target.value } : item)))}
              />
              <TextField
                label={t("assets.ext")}
                value={asset.ext}
                onChange={(event) =>
                  updateData(
                    "assets",
                    assets.map((item, itemIndex) => (itemIndex === index ? { ...item, ext: event.target.value.toLowerCase().replace(/^\./, "") } : item))
                  )
                }
              />
              <TextField
                label={t("assets.uri")}
                value={asset.uri}
                onChange={(event) => updateData("assets", assets.map((item, itemIndex) => (itemIndex === index ? { ...item, uri: event.target.value } : item)))}
              />
              <Button
                disabled={asset.type === "icon" && asset.name === "main"}
                icon={<Star size={16} />}
                onClick={() => void promoteAssetToCover(asset, index)}
              >
                {t("assets.setCover")}
              </Button>
              <Button icon={<Trash2 size={16} />} variant="danger" onClick={() => updateData("assets", assets.filter((_, itemIndex) => itemIndex !== index))}>
                {t("common.delete")}
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
