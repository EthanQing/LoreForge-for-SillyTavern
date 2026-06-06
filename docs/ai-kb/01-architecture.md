# Architecture

## Stack

- Frontend: React 19, TypeScript, Vite 6.
- Desktop shell/backend: Tauri v2 and Rust.
- State: Zustand in `src/app/store.ts`.
- Validation/schema helpers: Zod and local TypeScript helpers.
- UI icons: `lucide-react`.
- Editors: CodeMirror through `@uiw/react-codemirror`.

## Frontend Shape

`src/app/App.tsx` owns the main shell:

- Left sidebar navigation.
- Topbar with active card name, dirty/saved status, validation summary, and AI chat button.
- Active panel switch by `activeTab`.
- Global `AiChatDrawer`.

Current tabs:

- `home`: import/export panel.
- `basic`: basic card fields.
- `prompts`: prompt fields.
- `greetings`: first message and alternate greetings.
- `lorebook`: embedded character book.
- `assets`: image/assets management.
- `preview`: prompt/card preview.
- `validation`: validation issues.
- `settings`: AI/API settings.

Panel modules live under `src/features/*`. Reusable UI components live under `src/components/*`.

## State Model

`src/app/store.ts` is the central UI state store. It owns:

- Current `CharacterCardV3`.
- Validation report.
- Dirty state.
- Active tab.
- Recent files.
- Theme.
- AI settings.

The store persists local draft, recent list, and AI settings in `localStorage`.

Important pattern: use store methods such as `updateCard`, `updateData`, `replaceCard`, `markSaved`, and `applyAgentCard` so validation, draft persistence, dirty status, and timestamps remain consistent.

## Backend Shape

`src-tauri/src/lib.rs` registers Tauri commands. Main backend modules:

- `commands.rs`: JSON/PNG/CHARX import/export command orchestration.
- `card_schema.rs`: Rust CCv3 data structures.
- `migration.rs`: V1/V2/value-to-V3 migration and export timestamp handling.
- `validation.rs`: Rust validation.
- `png_card.rs`: PNG/APNG metadata read/write.
- `charx.rs`: CHARX archive import/export.
- `ai.rs`: OpenAI-compatible model fetch and chat calls.
- `ai_history.rs`: local AI chat session persistence.

Frontend wrappers for Tauri commands live in `src/lib/tauri.ts`.

## Design Convention

Prefer existing panel/component patterns. Keep major workflows local-first and avoid adding remote dependencies unless the user explicitly asks.
