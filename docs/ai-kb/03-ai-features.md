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

## Chat UI

The global chat drawer is `src/features/ai-chat/AiChatDrawer.tsx`.

`src/app/App.tsx` opens it from the topbar. The drawer is global rather than tied to a single editor tab.

The drawer now has two modes:

- Guide mode: plain conversation. It explains card fields, filling strategy, and section meaning. It does not return or apply patches.
- Edit mode: structured conversation editing. It expects JSON patch output, shows a diff preview, and applies only after user confirmation.

Edit mode also exposes workflow buttons for card diagnosis, draft completion, source extraction, consistency repair, token optimization, worldBook building, and import cleanup. Workflows still return the same structured response and use preview/apply for any patches.

## Field-Level Agent

Main long-text editors can be wrapped in `AiFieldAssistant`.

Behavior:

- Shows small AI buttons while the field is focused.
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
- Patch preview converts current card to normalized shape, applies patches, converts back to CCv3, validates, and builds diffs.

Use this normalized patch layer for AI editing features instead of letting AI write arbitrary CCv3 JSON.

## Mention Targeting

Edit mode supports `@` targets in user instructions:

- `@基础`: basic fields such as name, creator, version, tags, and creator notes.
- `@提示词`: description, personality, scenario, example dialogue, system prompt, and post-history instructions.
- `@开场白`: first message and alternate greetings.
- `@世界书`: whole worldBook.
- `@世界书条目名`, `@条目序号`, or an entry id/name/key: a specific worldBook entry.
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

The AI drawer also provides mention autocomplete while composing in edit mode:

- Typing partial targets such as `@基` suggests `@基础`.
- Arrow Up/Down changes the active suggestion.
- Tab or Enter applies the active suggestion.
- Escape closes the suggestion menu.
- Suggestions include fixed sections and up to the first eight current worldBook entries.

## Prompt References

`docs/ai-assistant-prompts.md` exists and likely contains prompt text or guidance for AI-assisted workflows. Read it when changing prompt behavior or AI card editing UX.
