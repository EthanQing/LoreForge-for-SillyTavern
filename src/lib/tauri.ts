import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { CharacterCardV3, ParsedCard, ValidationReport } from "./schema";

export interface PngExportOptions {
  compatibility_v2: boolean;
}

export interface CharxAssetInput {
  source_path: string;
  target_path: string;
}

export async function pickOpenCardPath(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: "Character cards",
        extensions: ["json", "png", "apng", "charx"]
      }
    ]
  });
  return typeof selected === "string" ? selected : null;
}

export async function pickJsonSavePath(): Promise<string | null> {
  return await save({
    filters: [{ name: "Character Card JSON", extensions: ["json"] }],
    defaultPath: "card.json"
  });
}

export async function pickPngOpenPath(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "PNG image", extensions: ["png", "apng"] }]
  });
  return typeof selected === "string" ? selected : null;
}

export async function pickPngSavePath(): Promise<string | null> {
  return await save({
    filters: [{ name: "PNG card", extensions: ["png"] }],
    defaultPath: "card.png"
  });
}

export async function pickCharxSavePath(): Promise<string | null> {
  return await save({
    filters: [{ name: "CHARX card", extensions: ["charx"] }],
    defaultPath: "card.charx"
  });
}

export async function openCardFile(path: string): Promise<ParsedCard> {
  return await invoke<ParsedCard>("open_card_file", { path });
}

export async function saveCardJson(path: string, card: CharacterCardV3): Promise<ParsedCard> {
  return await invoke<ParsedCard>("save_card_json", { path, card });
}

export async function exportCardPng(
  path: string,
  basePngPath: string,
  card: CharacterCardV3,
  options: PngExportOptions
): Promise<ParsedCard> {
  return await invoke<ParsedCard>("export_card_png", {
    path,
    basePngPath,
    base_png_path: basePngPath,
    card,
    options
  });
}

export async function importCardPng(path: string): Promise<ParsedCard> {
  return await invoke<ParsedCard>("import_card_png", { path });
}

export async function exportCharx(
  path: string,
  card: CharacterCardV3,
  assets: CharxAssetInput[] = []
): Promise<ParsedCard> {
  return await invoke<ParsedCard>("export_charx", { path, card, assets });
}

export async function importCharx(path: string): Promise<ParsedCard> {
  return await invoke<ParsedCard>("import_charx", { path });
}

export async function validateCardCommand(card: CharacterCardV3): Promise<ValidationReport> {
  return await invoke<ValidationReport>("validate_card", { card });
}
