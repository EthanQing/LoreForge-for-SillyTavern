# Pitfalls

## Agent Permission Is Frontend State

Never accept editable paths, capabilities, entry indexes, or injection authority from tool input. Build `AgentPermission` before prompting and keep it fixed for the run. Unknown `@` targets must fail closed instead of falling back to card scope.

## Semantic Changes Must Be Recompiled

Do not apply a stored after-snapshot. At confirmation time, re-read the current card, compare workspace/revision/full-card hash, verify entry fingerprints, re-run permission checks, compile semantic changes, and validate the resulting card.

## Candidate Injection Must Be Atomic

Validate the complete selected candidate set before creating a new lorebook. Do not append candidates one at a time to Zustand. An unknown candidate id, empty selection, invalid field, conflict, or validation error must leave the card unchanged.

## Agent Cannot Delete

Keep deletion out of semantic change types and model tools. Manual editor deletion is a separate user action and should continue through normal store methods.

## Lorebook Unknown Field Preservation

Existing CCv3 entries may contain application-specific top-level keys and `extensions`. Apply edits over a cloned entry and change only explicitly allowed fields. Avoid reconstructing an existing entry from a narrow schema.

## Lorebook Position And Role

SillyTavern position values are numeric 0–7. Depth position needs a role value 0/1/2, while non-depth positions should not retain a stale role. Insertion order is not the current array index.

## Lorebook Memo Field

Use `comment` as the editor title/memo. Do not reintroduce the deprecated `name` alias when creating candidates.

## Credential Boundary

Never put a real API key in settings persistence, SQLite entries, event payloads, logs, or model errors. Old plaintext settings are ignored; the OS credential store is the only secret source.

## Tauri Stream Cancellation

Keep a request handle per `requestId` and replace the header-request handle with the body-stream handle after response metadata arrives. Cancelling only the initial request leaves an SSE body alive.

## Agent Session Tool Results

`tool_execution_end` is execution metadata, not a second tool-result message. Hydration should prefer persisted `message_end` tool results and preserve `toolCallId`.

## Pi Agent End Is Not Success

Pi may emit `agent_end` for error or aborted messages. Classify the final assistant message with `runStatus.ts`; do not render an empty failed message as a successful completion.

## Conversation Replacement

Regenerate/edit-resend must decode the previous instruction but issue a new permission envelope from the scope selector's current value. The selector is the user's explicit authorization; reusing the old envelope makes the visible scope disagree with the actual run. Steering and follow-up remain pinned to the active run's permission. Abort active work, prepare the message prefix, persist a branch marker, and reconcile related proposals before starting the replacement run.

## Store Side Effects

Normal UI and confirmed Agent changes must use store actions. They maintain modification timestamps, validation, draft persistence, dirty state, and revision increments.

## Greeting Promotion Should Preserve Slots

Promoting an alternate greeting must swap it with `first_mes`. Shrinking the array can invalidate exact indexed field scopes.

## Frontend And Backend Validation Drift

Validation exists in TypeScript and Rust. Update and test both sides when changing shared card rules.

## PNG Export Requires A Base Image

PNG export needs a base path or data URL. Strip inline image metadata and private `caBX` provenance chunks, then merge editor-only assets back after export so the Resources panel remains usable.

## Global Save By Current File Type

Overwrite recognized JSON, PNG/APNG, and CHARX paths in place. New cards, drafts, and unknown paths should open the save dialog.

## Asset UI Performance

Do not mount large data URIs in controlled inputs, include them in token counts, or capture a stale asset array across asynchronous uploads. Keep heavy lorebook editors lazily mounted in collapsed lists.

## Stale Recent File Paths

Check recent paths before prompting to discard dirty changes. Remove missing paths instead of surfacing a raw file-system error.

## Inspector Overflow

Agent Studio's inspector is a nested scroll surface. Panels must respect the available width, avoid global minimum widths, and preserve focus trapping and Escape close behavior in overlay mode.

## Windows Rust Toolchain

Rust checks require the MSVC build tools and Windows SDK used by Tauri. Report missing native prerequisites rather than hiding a failed check.
