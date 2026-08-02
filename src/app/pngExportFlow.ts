import { dataImageToPngDataUrl, fileUriToPath, findMainIconAsset, isDataImageUri } from "../lib/imageAssets";
import type { CharacterCardV3 } from "../lib/schema";
import { pickPngOpenPath, pickPngSavePath, type PngExportBase } from "../lib/tauri";

interface PngExportFlowDependencies {
  pickBasePath?: () => Promise<string | null>;
  pickSavePath?: () => Promise<string | null>;
  convertDataImage?: (uri: string) => Promise<string>;
}

export interface PngExportRequest {
  path: string;
  base: PngExportBase;
}

export async function resolvePngExportBase(
  card: CharacterCardV3,
  fallbackBasePath?: string | null,
  dependencies: PngExportFlowDependencies = {}
): Promise<PngExportBase | null> {
  const cover = findMainIconAsset(card);
  const coverUri = typeof cover?.uri === "string" ? cover.uri : "";

  if (coverUri && isDataImageUri(coverUri)) {
    const convertDataImage = dependencies.convertDataImage ?? dataImageToPngDataUrl;
    return { basePngDataUrl: await convertDataImage(coverUri) };
  }

  const coverPath = coverUri ? fileUriToPath(coverUri) : null;
  if (coverPath) {
    return { basePngPath: coverPath };
  }

  if (fallbackBasePath) {
    return { basePngPath: fallbackBasePath };
  }

  const pickBasePath = dependencies.pickBasePath ?? pickPngOpenPath;
  const pickedBasePath = await pickBasePath();
  return pickedBasePath ? { basePngPath: pickedBasePath } : null;
}

export async function pickPngExportRequest(
  card: CharacterCardV3,
  dependencies: PngExportFlowDependencies = {}
): Promise<PngExportRequest | null> {
  const base = await resolvePngExportBase(card, null, dependencies);
  if (!base) {
    return null;
  }

  const pickSavePath = dependencies.pickSavePath ?? pickPngSavePath;
  const path = await pickSavePath();
  return path ? { path, base } : null;
}
