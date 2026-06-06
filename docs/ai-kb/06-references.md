# References

## Key Project Files

- `README.md`: project overview, commands, implemented features, current limits.
- `package.json`: scripts, package manager, frontend dependencies.
- `vite.config.ts`: Vite configuration.
- `src/app/App.tsx`: main UI shell and navigation.
- `src/app/store.ts`: central Zustand store and local persistence.
- `src/lib/schema.ts`: TypeScript CCv3 schema and blank object helpers.
- `src/lib/validation.ts`: frontend validation.
- `src/lib/migrations.ts`: frontend migration/export preparation.
- `src/lib/lorebookCompat.ts`: SillyTavern embedded world book memo and `entry.extensions.*` compatibility helpers.
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

## Local Storage Keys

- `sillytavern-card-creator:draft`
- `sillytavern-card-creator:recent`
- `sillytavern-card-creator:ai-settings`
