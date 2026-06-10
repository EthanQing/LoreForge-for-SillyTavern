import { confirm as confirmDialog } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";
import { useCardStore } from "./store";
import { keepEditorAssetsAfterMetadataExport } from "./exportState";
import { dataImageToPngDataUrl, fileUriToPath, findMainIconAsset, isDataImageUri } from "../lib/imageAssets";
import { useI18n } from "../lib/i18n";
import type { CardAsset, CharacterCardV3 } from "../lib/schema";
import { prepareCardForExport } from "../lib/migrations";
import {
  exportCardPng,
  exportCharx,
  openCardFile,
  pathExists,
  pickCardSavePath,
  pickCharxSavePath,
  pickJsonSavePath,
  pickOpenCardPath,
  pickPngOpenPath,
  pickPngSavePath,
  type PngExportBase,
  saveCardJson,
} from "../lib/tauri";

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function isJsonPath(path: string | null): path is string {
  return Boolean(path && path.toLowerCase().endsWith(".json"));
}

function isPngPath(path: string | null): path is string {
  if (!path) {
    return false;
  }
  const normalized = path.toLowerCase();
  return normalized.endsWith(".png") || normalized.endsWith(".apng");
}

function isCharxPath(path: string | null): path is string {
  return Boolean(path && path.toLowerCase().endsWith(".charx"));
}

function defaultToPngPath(path: string): string {
  return isPngPath(path) ? path : `${path}.png`;
}

function isMissingFileError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes("os error 2") ||
    normalized.includes("no such file or directory") ||
    normalized.includes("cannot find the file") ||
    normalized.includes("cannot find the path") ||
    normalized.includes("找不到指定的文件")
  );
}

interface SaveCurrentCardOptions {
  promptIfUnbound?: boolean;
  savedStatus?: string;
  unboundStatus?: string;
}

export function useProjectActions() {
  const { t } = useI18n();
  const card = useCardStore((state) => state.card);
  const dirty = useCardStore((state) => state.dirty);
  const currentPath = useCardStore((state) => state.currentPath);
  const recent = useCardStore((state) => state.recent);
  const newCard = useCardStore((state) => state.newCard);
  const replaceCard = useCardStore((state) => state.replaceCard);
  const markSaved = useCardStore((state) => state.markSaved);
  const setStatus = useCardStore((state) => state.setStatus);
  const setActiveTab = useCardStore((state) => state.setActiveTab);
  const refreshValidation = useCardStore((state) => state.refreshValidation);
  const removeAsset = useCardStore((state) => state.removeAsset);
  const removeRecent = useCardStore((state) => state.removeRecent);

  const removeMissingRecent = useCallback(
    (path: string) => {
      removeRecent(path);
      setStatus(t("status.recentMissingRemoved", { path }));
    },
    [removeRecent, setStatus, t]
  );

  const confirmDanger = useCallback(
    async (message: string, title = t("confirm.dangerTitle")) => {
      try {
        return await confirmDialog(message, {
          title,
          kind: "warning",
          okLabel: t("confirm.ok"),
          cancelLabel: t("confirm.cancel"),
        });
      } catch {
        return window.confirm(message);
      }
    },
    [t]
  );

  const confirmDiscardIfDirty = useCallback(async () => {
    if (!dirty) {
      return true;
    }
    return await confirmDanger(t("confirm.discardUnsavedBody"), t("confirm.discardUnsavedTitle"));
  }, [confirmDanger, dirty, t]);

  const openCard = useCallback(
    async (forcedPath?: string) => {
      try {
        const path = forcedPath ?? (await pickOpenCardPath());
        if (!path) {
          return;
        }

        if (forcedPath && !(await pathExists(path))) {
          removeMissingRecent(path);
          return;
        }

        if (!(await confirmDiscardIfDirty())) {
          return;
        }

        const parsed = await openCardFile(path);
        replaceCard(parsed.card, {
          dirty: false,
          path,
          status: parsed.warnings.length > 0 ? parsed.warnings.join(" ") : t("status.cardOpened"),
        });
      } catch (error) {
        if (forcedPath && isMissingFileError(error)) {
          removeMissingRecent(forcedPath);
          return;
        }
        setStatus(error instanceof Error ? error.message : String(error));
      }
    },
    [confirmDiscardIfDirty, removeMissingRecent, replaceCard, setStatus, t]
  );

  const createNewCard = useCallback(async () => {
    try {
      if (!(await confirmDiscardIfDirty())) {
        return;
      }
      newCard();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, [confirmDiscardIfDirty, newCard, setStatus]);

  const exportJson = useCallback(async () => {
    try {
      const path = await pickJsonSavePath();
      if (!path) {
        return;
      }
      const parsed = await saveCardJson(path, card);
      markSaved(keepEditorAssetsAfterMetadataExport(parsed.card, card), path);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, [card, markSaved, setStatus]);

  const savePngToPath = useCallback(
    async (path: string, fallbackBasePngPath?: string | null, cardToSave: CharacterCardV3 = card) => {
      const cover = findMainIconAsset(cardToSave);
      const coverUri = typeof cover?.uri === "string" ? cover.uri : "";
      const coverBase =
        coverUri && isDataImageUri(coverUri)
          ? { basePngDataUrl: await dataImageToPngDataUrl(coverUri) }
          : coverUri
            ? { basePngPath: fileUriToPath(coverUri) }
            : {};
      const base: PngExportBase =
        coverBase.basePngDataUrl || coverBase.basePngPath ? coverBase : fallbackBasePngPath ? { basePngPath: fallbackBasePngPath } : {};
      const pickedBasePath = base.basePngDataUrl || base.basePngPath ? null : await pickPngOpenPath();
      if (!base.basePngDataUrl && !base.basePngPath && !pickedBasePath) {
        return;
      }
      const parsed = await exportCardPng(path, cardToSave, { compatibility_v2: true }, pickedBasePath ? { basePngPath: pickedBasePath } : base);
      markSaved(keepEditorAssetsAfterMetadataExport(parsed.card, cardToSave), path);
    },
    [card, markSaved]
  );

  const saveToPath = useCallback(
    async (path: string, overwriteBasePath?: string | null, cardToSave: CharacterCardV3 = card) => {
      if (isJsonPath(path)) {
        const parsed = await saveCardJson(path, cardToSave);
        markSaved(keepEditorAssetsAfterMetadataExport(parsed.card, cardToSave), path);
        return;
      }

      if (isPngPath(path)) {
        await savePngToPath(path, overwriteBasePath, cardToSave);
        return;
      }

      if (isCharxPath(path)) {
        const parsed = await exportCharx(path, cardToSave, []);
        markSaved(keepEditorAssetsAfterMetadataExport(parsed.card, cardToSave), path);
        return;
      }

      await savePngToPath(defaultToPngPath(path), null, cardToSave);
    },
    [card, markSaved, savePngToPath]
  );

  const saveCardSnapshot = useCallback(async (cardToSave: CharacterCardV3, options: SaveCurrentCardOptions = {}) => {
    try {
      if (isJsonPath(currentPath) || isCharxPath(currentPath)) {
        await saveToPath(currentPath, undefined, cardToSave);
        if (options.savedStatus) {
          setStatus(options.savedStatus);
        }
        return;
      }

      if (isPngPath(currentPath)) {
        await saveToPath(currentPath, currentPath, cardToSave);
        if (options.savedStatus) {
          setStatus(options.savedStatus);
        }
        return;
      }

      if (options.promptIfUnbound === false) {
        setStatus(options.unboundStatus ?? t("status.draftAutosaved"));
        return;
      }

      const path = await pickCardSavePath();
      if (!path) {
        return;
      }
      await saveToPath(path, undefined, cardToSave);
      if (options.savedStatus) {
        setStatus(options.savedStatus);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, [card, currentPath, saveToPath, setStatus, t]);

  const saveCurrentCard = useCallback(async () => {
    await saveCardSnapshot(card);
  }, [card, saveCardSnapshot]);

  const exportPng = useCallback(async () => {
    try {
      const path = await pickPngSavePath();
      if (!path) {
        return;
      }
      await savePngToPath(path);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, [savePngToPath, setStatus]);

  const exportCharxFile = useCallback(async () => {
    try {
      const path = await pickCharxSavePath();
      if (!path) {
        return;
      }
      const parsed = await exportCharx(path, card, []);
      markSaved(keepEditorAssetsAfterMetadataExport(parsed.card, card), path);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, [card, markSaved, setStatus]);

  const showDraftStatus = useCallback(() => {
    setStatus(t("status.draftAutosaved"));
  }, [setStatus, t]);

  const openSettings = useCallback(() => {
    setActiveTab("settings");
  }, [setActiveTab]);

  const copyCurrentCardJson = useCallback(
    async (status = t("status.copiedToClipboard")) => {
      try {
        await copyText(JSON.stringify(prepareCardForExport(card), null, 2));
        setStatus(status);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    },
    [card, setStatus, t]
  );

  const copyArbitraryText = useCallback(
    async (text: string, status = t("status.copiedToClipboard")) => {
      try {
        await copyText(text);
        setStatus(status);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    },
    [setStatus, t]
  );

  const formatCurrentCardJson = useCallback(async () => {
    await copyCurrentCardJson(t("status.formattedJsonCopied"));
  }, [copyCurrentCardJson, t]);

  const validateCurrentCard = useCallback(() => {
    refreshValidation();
    setStatus(t("status.validationRefreshed"));
  }, [refreshValidation, setStatus, t]);

  const deleteCurrentCard = useCallback(async () => {
    if (!(await confirmDanger(t("confirm.deleteCurrentCardBody")))) {
      return;
    }
    newCard();
    setStatus(t("status.cardDeleted"));
  }, [confirmDanger, newCard, setStatus, t]);

  const removeRecentPath = useCallback(
    async (path: string) => {
      if (!(await confirmDanger(t("confirm.removeRecentBody")))) {
        return;
      }
      removeRecent(path);
    },
    [confirmDanger, removeRecent, t]
  );

  const copyRecentPath = useCallback(
    async (path: string) => {
      await copyArbitraryText(path);
    },
    [copyArbitraryText]
  );

  const getAsset = useCallback(
    (index: number): CardAsset | undefined => {
      return card.data.assets?.[index];
    },
    [card.data.assets]
  );

  const copyAsset = useCallback(
    async (index: number) => {
      const asset = getAsset(index);
      if (!asset) {
        setStatus(t("status.contextMenuUnavailable"));
        return;
      }
      await copyArbitraryText(JSON.stringify(asset, null, 2));
    },
    [copyArbitraryText, getAsset, setStatus, t]
  );

  const openAsset = useCallback(
    (index: number) => {
      const asset = getAsset(index);
      if (!asset?.uri) {
        setStatus(t("status.contextMenuUnavailable"));
        return;
      }
      window.open(asset.uri, "_blank", "noopener,noreferrer");
      setStatus(t("status.assetOpened"));
    },
    [getAsset, setStatus, t]
  );

  const deleteAsset = useCallback(
    async (index: number) => {
      if (!getAsset(index)) {
        setStatus(t("status.contextMenuUnavailable"));
        return;
      }
      if (!(await confirmDanger(t("confirm.deleteAssetBody")))) {
        return;
      }
      removeAsset(index);
      setStatus(t("status.assetRemoved"));
    },
    [confirmDanger, getAsset, removeAsset, setStatus, t]
  );

  return {
    card,
    dirty,
    recent,
    createNewCard,
    openCard,
    saveCurrentCard,
    saveCardSnapshot,
    exportJson,
    exportPng,
    exportCharxFile,
    showDraftStatus,
    openSettings,
    copyCurrentCardJson,
    copyArbitraryText,
    formatCurrentCardJson,
    validateCurrentCard,
    deleteCurrentCard,
    copyRecentPath,
    removeRecentPath,
    copyAsset,
    openAsset,
    deleteAsset,
  };
}
