# AI Knowledge Base Index

Read this file first, then open only the documents relevant to the current task.

## Project Snapshot

- Product: local-first SillyTavern CCv3 card editor built with Tauri v2, React, TypeScript, Zustand, and Rust.
- Current version: 0.3.0.
- Default surface: Agent Studio with one shared Controller for the composer, field assistants, and lorebook candidate entry point.
- Agent boundary: frontend-issued `AgentPermission`, typed semantic tools, proposal review, revision/card-hash/entry-fingerprint checks, and user-confirmed writes.
- Agent history: fresh `agent_history.sqlite3`; exact old `ai_chat_history.sqlite3` database files are deleted on upgrade without migration.

## Read Order By Task

- Architecture or module boundaries: [01-architecture.md](01-architecture.md)
- Card schema, editing, import/export, or validation: [02-card-data-flow.md](02-card-data-flow.md)
- Agent tools, permissions, proposals, candidate injection, or history: [03-ai-features.md](03-ai-features.md)
- Build and release work: [04-build-test.md](04-build-test.md)
- Known traps: [05-pitfalls.md](05-pitfalls.md)
- Source entry points and external references: [06-references.md](06-references.md)

## Source Of Truth

Current code wins when documentation disagrees. Update the relevant knowledge-base document in the same change.

## Maintenance Rules

- Do not scan or rewrite the full knowledge base by default.
- Remove obsolete contracts rather than documenting compatibility paths that no longer exist.
- Keep README and the user guide aligned with user-visible behavior.
- Record breaking history or configuration changes in CHANGELOG.
