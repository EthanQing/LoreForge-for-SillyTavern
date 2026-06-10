import type { CharacterCardV3 } from "../lib/schema";

export function keepEditorAssetsAfterMetadataExport(exportedCard: CharacterCardV3, editorCard: CharacterCardV3): CharacterCardV3 {
  if (!editorCard.data.assets) {
    return exportedCard;
  }

  return {
    ...exportedCard,
    data: {
      ...exportedCard.data,
      assets: editorCard.data.assets
    }
  };
}
