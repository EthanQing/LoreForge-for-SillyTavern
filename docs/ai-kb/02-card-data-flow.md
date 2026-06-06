# Card Data Flow

## Core Schema

Frontend CCv3 types and Zod schemas live in `src/lib/schema.ts`.

Core type:

- `CharacterCardV3`
- `CharacterCardData`
- `Lorebook`
- `LorebookEntry`
- `CardAsset`
- `ParsedCard`
- `ValidationReport`

The Zod schemas use `.passthrough()` so unknown fields can survive parsing. Preserve this behavior unless the task explicitly requires strict rejection.

## Blank Card Creation

`createBlankCard()` creates a valid CCv3 shell:

- `spec: "chara_card_v3"`
- `spec_version: "3.0"`
- required string fields initialized to `""`
- required arrays initialized to `[]`
- `extensions: {}`
- Unix `creation_date` and `modification_date`

Lorebook helpers:

- `createBlankLorebook()`
- `createBlankLorebookEntry(order)` creates a non-empty `comment` default such as `Entry 1`; new entries do not write the legacy entry `name` field.

SillyTavern lorebook compatibility helper:

- `src/lib/lorebookCompat.ts`
- SillyTavern displays embedded world book Entry Title/Memo from `entries[*].comment`, not `entries[*].name`.
- `normalizeLorebookForSillyTavern()` fills blank comments from `comment`, then legacy `name`, then the first primary key, then `Entry N`.
- Export normalization removes `entries[*].name` after using it as a legacy fallback so generated card data matches SillyTavern's visible field model.
- SillyTavern-specific entry settings are stored under `entries[*].extensions.*`; preserve these unknown extension fields.

## Store Update Flow

Use `src/app/store.ts` methods instead of mutating card state directly.

- `updateCard`: touches `modification_date`, validates, saves draft, marks dirty.
- `updateData`: updates `card.data[key]` through `updateCard`.
- `replaceCard`: normalizes imported/stored cards, validates, saves draft.
- `markSaved`: stores exported/saved card, validates, clears dirty, updates recent list.
- `applyAgentCard`: applies AI-generated card state and marks dirty.

## Import/Export Flow

Frontend command wrappers are in `src/lib/tauri.ts`.

Backend orchestration is in `src-tauri/src/commands.rs`.

Supported open formats:

- JSON
- PNG/APNG
- CHARX

JSON:

- `open_card_file` routes `.json` to migration.
- `save_card_json` prepares export card, validates, writes pretty JSON.
- Export preparation normalizes embedded lorebooks for SillyTavern so blank entry memos are filled and key settings such as `position`, `depth`, `probability`, and `case_sensitive` are available under `entry.extensions`.

PNG/APNG:

- Import reads card metadata chunks. If no card metadata exists, it creates a blank card and imports the image as an `icon` asset.
- Export requires a base PNG from either a path or a base64 data URL.
- Export writes CCv3 metadata and can also write legacy compatibility metadata when enabled.

CHARX:

- Export writes root `card.json`.
- Backend supports asset file entries.
- Current README notes that the UI does not yet automatically map selected assets into `embeded://` paths.

## Validation

Frontend validation helper: `src/lib/validation.ts`.

Backend validation helper: `src-tauri/src/validation.rs`.

Backend export uses `ensure_valid_for_export` before writing files. If adding new required fields or validation rules, check both sides for consistency.

## Migration

Frontend migration/export preparation helper: `src/lib/migrations.ts`.

Backend migration helper: `src-tauri/src/migration.rs`.

Migrations should preserve unknown fields where the schema allows it. When docs and code differ, inspect both frontend and Rust migration logic before changing behavior.

Both frontend `prepareCardForExport()` and backend `touch_for_export()` run lorebook compatibility normalization. Keep those paths aligned when changing embedded world book export behavior.
