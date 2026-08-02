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
- `applyAgentCard`: applies a fully confirmed Agent proposal, increments revision, validates, saves the draft, and marks dirty.

The store also persists draft identity metadata under `sillytavern-card-creator:draft-meta`: current file path, card origin (`file`, `draft`, or `new`), and dirty state. Keep this metadata in sync when adding open/save/new-card flows so the topbar and Project panel can show the active editing target accurately.

## Greeting UI Semantics

`src/features/card-editor/GreetingsPanel.tsx` edits `data.first_mes`, `data.alternate_greetings`, and `data.group_only_greetings`.

When an alternate greeting is promoted to the first message, treat the operation as a swap: the promoted alternate becomes `first_mes`, and the previous `first_mes` returns to the same slot in `alternate_greetings`. Use `promoteAlternateGreetingToFirst()` from `src/app/store.ts` and apply the change with a single `updateCard()` call so the alternate list does not transiently shrink or invalidate an exact Agent field scope.

## Import/Export Flow

Frontend command wrappers are in `src/lib/tauri.ts`.

Backend orchestration is in `src-tauri/src/commands.rs`.

Global save:

- `useProjectActions().saveCurrentCard()` is the shared Save action for the topbar, Project panel, context menu, and `Ctrl/Cmd+S`.
- `useProjectActions().saveCardSnapshot(card, options)` is the programmatic save path used after a confirmed Agent proposal so the saved file matches the compiled card rather than a stale React render.
- If the active `currentPath` points to an existing JSON, PNG/APNG, or CHARX card, Save writes back to that same path without opening a save dialog.
- JSON Save uses `save_card_json`; PNG/APNG Save uses `export_card_png`; CHARX Save uses `export_charx`.
- For PNG/APNG Save, the current main icon/cover asset is used as the base image when present. If no cover asset exists, the current image path is used as the fallback base before writing back to the same path.
- Backend export returns the stripped metadata card. Frontend save paths must call `keepEditorAssetsAfterMetadataExport()` before `markSaved()` so editor-only inline cover assets stay visible and reusable after saving.
- New cards, local drafts, and unrecognized paths use a save dialog with PNG as the default format while still allowing JSON or CHARX.
- Keep `exportJson()`, `exportPng()`, and `exportCharxFile()` as explicit save-as/export paths that always prompt for a destination.

Supported open formats:

- JSON
- PNG/APNG
- CHARX

Recent-file opens go through `useProjectActions().openCard(path)`. For forced recent paths, the frontend calls the backend `path_exists` command before showing the dirty-discard confirmation. Missing recent paths are removed from the store and reported with `status.recentMissingRemoved` so stale entries do not repeatedly block switching cards.

JSON:

- `open_card_file` routes `.json` to migration.
- `save_card_json` prepares export card, validates, writes pretty JSON.
- Export preparation normalizes embedded lorebooks for SillyTavern so blank entry memos are filled and key settings such as `position`, `depth`, `probability`, and `case_sensitive` are available under `entry.extensions`.
- Export preparation strips inline image `data:image/...` asset URIs from saved card metadata. PNG export still uses the cover asset as the actual base image, but the JSON/PNG metadata should not duplicate large base64 images because SillyTavern imports can reject oversized metadata as invalid or corrupted. This stripping is for the written file only; the editor draft should retain the cover asset.

PNG/APNG:

- Import reads card metadata chunks. If no card metadata exists, it creates a blank card and imports the image as an `icon` asset.
- Export requires a base PNG from either a path or a base64 data URL.
- Export writes CCv3 metadata and can also write legacy compatibility metadata when enabled.
- Export removes `caBX` C2PA/provenance PNG chunks from the cover image because some SillyTavern PNG import paths can reject images containing those private chunks even when card metadata is valid.

CHARX:

- Export writes root `card.json`.
- Backend supports asset file entries.
- Current README notes that the UI does not yet automatically map selected assets into `embeded://` paths.

## Asset UI Performance

`src/features/assets/AssetsPanel.tsx` folds large inline `data:` asset URIs by default and shows a lightweight summary row. Render the full URI input only when the user chooses to edit it; putting long base64 image data directly into controlled inputs can make tab switches feel blocked.

Token statistics follow the same performance rule. `src/lib/tokenStats.ts` counts card text, prompt-preview text, lorebook content/keys/memos, and non-`data:` asset references, but skips inline image `data:` URI payloads so a cover image does not dominate estimates or make the stats page expensive to render.

## Asset UI Semantics

The Assets panel edits the current card's CCv3 `data.assets`; it is not a SillyTavern global media library. Cover upload owns the main portrait asset (`type: "icon"`, `name: "main"`) and converts it to PNG data for card preview/export. Image upload appends one or more ordinary image assets (`type: "other"`) for later manual classification as background, emotion, user icon, or other. The manual add button creates an empty reference asset for advanced `uri` values such as external URLs, `embeded://...`, or `ccdefault:` and should not create an implicit cover. Inline image assets are editor-side/export-base data and are removed from exported metadata for SillyTavern compatibility.

## Lorebook UI Performance

`src/features/lorebook/LorebookPanel.tsx` keeps closed world book entries as lightweight summary rows. Entry editors use `Collapsible` with lazy mount and close-time unmounting so large books do not create many `CodeEditor`, `AiFieldAssistant`, chip inputs, and advanced controls during tab switches. Keep summary rendering bounded; avoid joining huge keyword arrays or normalizing full entry content just to show a one-line preview.

Collapsed summaries use a dedicated grid rather than the generic flex trigger: the title and enabled/order state form the primary row, while bounded keywords and a two-line content preview provide secondary detail. Keep the entry title readable before allocating width to preview text, and preserve the stacked narrow-width layout.

World book entries can be reordered through the drag handle in each entry summary. The UI uses `useCardStore().reorderLorebookEntry(from, to)`, which moves the array item for display order only and does not rewrite any entry's `insertion_order`. The entry summary still supports native drag/drop, but the visible handle also has a pointer-event fallback because Tauri WebView can fail to deliver native `drop` events reliably. Keep the arrow buttons as a non-drag fallback, and do not reset user-defined order ranges such as 100+ back to 0. Duplicate `insertion_order` values are valid SillyTavern data and must remain valid in the editor.

The entry insertion-position UI mirrors SillyTavern's official dropdown. Character, example-message, Author's Note, and outlet placements write `entries[*].extensions.position` directly. The three `@D` depth options are composite UI choices that write `extensions.position = 4` plus `extensions.role = 0 | 1 | 2`; do not treat them as separate position numbers. Trigger Strategy is also a composite UI control: Keyword means `constant = false` and `extensions.vectorized = false`, Constant means `constant = true`, and Vector Similarity means `extensions.vectorized = true`.

## Validation

Frontend validation helper: `src/lib/validation.ts`.

Backend validation helper: `src-tauri/src/validation.rs`.

Backend export uses `ensure_valid_for_export` before writing files. If adding new required fields or validation rules, check both sides for consistency.

## Migration

Frontend migration/export preparation helper: `src/lib/migrations.ts`.

Backend migration helper: `src-tauri/src/migration.rs`.

Migrations should preserve unknown fields where the schema allows it. When docs and code differ, inspect both frontend and Rust migration logic before changing behavior.

Both frontend `prepareCardForExport()` and backend `touch_for_export()` run lorebook compatibility normalization. Keep those paths aligned when changing embedded world book export behavior.
