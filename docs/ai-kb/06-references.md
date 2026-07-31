# References

## Agent Studio Entry Points

- `src/features/agent-studio/AgentStudio.tsx`: default three-column workspace and proposal confirmation UI.
- `src/lib/agent/controller.ts`: Pi Agent lifecycle, queues, abort, dynamic imports, and compaction.
- `src/lib/agent/tools.ts`: card-domain tools and hard scope boundary.
- `src/lib/agent/contracts.ts`: proposal hashes, guards, diffs, and conflict-safe apply.
- `src/lib/agent/tauriFetch.ts`: browser-safe fetch bridge to Rust request events.
- `src-tauri/src/ai.rs`: HTTP/SSE proxy, cancellation, URL policy, keyring commands.

## Key Project Files

- `README.md`: project overview, commands, implemented features, current limits.
- `package.json`: scripts, package manager, frontend dependencies.
- `vite.config.ts`: Vite configuration.
- `src/app/App.tsx`: main UI shell and navigation.
- `src/app/store.ts`: central Zustand store and local persistence.
- `src/app/useProjectActions.ts`: shared frontend project actions for opening cards, creating drafts, exports, clipboard helpers, validation refreshes, and context-menu commands.
- `src/components/ContextMenu.tsx`: global custom right-click menu system and context resolver.
- `src/lib/contextMenuTargets.ts`: internal registry for component-owned context-menu targets such as AI fields and lorebook entries.
- `src/lib/schema.ts`: TypeScript CCv3 schema and blank object helpers.
- `src/lib/validation.ts`: frontend validation.
- `src/lib/migrations.ts`: frontend migration/export preparation.
- `src/lib/lorebookCompat.ts`: SillyTavern embedded world book memo and `entry.extensions.*` compatibility helpers.
- `src/lib/tokenEstimate.ts`: lightweight heuristic token estimator for UI labels and statistics.
- `src/lib/tokenStats.ts`: card-wide estimated token statistics for text fields, prompt previews, lorebook entries, and counted asset references.
- `src/lib/tauri.ts`: frontend Tauri command wrappers.
- `src/lib/ai.ts`: AI settings, keyring migration, model fetch, compatibility probe, and legacy wrapper handling.
- `src/lib/agent/controller.ts`: Pi Agent lifecycle and dynamic runtime loading.
- `src/lib/agent/tools.ts`: normalized card inspection and proposal tools.
- `src/lib/agent/contracts.ts`: CardProposal hashes, guards, diffs, and apply rules.
- `src/lib/agent/tauriFetch.ts`: requestId-filtered Rust HTTP/SSE fetch bridge.
- `src/lib/aiAgent.ts`: normalized AI editing surface and patch application.
- `src/lib/updater.ts`: app update preferences, SemVer comparison, GitHub release checks for source/dev runs, and Tauri updater install flow for packaged builds.
- `src/features/*`: feature panels.
- `src/components/*`: reusable UI components.

## Backend Files

- `src-tauri/src/lib.rs`: Tauri command registration.
- `src-tauri/src/commands.rs`: import/export/validation commands.
- `src-tauri/src/commands.rs::path_exists`: lightweight local path preflight used before opening forced recent files.
- `src-tauri/src/card_schema.rs`: Rust card schema.
- `src-tauri/src/migration.rs`: Rust migration and export timestamp handling.
- `src-tauri/src/validation.rs`: Rust validation.
- `src-tauri/src/png_card.rs`: PNG/APNG metadata handling.
- `src-tauri/src/charx.rs`: CHARX archive handling.
- `src-tauri/src/ai.rs`: OpenAI-compatible HTTP/SSE proxy, cancellation, URL policy, and keyring access.
- `src-tauri/src/ai_history.rs`: legacy history migration plus workspace/session/entry/proposal persistence.
- `src-tauri/tauri.conf.json`: Tauri app configuration.
- `src-tauri/capabilities/default.json`: Tauri permissions/capabilities.
- `.github/workflows/release.yml`: GitHub tag release workflow that builds Windows Tauri bundles and uploads updater JSON.

## Existing Docs

- `docs/ai-assistant-prompts.md`: AI assistant prompt material; read when changing AI prompt behavior.
- DeepSeek API pricing/model limits: `https://api-docs.deepseek.com/quick_start/pricing` documents DeepSeek V4 maximum output as 384K.

## Local Storage Keys

- `sillytavern-card-creator:draft`
- `sillytavern-card-creator:draft-meta`
- `sillytavern-card-creator:recent`
- `sillytavern-card-creator:ai-settings`
- `sillytavern-card-creator:update-preferences`
