# Pitfalls

## Unknown Field Preservation

Both TypeScript schemas and Rust models are intended to preserve unknown CCv3 fields where possible. Avoid replacing card objects with narrow reconstructed objects unless you deliberately carry through existing fields.

## Store Side Effects

Do not bypass `useCardStore` update methods for normal UI edits. These methods handle timestamp updates, validation, draft persistence, dirty state, and status messages.

## Frontend And Backend Validation Drift

Validation exists in both TypeScript and Rust. If changing rules, update and test both sides or document why only one side changed.

## PNG Export Requires A Base Image

Backend PNG export needs either `base_png_path`/`basePngPath` or `base_png_data_url`/`basePngDataUrl`. A card alone cannot be exported as PNG without cover image bytes.

## Global Save By Current File Type

The global Save action should overwrite the active card file in place when `currentPath` is JSON, PNG/APNG, or CHARX. For PNG/APNG, prefer the current main icon/cover asset as the export base so cover uploads are reflected in the saved image; use the current image path as the fallback base before writing back to the same path. Only new cards, local drafts, and unrecognized paths should open a save dialog, with PNG as the default format.

## Tauri Argument Naming

`src/lib/tauri.ts` currently passes both camelCase and snake_case argument names for PNG base image fields. Be careful when changing Tauri command argument names; frontend/backend naming mismatches are easy to introduce.

## CHARX Asset Mapping Is Incomplete In UI

Backend CHARX export supports asset entries, but README says the UI does not yet automatically map selected assets into `embeded://` paths. Treat CHARX asset work as a cross-frontend/backend workflow, not a backend-only task.

## Large Data URIs In Controlled Inputs

Asset image `data:` URIs can be very large. Do not render them into controlled `<input>` fields by default on tab mount; this can block the resources page when switching tabs. Use the folded summary/edit-on-demand pattern in `AssetsPanel`.

## Asset Uploads After Deletes

Asset uploads read files asynchronously. Do not append uploaded assets using a captured `assets` array from the component render, because deletes or other edits can make that snapshot stale before `FileReader` finishes. Use store append helpers that read the latest card state, and keep cover upload separate from ordinary image upload.

## Heavy Editors In Closed Panels

Closed list rows should not mount expensive editor subtrees. World book entries can contain many `CodeEditor`, `AiFieldAssistant`, `ChipInput`, and advanced controls; use `Collapsible` lazy mounting and close-time unmounting for large repeated sections, and keep collapsed summaries bounded to short strings.

## AI Patch Scope

AI agent patches intentionally target a normalized editing surface. Do not expand allowed patch paths casually; raw `/data/...` edits are rejected by design.

## AI History Applied State

An AI chat preview marked `applied` means the patch was applied to the editor state at that time; it is not proof that an external card file was saved. AI preview apply now silently saves existing bound card files, but unbound drafts remain local-only. For recovery, re-inject stored history patches against the current card instead of copying an old `preview.after` snapshot over newer edits.

## AI History Rendering Cost

AI agent previews can contain large normalized card JSON and world book payloads. Do not eagerly `JSON.stringify` every preview in the chat history; render/stringify preview JSON only when its details panel is opened, and keep old applied/discarded previews collapsed by default. After saving a chat session, update the visible session summary locally instead of immediately re-querying the entire history list.

## SillyTavern World Book Memo Field

SillyTavern imports embedded `character_book.entries[*].comment` as the visible Entry Title/Memo. The legacy/non-ST `name` field is not enough and should not be shown to users. AI-generated or exported lorebook entries must keep `comment` non-empty, usually via `src/lib/lorebookCompat.ts`.

New world book entries should not write `entries[*].name`. Export normalization may use an existing `name` as a fallback source for blank `comment`, then removes `name` from the exported entry.

## SillyTavern Lorebook Extension Fields

Several SillyTavern world book options are read from `entry.extensions.*`, including `position`, `depth`, `probability`, `case_sensitive`, recursion flags, group fields, triggers, and automation IDs. Do not move these into narrow top-level fields or they may appear empty/default after importing into SillyTavern.

SillyTavern's insert-at-depth options are not unique `position` values. They are `extensions.position = 4` with `extensions.role` carrying system/user/assistant. If a UI presents official-looking `[System/User/AI] @D` choices, it must preserve both fields and should clear `role` when switching away from depth insertion.

## Lorebook Insertion Order Is Not UI Index

Do not normalize world book `insertion_order` values to `0..n` just because entries are displayed in an array. Users may intentionally maintain ranges such as `100+`, and SillyTavern allows multiple entries to share the same insertion order. AI `order` patches should be sorted by order while preserving the exact numeric values. Manual drag reordering should move array display order only, without reassigning or deduplicating `insertion_order`.

For draggable collapsible rows, put the `draggable` attribute and drag handlers on the collapsible trigger itself. A nested native draggable handle inside a `<button>` trigger can fail to start drag reliably in the Tauri WebView because the button interaction consumes the pointer gesture. If the interaction must be started from a visible handle, use pointer capture as a fallback and keep React state out of the code path that decides whether `dragover/drop` is allowed; native `drop` may never fire if `dragover.preventDefault()` is skipped.

## Mention Parsing With Chinese Punctuation

`@` edit targets may be followed by Chinese punctuation, such as `@基础，帮我补全一下`. Mention parsing must stop at punctuation as well as whitespace; otherwise `@基础，帮我补全一下` becomes an unknown mention and target filtering is bypassed.

## Static AI Target Lists Go Stale

Do not render a persistent `@` target guide in the AI chat composer. World book entries can change while the drawer is open, and a static row makes stale targets look authoritative. Keep `@` as type-ahead autocomplete and put workflow actions in the composer `+` or `/` command menu.

## Streaming Chat Auto-Scroll

Do not force the AI chat drawer to the bottom for every streamed delta. Respect manual upward scrolling by auto-following only while the message list is already near the bottom; otherwise expanded reasoning panels and earlier messages become impossible to inspect or collapse during streaming.

## Native Select Dropdowns In Tauri

Native `<select>` dropdown surfaces can render outside the app window or look like browser/system UI in the Tauri desktop shell. For drawer popovers and dense desktop controls such as AI chat history, prefer an app-rendered popover/listbox that is bounded by the drawer/window.

## Page Transition Containers Must Not Clip Panels

The main workspace scroll is owned by `.workspace-scroll`. Do not wrap tab panels in a `height: 100%` plus `overflow: hidden` transition container, because long settings/preview/validation pages will be clipped when the Tauri window is short and the outer scroller will not see their real height. Keep the entering page in normal flow and make only the exiting animation layer absolute.

## Windows Rust Toolchain

On this machine, Rust verification can fail because the GNU toolchain lacks `dlltool.exe`. This is an environment limitation, not necessarily a code failure.
