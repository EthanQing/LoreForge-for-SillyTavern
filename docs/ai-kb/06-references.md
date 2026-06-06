# References

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
- `src/lib/ai.ts`: AI settings, model fetch, chat wrappers, stream handling.
- `src/lib/aiAgent.ts`: normalized AI editing surface and patch application.
- `src/features/*`: feature panels.
- `src/components/*`: reusable UI components.

## Backend Files

- `src-tauri/src/lib.rs`: Tauri command registration.
- `src-tauri/src/commands.rs`: import/export/validation commands.
- `src-tauri/src/card_schema.rs`: Rust card schema.
- `src-tauri/src/migration.rs`: Rust migration and export timestamp handling.
- `src-tauri/src/validation.rs`: Rust validation.
- `src-tauri/src/png_card.rs`: PNG/APNG metadata handling.
- `src-tauri/src/charx.rs`: CHARX archive handling.
- `src-tauri/src/ai.rs`: OpenAI-compatible AI backend.
- `src-tauri/src/ai_history.rs`: AI chat history persistence.
- `src-tauri/tauri.conf.json`: Tauri app configuration.
- `src-tauri/capabilities/default.json`: Tauri permissions/capabilities.

## Existing Docs

- `docs/ai-assistant-prompts.md`: AI assistant prompt material; read when changing AI prompt behavior.
- DeepSeek API pricing/model limits: `https://api-docs.deepseek.com/quick_start/pricing` documents DeepSeek V4 maximum output as 384K.

## Local Storage Keys

- `sillytavern-card-creator:draft`
- `sillytavern-card-creator:draft-meta`
- `sillytavern-card-creator:recent`
- `sillytavern-card-creator:ai-settings`
