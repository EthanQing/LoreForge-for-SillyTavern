# AI Features

## Settings

AI settings are defined in `src/lib/ai.ts`.

Default profile:

- Provider profile: `deepseek`
- Base URL: `https://api.deepseek.com`
- Model: `deepseek-v4-flash`
- Streaming enabled.
- Reasoning display enabled.
- Thinking mode enabled with `high` effort.
- Max output token setting defaults to `8192` but can be raised to `384000` for DeepSeek V4-sized outputs.
- Request timeout defaults to `60000` ms but can be raised up to `1800000` ms for very long streamed responses.

Settings are normalized through `normalizeAiSettings` and persisted by `src/app/store.ts` under localStorage key `sillytavern-card-creator:ai-settings`.

## Backend Commands

Registered in `src-tauri/src/lib.rs`:

- `fetch_ai_models`
- `test_ai_connection`
- `send_ai_chat`
- AI chat history commands in `ai_history.rs`

Frontend calls are wrapped by:

- `fetchAiModels`
- `testAiConnection`
- `sendAiChat`

Streaming uses the Tauri event channel `ai://stream` and filters events by `requestId`.

Structured AI edit requests can pass `jsonResponse` through `sendAiChat`; the Tauri backend maps it to OpenAI-compatible `response_format: { "type": "json_object" }`. Use this for Agent/edit workflows that must be parsed as raw JSON, but do not enable it for guide-mode prose chat.

## Chat UI

The global chat drawer is `src/features/ai-chat/AiChatDrawer.tsx`.

`src/app/App.tsx` opens it from the bottom-right floating AI button. The drawer is global rather than tied to a single editor tab, and it uses a slide/fade animation for open and close.

The drawer now has two modes:

- Guide mode: plain conversation. It explains card fields, filling strategy, and section meaning. It does not return or apply patches.
- Edit mode: structured conversation editing. It expects JSON patch output, shows the applied patch JSON plus the resulting normalized JSON for review, and applies only after user confirmation.

Edit mode keeps workflow actions behind the composer command menu instead of a persistent toolbar. Click the `+` control in the composer bottom toolbar or type `/` to select card diagnosis, draft completion, source extraction, consistency repair, token optimization, worldBook building, or import cleanup. The workflow menu closes when the user selects an item, clicks outside it, presses Escape, or toggles `+` again. Selecting a workflow inserts its editable default instruction into the composer, keeps focus there so the user can add direction before sending, and shows a small workflow pill in the composer toolbar. Hovering the pill reveals an `x` control to cancel the workflow selection without deleting the typed instruction. The actual workflow runs only when the user sends the message. Workflows still return the same structured response and use preview/apply for any patches.

The composer bottom toolbar also exposes a compact model/reasoning menu next to the send button. It writes directly to the existing AI settings store (`model`, `thinkingMode`, and `thinkingEffort`) so chat requests use the selected values immediately.

AI chat history is selected through a custom in-drawer popover/listbox in `AiChatDrawer.tsx`, not a native `<select>`, so long history titles and the dropdown surface stay inside the Tauri window.

Guide mode and Edit mode keep separate chat histories. `ai_history.rs` stores a `mode` on each session, `list_ai_chat_sessions` filters by the active mode, and the drawer keeps separate current session state for each mode. Existing history rows without `mode` migrate to `guide`; rows with stored AI preview data migrate to `edit`.

The history UI is optimized for long-running use: saved-session summaries are updated locally after a save instead of re-querying the full history list, and preview JSON blocks only stringify/render their large payloads when the user expands them. Only pending AI previews default to an open JSON response; older applied/discarded previews stay collapsed.

During streaming responses, the drawer only auto-scrolls when the user is already near the bottom of the message list. Sending a new message or loading a history session still scrolls to the latest message, but manual upward scrolling pauses stream-following so reasoning panels and earlier content remain reachable.

The drawer has a soft stop control while an AI response is active. It releases the UI immediately and invalidates the in-flight request token so late stream deltas or results from the old request are ignored. This is a frontend recovery path; the underlying Tauri HTTP request may still finish naturally.

When an AI edit preview is applied, the drawer uses the shared project save path to silently save existing JSON, PNG/APNG, or CHARX cards after applying the patch. New cards and unbound local drafts do not open a save dialog from this automatic AI-only save path; they remain saved to the local draft until the user runs the normal Save action.

## Field-Level Agent

Main long-text editors can be wrapped in `AiFieldAssistant`.

Behavior:

- Shows small AI buttons while the field is focused.
- Also registers a context-menu target: right-clicking the field shell/label area outside the editable text opens the same field actions in the global context menu.
- Default actions are polish/expand and rewrite.
- More actions include complete, shorten, translate, character voice, conflict check, keyword extraction, and variants.
- Results are shown as a mini field diff preview and are not applied until the user confirms.
- Field actions use the same normalized patch flow and path filtering as chat edits.

Field targeting state lives in `src/lib/aiFieldContext.ts` so chat mentions like `@当前字段` and `@选中文本` can reuse the latest focused field target.

## AI Agent Patch Flow

`src/lib/aiAgent.ts` defines a normalized card surface for AI patching.

Important behavior:

- AI responses must be raw JSON, not Markdown.
- Allowed patch roots are normalized fields such as `/name`, `/description`, `/alternateGreetings`, `/tags`, and `/worldBook`.
- Raw card paths such as `/data`, `/data/...`, `/spec`, and `/spec_version` are rejected.
- `regexScripts` patches are rejected because regex scripts are not supported yet.
- Patch preview converts current card to normalized shape, applies patches, converts back to CCv3, validates, and builds diffs. The chat preview surfaces the structured JSON directly so large worldBook changes can be inspected before applying.
- World book entry `order` controls the final persisted entry array order. When AI patches `/worldBook/entries/*/order`, `fromNormalizedAiCard` sorts entries by `order` and preserves those exact values as `insertion_order`.

Use this normalized patch layer for AI editing features instead of letting AI write arbitrary CCv3 JSON.

## Mention Targeting

Edit mode supports `@` targets in user instructions:

- `@基础`: basic fields such as name, creator, version, tags, and creator notes.
- `@提示词`: description, personality, scenario, example dialogue, system prompt, and post-history instructions.
- `@开场白`: first message and alternate greetings.
- `@世界书`: whole worldBook.
- `@世界书条目名`, `@条目序号`, or an entry id/comment/key: a specific worldBook entry.
- `@当前字段`: latest focused AI-enabled field.
- `@选中文本`: latest selection target when available.
- `@空字段`: empty normalized fields only.
- `@弱字段`: short/weak normalized text fields only.
- `@错误`: normalized paths derived from the validation report.
- `@不要改基础`, `@不要改提示词`, `@不要改开场白`, `@不要改世界书`: denied-path filter.

Target parsing and local patch filtering live in `src/lib/aiAgent.ts`:

- `parseAiAgentEditTarget`
- `filterAiPatchesForTarget`
- `filterAiPatchesByDeniedPaths`
- `createAiAgentPreviewForTarget`
- `createEditTargetFromFieldTarget`

The prompt tells the model to obey the target, but local filtering is still required because model output is untrusted.

AI chat history persists both preview JSON and preview state. Historical previews that were applied or discarded expose a re-inject action: the stored AI response patches are recalculated against the current card and then applied through the same preview/apply/save flow. Do not reapply the historical `preview.after` snapshot directly, because it may overwrite newer user edits.

The AI drawer also provides mention autocomplete while composing in edit mode, without rendering a static `@` target guide row:

- Typing partial targets such as `@基` suggests `@基础`.
- Arrow Up/Down changes the active suggestion.
- The active suggestion is scrolled into view while navigating long candidate lists with the keyboard.
- Tab or Enter applies the active suggestion.
- Escape closes the suggestion menu.
- Suggestions include fixed sections and all current worldBook entries. The menu height is bounded and scrollable instead of dropping later entries.

## Prompt References

`docs/ai-assistant-prompts.md` exists and likely contains prompt text or guidance for AI-assisted workflows. Read it when changing prompt behavior or AI card editing UX.
