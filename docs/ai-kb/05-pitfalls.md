# Pitfalls

## Unknown Field Preservation

Both TypeScript schemas and Rust models are intended to preserve unknown CCv3 fields where possible. Avoid replacing card objects with narrow reconstructed objects unless you deliberately carry through existing fields.

## Store Side Effects

Do not bypass `useCardStore` update methods for normal UI edits. These methods handle timestamp updates, validation, draft persistence, dirty state, and status messages.

## Frontend And Backend Validation Drift

Validation exists in both TypeScript and Rust. If changing rules, update and test both sides or document why only one side changed.

## PNG Export Requires A Base Image

Backend PNG export needs either `base_png_path`/`basePngPath` or `base_png_data_url`/`basePngDataUrl`. A card alone cannot be exported as PNG without cover image bytes.

## Tauri Argument Naming

`src/lib/tauri.ts` currently passes both camelCase and snake_case argument names for PNG base image fields. Be careful when changing Tauri command argument names; frontend/backend naming mismatches are easy to introduce.

## CHARX Asset Mapping Is Incomplete In UI

Backend CHARX export supports asset entries, but README says the UI does not yet automatically map selected assets into `embeded://` paths. Treat CHARX asset work as a cross-frontend/backend workflow, not a backend-only task.

## AI Patch Scope

AI agent patches intentionally target a normalized editing surface. Do not expand allowed patch paths casually; raw `/data/...` edits are rejected by design.

## SillyTavern World Book Memo Field

SillyTavern imports embedded `character_book.entries[*].comment` as the visible Entry Title/Memo. The legacy/non-ST `name` field is not enough and should not be shown to users. AI-generated or exported lorebook entries must keep `comment` non-empty, usually via `src/lib/lorebookCompat.ts`.

New world book entries should not write `entries[*].name`. Export normalization may use an existing `name` as a fallback source for blank `comment`, then removes `name` from the exported entry.

## SillyTavern Lorebook Extension Fields

Several SillyTavern world book options are read from `entry.extensions.*`, including `position`, `depth`, `probability`, `case_sensitive`, recursion flags, group fields, triggers, and automation IDs. Do not move these into narrow top-level fields or they may appear empty/default after importing into SillyTavern.

## Mention Parsing With Chinese Punctuation

`@` edit targets may be followed by Chinese punctuation, such as `@基础，帮我补全一下`. Mention parsing must stop at punctuation as well as whitespace; otherwise `@基础，帮我补全一下` becomes an unknown mention and target filtering is bypassed.

## Static AI Target Lists Go Stale

Do not render a persistent `@` target guide in the AI chat composer. World book entries can change while the drawer is open, and a static row makes stale targets look authoritative. Keep `@` as type-ahead autocomplete and put workflow actions in the composer `+` or `/` command menu.

## Windows Rust Toolchain

On this machine, Rust verification can fail because the GNU toolchain lacks `dlltool.exe`. This is an environment limitation, not necessarily a code failure.
