# AI Knowledge Base Index

This knowledge base is for future AI assistants working in this repository. Read this index first, then open only the files relevant to the task.

## Project Snapshot

SillyTavern Card Creator is a local-first CCv3 character card editor built with Tauri v2, React, Vite, TypeScript, and Rust.

Primary capabilities:

- Edit CCv3 character cards in a React UI.
- Import/export JSON, PNG/APNG card metadata, and CHARX archives.
- Preserve unknown card fields where possible.
- Validate cards in both frontend helpers and Rust backend commands.
- Configure and test OpenAI-compatible AI APIs, including DeepSeek.
- Use Agent Studio as the default workspace. Its Pi Agent can read card data and create reviewable proposals; it never mutates the card before confirmation.
- Persist card workspaces, Agent sessions, message-end entries, and proposals in Rust SQLite. Legacy Guide/Edit history is unbound and read-only.

## Read Order By Task

- Architecture or navigation changes: `01-architecture.md`
- Card schema, validation, migration, import/export, assets: `02-card-data-flow.md`
- AI settings, AI chat, agent patch flow: `03-ai-features.md`
- Build, tests, toolchain issues: `04-build-test.md`
- Known traps and implementation cautions: `05-pitfalls.md`
- Important source and config references: `06-references.md`

## Source Of Truth

If this knowledge base disagrees with code, the code wins. Update the relevant `docs/ai-kb/` file after confirming the newer behavior in source.

## Maintenance Rules

- Do not rewrite the whole knowledge base for a narrow change.
- Update module docs when behavior or ownership changes.
- Update `04-build-test.md` when commands or toolchain requirements change.
- Update `05-pitfalls.md` when a new recurring trap is discovered.
- Update `06-references.md` when important config, docs, or source entry points change.
