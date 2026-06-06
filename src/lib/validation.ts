import { CharacterCardV3, ValidationIssue, ValidationReport } from "./schema";
import { translate } from "./i18n";

function issue(level: "error" | "warning", code: string, path: string, message: string): ValidationIssue {
  return { level, code, path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeUrlOrId(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^[a-zA-Z0-9._:/#-]+$/.test(value);
}

function addRegexWarnings(card: CharacterCardV3, warnings: ValidationIssue[]): void {
  const entries = card.data.character_book?.entries ?? [];
  entries.forEach((entry, index) => {
    if (!entry.use_regex) {
      return;
    }
    [...entry.keys, ...(entry.secondary_keys ?? [])].forEach((pattern, keyIndex) => {
      try {
        new RegExp(pattern);
      } catch {
        warnings.push(
          issue("warning", "invalid_regex", `data.character_book.entries.${index}.keys.${keyIndex}`, translate("validation.invalidRegex")),
        );
      }
    });
  });
}

export function validateCard(card: CharacterCardV3): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (card.spec !== "chara_card_v3") {
    errors.push(issue("error", "invalid_spec", "spec", translate("validation.invalidSpec")));
  }
  if (!card.spec_version) {
    errors.push(issue("error", "missing_spec_version", "spec_version", translate("validation.missingSpecVersion")));
  } else if (Number.parseFloat(card.spec_version) > 3) {
    warnings.push(
      issue("warning", "newer_spec_version", "spec_version", translate("validation.newerSpecVersion")),
    );
  }
  if (!isRecord(card.data)) {
    errors.push(issue("error", "missing_data", "data", translate("validation.missingData")));
    return { valid: false, errors, warnings };
  }

  const requiredStrings = [
    "name",
    "description",
    "creator",
    "character_version",
    "mes_example",
    "system_prompt",
    "post_history_instructions",
    "first_mes",
    "personality",
    "scenario",
    "creator_notes",
  ] as const;

  for (const field of requiredStrings) {
    if (typeof card.data[field] !== "string") {
      errors.push(issue("error", "missing_string", `data.${field}`, translate("validation.missingString", { field })));
    }
  }

  if (!Array.isArray(card.data.group_only_greetings)) {
    errors.push(
      issue("error", "invalid_group_only_greetings", "data.group_only_greetings", translate("validation.invalidGroupGreetings")),
    );
  }

  const lorebook = card.data.character_book;
  if (lorebook !== undefined) {
    if (!Array.isArray(lorebook.entries)) {
      errors.push(issue("error", "invalid_lorebook_entries", "data.character_book.entries", translate("validation.invalidLorebookEntries")));
    } else {
      lorebook.entries.forEach((entry, index) => {
        if (!Array.isArray(entry.keys) || entry.keys.some((key) => typeof key !== "string")) {
          errors.push(
            issue("error", "invalid_lorebook_keys", `data.character_book.entries.${index}.keys`, translate("validation.invalidLorebookKeys")),
          );
        }
        if (typeof entry.use_regex !== "boolean") {
          errors.push(
            issue(
              "error",
              "missing_use_regex",
              `data.character_book.entries.${index}.use_regex`,
              translate("validation.missingUseRegex"),
            ),
          );
        }
      });
    }
  }

  const assets = card.data.assets ?? [];
  const icons = assets.filter((asset) => asset.type === "icon");
  const mainIcons = icons.filter((asset) => asset.name === "main");
  if (icons.length > 0 && mainIcons.length !== 1) {
    errors.push(issue("error", "invalid_main_icon", "data.assets", translate("validation.invalidMainIcon")));
  }
  const mainBackgrounds = assets.filter((asset) => asset.type === "background" && asset.name === "main");
  if (mainBackgrounds.length > 1) {
    errors.push(
      issue("error", "invalid_main_background", "data.assets", translate("validation.invalidMainBackground")),
    );
  }

  assets.forEach((asset, index) => {
    if (/^http:\/\//i.test(asset.uri)) {
      warnings.push(issue("warning", "http_asset", `data.assets.${index}.uri`, translate("validation.httpAsset")));
    }
    if (asset.ext !== asset.ext.toLowerCase() || asset.ext.startsWith(".")) {
      warnings.push(issue("warning", "asset_ext", `data.assets.${index}.ext`, translate("validation.assetExt")));
    }
  });

  if (card.data.source) {
    card.data.source.forEach((source, index) => {
      if (!looksLikeUrlOrId(source)) {
        warnings.push(issue("warning", "source_format", `data.source.${index}`, translate("validation.sourceFormat")));
      }
    });
  }

  if (!card.data.name.trim()) {
    warnings.push(issue("warning", "empty_name", "data.name", translate("validation.emptyName")));
  }
  if (!card.data.first_mes.trim()) {
    warnings.push(issue("warning", "empty_first_mes", "data.first_mes", translate("validation.emptyFirstMessage")));
  }

  for (const [key, value] of Object.entries(card.data.extensions)) {
    if (JSON.stringify(value).length > 20_000) {
      warnings.push(
        issue("warning", "large_extension", `data.extensions.${key}`, translate("validation.largeExtension")),
      );
    }
  }

  for (const [field, value] of Object.entries(card.data)) {
    if (typeof value === "string" && value.length > 40_000) {
      warnings.push(issue("warning", "long_field", `data.${field}`, translate("validation.longField")));
    }
  }

  addRegexWarnings(card, warnings);
  return { valid: errors.length === 0, errors, warnings };
}
