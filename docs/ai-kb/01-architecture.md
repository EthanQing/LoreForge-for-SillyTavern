# Architecture

## v0.2 Agent Studio Architecture

`src/app/App.tsx` now enters `src/features/agent-studio/AgentStudio.tsx` directly. The production shell is a three-column card workshop: workspace/session navigation, unified Pi Agent conversation, and an expandable CCv3 inspector/editor台. The former global AI drawer and Guide/Edit split are no longer mounted. Existing editor panels remain available through the inspector and are lazy-loaded.

`src/lib/agent/controller.ts` owns one dynamically loaded `@earendil-works/pi-agent-core@0.83.0` `Agent` per active session. It uses sequential tool execution, steering/follow-up queues, abort, context compaction, and `@earendil-works/pi-ai@0.83.0` OpenAI-compatible streaming. Agent instances are not stored in Zustand.

The store additionally owns a stable `workspaceId` and monotonic `cardRevision`. File opens derive a stable workspace identity from the normalized path; new cards receive a new identity and Save As keeps the current workspace. Draft metadata persists both values.

`src-tauri/src/ai.rs` is now a Rust-only HTTP/SSE proxy with request cancellation, HTTPS/loopback validation, same-origin redirects, body/header caps, and system credential-store commands. `src-tauri/src/ai_history.rs` keeps the old `sessions/messages` tables for read-only legacy archives and adds `card_workspaces`, `workspace_paths`, `agent_sessions`, `agent_entries`, and `agent_proposals`.

Agent traffic uses `src/lib/agent/tauriFetch.ts`; the WebView never connects to model hosts directly. Rust strips placeholder Authorization headers and reads the actual credential from Windows Credential Manager/keyring. The persisted frontend AI settings contain no API key.

## Stack

- Frontend: React 19, TypeScript, Vite 6.
- Desktop shell/backend: Tauri v2 and Rust.
- State: Zustand in `src/app/store.ts`.
- Validation/schema helpers: Zod and local TypeScript helpers.
- UI icons: `lucide-react`.
- Editors: CodeMirror through `@uiw/react-codemirror`.

## Frontend Shape

`src/app/App.tsx` owns the top-level theme, save shortcut, update status, and context menu, then renders `src/features/agent-studio/AgentStudio.tsx`:

- Left sidebar navigation.
- Topbar with active card name, active file/draft/new-card identity, dirty/saved status, and validation summary.
- Topbar global save entry; `Ctrl/Cmd+S` is bound to the same save action.
- Agent Studio owns the left workspace/session navigation, middle conversation, and right inspector/editor; editor panels are lazy-loaded from the inspector.
- `src/features/agent-studio/AgentSessionHistory.tsx` renders the left message history from the cross-workspace `list_agent_session_history` query. Records are grouped by `workspaceId`, each card group shows five newest sessions by default, and its own workspace-keyed toggle reveals older records without affecting another card group. Selecting a session on another card reopens its persisted path before switching to that session.
- Agent Studio is the mounted production shell; the former global `AiChatDrawer` is not mounted.
- Global custom context menu via `src/components/ContextMenu.tsx`.
- Context-sensitive right-click targets register local actions through `src/lib/contextMenuTargets.ts`; use this for component-owned actions such as field AI previews and lorebook entry open/move/delete instead of duplicating local state in the global menu.

The following are inspector entry points, not separate Guide/Edit AI modes:

- `home`: import/export panel in the inspector.
- `basic`: basic card fields.
- `prompts`: prompt fields.
- `greetings`: first message and alternate greetings.
- `lorebook`: embedded character book.
- `assets`: image/assets management.
- `preview`: prompt/card preview.
- `tokenStats`: estimated token statistics for card text, prompt previews, greetings, lorebook entries, and counted asset references.
- `validation`: validation issues.
- `settings`: AI/API settings.

Panel modules live under `src/features/*`. Reusable UI components live under `src/components/*`.

The inspector owns its own scroll region and is treated as a 560px editing desk by default. Its separator is a keyboard and pointer resize handle clamped to 420–720px. At 1100px and below the inspector becomes a focus-managed overlay with a dismissible backdrop; settings groups stack vertically, preview content uses a single readable column, and project actions collapse from two columns to one on narrow windows. The Agent Studio surface uses the Workbench/Iron/Line/Paper/Copper/Sage tokens and does not rely on gradients, glass blur, or heavy shadows.

The middle transcript uses `src/lib/agent/transcript.ts` to group one user request and all assistant/tool-loop messages into one turn. The assistant text is rendered as one bubble through `src/components/MarkdownMessage.tsx`, PI's `streamingMessage` is rendered in that same bubble while a run is active, and tool results are nested under a collapsed trace. The transcript owns vertical scrolling, places Agent bubbles at the left and user bubbles at the right of the available message area, constrains child widths, sizes bubbles to their content up to a capped width, and wraps long JSON/path content so tool payloads cannot create horizontal overflow.

Global project/file actions that need to be reused outside the import/export panel live in `src/app/useProjectActions.ts`. Prefer this hook for open, new-card, save, export, copy, validation refresh, and context-menu actions instead of duplicating import/export logic in UI components.

## State Model

`src/app/store.ts` is the central UI state store. It owns:

- Current `CharacterCardV3`.
- Current card identity: `currentPath` plus `cardOrigin` (`file`, `draft`, or `new`).
- Validation report.
- Dirty state.
- Active tab.
- Recent files.
- Theme.
- AI settings.

The store persists local draft, draft identity metadata, recent list, and AI settings in `localStorage`.

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
