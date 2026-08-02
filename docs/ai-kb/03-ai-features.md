# AI Features

## Runtime And Shared Session

The production runtime is `src/lib/agent/controller.ts` with Pi Agent Core and Pi AI. Agent Studio owns one Controller per active session. The main composer, `AiFieldAssistant`, and lorebook candidate entry point use `AgentStudioContext`, so they share messages, events, permission state, and proposals.

Completed and streaming messages are grouped into visible turns by `transcript.ts`. The frontend-only permission envelope is removed before user text is rendered.

## Frontend Permission Boundary

`AgentPermission` supports card, section, exact field, whole lorebook, and one lorebook entry scopes. Capabilities distinguish read, edit, and inject. Permissions are created from the scope selector, an exact field action, the lorebook entry point, or a resolved `@` target.

The model receives no permission parameter and cannot expand the current scope. Unknown or ambiguous mentions fail instead of falling back to a card-wide scope. A lorebook-entry scope records the entry fingerprint and exact editable fields.

Regenerate and edit-resend decode the previous instruction but create a new permission envelope from the scope selector's current value. This is an explicit user authorization boundary. Steering and follow-up messages during an active run remain pinned to that run's permission.

## Semantic Tools

Inspection tools:

- `inspect_card`
- `inspect_lorebook_entry`
- `inspect_validation`
- `inspect_token_usage`

Proposal tools:

- `propose_card_edits`
- `propose_lorebook_entry_edits`
- `propose_lorebook_injection`

There is no generic patch or delete tool. Tool handlers read the current snapshot, apply the active frontend permission, validate semantic input, compile a proposed card in memory, and create a `CardProposal`. They never mutate Zustand or files.

## Lorebook Mapping And Candidate Review

`changes.ts` maps semantic lorebook fields to CCv3/SillyTavern fields, including keywords, secondary keys, content, enabled/regex/selective flags, constant/vector trigger strategy, position 0–7, depth role, insertion order, probability, priority, case sensitivity, and outlet. Existing entries are copied before edits so unrecognized top-level and extension fields remain unchanged.

Injection candidates remain in proposal state. `ProposalCard` shows metadata, a content summary, estimated tokens, validation errors, and a checkbox. Apply requires at least one valid selection and recompiles the entire selected batch before one store update. A single invalid selection prevents every write.

## Conflict And Apply Rules

A proposal is tied to workspace, card revision, stable full-card hash, and the permission used to create it. Existing-entry edits also contain a stable entry fingerprint. Confirming a proposal rechecks all of these values, recompiles semantic changes, and runs card validation. Conflicts cannot be forced through.

Agent-generated changes always require confirmation. Manual lorebook editing and deletion remain normal store-driven editor actions.

## Provider And Credential Boundary

DeepSeek and OpenAI-compatible requests stream through the Tauri HTTP/SSE bridge. Rust reads the API key from the OS credential store and enforces the URL policy. Settings retain provider, endpoint, model, context/output limits, timeout, temperature, thinking level, tool capability, and insecure-HTTP choice.

Plaintext API keys from old local settings are ignored. There is no plaintext or ordinary-chat probe fallback. Connection testing uses the current network path and one no-side-effect tool probe.

## Agent History

`persistence.ts` uses the Agent-only Rust commands backed by `agent_history.sqlite3`. The database contains current workspace, session, entry, and proposal records only.

v0.3.0 intentionally does not migrate prior Guide/Edit or Pi Agent history. Each database open deletes the three exact old `ai_chat_history.sqlite3` files if present; unrelated application data, card files, and drafts are untouched.

## CardForge Design Reference

The candidate-review interaction is informed by CardForge's centralized card state and select-then-inject workflow. This project independently implements a stricter frontend permission boundary, semantic compilation, revision/fingerprint conflict checks, and atomic user confirmation; GPL-3.0 source is not copied.
