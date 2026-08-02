# References

## Agent Studio Entry Points

- `src/features/agent-studio/AgentStudio.tsx`: shared Controller, session orchestration, transcript, scope selector, and inspector.
- `src/features/agent-studio/ProposalCard.tsx`: proposal review and lorebook candidate selection.
- `src/lib/agent/uiContext.tsx`: field and lorebook UI dispatch.
- `src/lib/agent/controller.ts`: Pi lifecycle, queues, abort, permission pinning, and compaction.
- `src/lib/agent/permissions.ts`: scopes, capabilities, mention resolution, and request envelopes.
- `src/lib/agent/projection.ts`: authorized card projections and fingerprints.
- `src/lib/agent/changes.ts`: semantic changes and SillyTavern lorebook mapping.
- `src/lib/agent/tools.ts`: typed inspect/proposal tools.
- `src/lib/agent/contracts.ts`: proposals, diffs, conflict checks, and apply.
- `src/lib/agent/persistence.ts`: Agent history command wrappers.
- `src/lib/agent/tauriFetch.ts`: Tauri HTTP/SSE fetch bridge.

## Key Project Files

- `README.md`: overview, breaking upgrade behavior, and development commands.
- `docs/usage-guide.md`: current user workflow.
- `docs/ai-assistant-prompts.md`: production prompt and tool contract.
- `package.json`: scripts, package manager, frontend version, and dependencies.
- `src/app/store.ts`: canonical card, workspace, revision, settings, and draft state.
- `src/app/useProjectActions.ts`: shared open/save/export actions.
- `src/components/AiFieldAssistant.tsx`: exact-scope field action dispatcher.
- `src/lib/schema.ts`: TypeScript CCv3 schema.
- `src/lib/lorebookCompat.ts`: SillyTavern world-book field helpers.
- `src/lib/validation.ts`: frontend validation.
- `src/lib/tokenStats.ts`: token estimates.
- `src/lib/ai.ts`: Agent settings, model fetch, credential commands, and capability probe.

## Backend Files

- `src-tauri/src/lib.rs`: Tauri command registration.
- `src-tauri/src/commands.rs`: card I/O and validation.
- `src-tauri/src/card_schema.rs`: Rust card schema.
- `src-tauri/src/migration.rs`: card format migration and export timestamps.
- `src-tauri/src/png_card.rs`: PNG/APNG metadata.
- `src-tauri/src/charx.rs`: CHARX archives.
- `src-tauri/src/ai.rs`: HTTP/SSE proxy, cancellation, URL policy, and keyring.
- `src-tauri/src/agent_history.rs`: Agent database and exact old-history cleanup.
- `src-tauri/tauri.conf.json`: application version and Tauri config.

## External Design References

- CardForge worldbook editor: https://github.com/Anastasia2372/sillytavern-cardforge/blob/main/src/renderer/views/WorldBookEditor.vue
- CardForge card store: https://github.com/Anastasia2372/sillytavern-cardforge/blob/main/src/renderer/stores/card.js
- CardForge browser PNG embedding: https://github.com/Anastasia2372/sillytavern-cardforge/blob/main/web/src/utils/png-utils.js
- Character Card V3 PNG embedding specification: https://github.com/kwaroran/character-card-spec-v3/blob/main/SPEC_V3.md#pngapng
- SillyTavern PNG character metadata parser: https://github.com/SillyTavern/SillyTavern/blob/release/src/character-card-parser.js
- DeepSeek API documentation: https://api-docs.deepseek.com/

CardForge is GPL-3.0. Use it only as a design reference; do not copy implementation source into this repository.

## Local Storage Keys

- `sillytavern-card-creator:draft`
- `sillytavern-card-creator:draft-meta`
- `sillytavern-card-creator:recent`
- `sillytavern-card-creator:ai-settings`
- `sillytavern-card-creator:update-preferences`
- `sillytavern-card-creator:agent-v3-session:<workspaceId>`
