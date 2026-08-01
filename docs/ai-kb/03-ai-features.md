# AI Features

## Agent Studio Runtime (v0.2)

The production path is src/lib/agent/controller.ts plus src/lib/agent/tools.ts. It dynamically loads Pi Agent Core 0.83.0 and Pi AI 0.83.0, uses a stable Agent, sequential tool execution, steering/follow-up queues, abort, context compaction, and a custom Tauri fetch implementation.

`CardAgentController.streamingMessage` exposes PI's current partial assistant message. Agent Studio combines it with completed messages through `src/lib/agent/transcript.ts`, so a tool loop remains one visible Agent turn and updates in place as SSE deltas arrive. User and assistant text is rendered by `src/components/MarkdownMessage.tsx` with React nodes rather than raw HTML; headings, lists, tables, quotes, code blocks, links, and common inline emphasis are supported while unsafe link schemes remain plain text. Tool result JSON is formatted only when its result control is opened.

The five built-in tools are inspect_card, inspect_lorebook_entry, inspect_validation, inspect_token_usage, and propose_card_changes. Inspection tools return normalized, image-free card data. The proposal tool checks cardRevision, hard allowed paths, patch types, guards, and frontend validation; it never writes Zustand, files, or card content.

The right inspector's `待审核修改` section contains only `pending` and `conflicted` proposals. Applied and discarded proposals are not active review items and are not shown there. Proposal state labels are localized in the UI, and the Agent system prompt asks for Chinese user-facing summaries unless the user requests another language.

contracts.ts defines AiConnectionProfile, CardProposal, proposal states, deterministic hashes, diffs, and conflict-safe apply. Unrelated edits can merge. A changed affected path marks a proposal conflicted and never force-overwrites the current card.

The default Agent boundary includes only normalized card roots. Field-level Agent actions pass a single target path as an additional hard boundary. The Agent receives no file, shell, or arbitrary network tools.

## Provider and credential boundary

The UI supports DeepSeek and OpenAI-compatible Chat Completions. Models stream through pi-ai Models.streamSimple with a browser-safe fetch that calls Rust start_ai_http_stream. Rust removes placeholder Authorization and profile headers, reads the actual secret from the OS keyring, and emits base64 response chunks filtered by requestId.

The Rust layer also provides cancel_ai_http_stream, configure_ai_profile, fetch_ai_models, store_ai_credential, ai_credential_status, and delete_ai_credential. HTTPS is required by default; HTTP is limited to loopback unless explicitly enabled. Redirects stay on the same origin and request/response sizes are capped.

Connection tests send a no-side-effect card_agent_probe tool declaration. A successful tool call records supported; a normal fallback response records unsupported; an unavailable probe is retried as ordinary chat and remains a connection error if that also fails.

AI settings keep apiKey only as a transient migration/input field. store.ts strips it before localStorage writes. Legacy localStorage keys are migrated to the system credential store once; failure remains visible in Settings and does not silently create a plaintext file fallback.

## Sessions and proposals

Each card has workspaceId and monotonically increasing cardRevision. Agent sessions and proposals are persisted in Rust SQLite tables card_workspaces, workspace_paths, agent_sessions, agent_entries, and agent_proposals. Completed messages are appended on message_end, including assistant tool calls and tool results.

The old sessions/messages tables are retained for idempotent migration. Rows without a workspace are legacy_read_only archives. Copying a legacy archive into a card creates a new session; old pending previews cannot be applied directly.

## Field-level actions

AiFieldAssistant creates a short-lived CardAgentController with one target path. It asks the Agent to read the current revision and create a proposal, previews the normalized result, and calls the existing editor callback only after the user confirms. Direct JSON response parsing is not part of the production path.

## Legacy source

src/features/ai-chat/AiChatDrawer.tsx and the old Guide/Edit prompt builders remain only for compatibility tests and migration reference. App.tsx does not mount the drawer, no Rust send_ai_chat or test_ai_connection command is registered, and all production actions use Agent Studio proposals.
