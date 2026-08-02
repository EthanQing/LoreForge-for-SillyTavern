# Architecture

## v0.3 Agent Studio Architecture

The application has one production Agent path. `AgentStudio` owns the long-lived `CardAgentController`, while `AgentStudioContext` dispatches requests from the composer, field assistants, and lorebook editor into that same conversation and proposal queue.

```text
UI intent
  -> frontend AgentPermission
  -> CardAgentController
  -> typed inspect/propose tool
  -> pure domain validation and semantic compilation
  -> CardProposal
  -> user review/selection
  -> atomic apply through Zustand
```

There is no Guide/Edit frontend, generic JSON patch layer, raw model response parser, field-local Controller, direct AI field setter, or read-only archive surface.

## Stack

- Tauri v2 and Rust backend
- React, TypeScript, Vite
- Zustand card store
- Pi Agent Core and Pi AI runtime
- SQLite for Agent sessions/proposals
- OS credential store for API secrets

## Frontend Shape

- `src/app/App.tsx`: application shell.
- `src/app/store.ts`: canonical card, workspace, revision, dirty state, validation, settings, and draft persistence.
- `src/features/agent-studio/AgentStudio.tsx`: shared session orchestration, transcript, inspector, and request dispatch.
- `src/features/agent-studio/ProposalCard.tsx`: proposal review and lorebook candidate selection.
- `src/lib/agent/uiContext.tsx`: shared UI command boundary.
- `src/lib/agent/controller.ts`: Pi lifecycle, queue semantics, abort, and fixed active permission.
- `src/lib/agent/permissions.ts`: scope creation, `@` parsing, capability checks, and persisted request envelopes.
- `src/lib/agent/projection.ts`: image-free authorized card projections and stable fingerprints.
- `src/lib/agent/changes.ts`: semantic change types, validation, SillyTavern mapping, unknown-field preservation, and compilation.
- `src/lib/agent/tools.ts`: typed model-facing inspect and propose tools.
- `src/lib/agent/contracts.ts`: proposals, diffs, hashes, state transitions, and conflict-safe apply.
- `src/lib/agent/persistence.ts`: Tauri Agent history calls and hydration.

Lazy-loaded editor panels remain mounted only when opened. Field assistants are lightweight dispatch controls and do not own Agent runtime state.

## State Model

Zustand owns the current `CharacterCardV3`, `workspaceId`, monotonically increasing `cardRevision`, path/origin, dirty state, validation, recent files, and AI settings. UI edits use store actions rather than mutating card data.

Agent proposals store the exact frontend permission, semantic changes, card revision, full-card hash, and entry fingerprints. Pending changes do not enter card state.

## Backend Shape

- `src-tauri/src/commands.rs`: card I/O and validation.
- `src-tauri/src/ai.rs`: HTTP/SSE proxy, cancellation, URL policy, model list, and keyring commands.
- `src-tauri/src/agent_history.rs`: Agent-only workspace/session/entry/proposal persistence and exact old-history deletion.
- `src-tauri/src/lib.rs`: command registration.

The history database is `agent_history.sqlite3`. Opening it first removes only `ai_chat_history.sqlite3`, `ai_chat_history.sqlite3-wal`, and `ai_chat_history.sqlite3-shm` from the application data directory. There is no migration, fallback, or old table schema.

## Design Convention

Keep domain code pure and UI orchestration explicit. Model output is untrusted data: permissions are supplied by the frontend, tool inputs are typed, semantic changes are compiled locally, and all writes require current-state validation plus user confirmation.
