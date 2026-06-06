# SillyTavern Card Creator

Local-first CCv3 character card editor built with Tauri v2, React, Vite, TypeScript, and Rust.

## Run

```bash
pnpm install
pnpm tauri dev
pnpm tauri build
```

If `pnpm` is not on PATH, enable Corepack first:

```bash
corepack enable
corepack pnpm install
corepack pnpm tauri dev
```

## Tests

```bash
pnpm test
pnpm build
cargo test
```

On Windows GNU Rust toolchains, `cargo test` and `pnpm tauri build` require GNU binutils such as `dlltool.exe`. This machine currently has `x86_64-pc-windows-gnu` installed but not `dlltool.exe`.

## Implemented

- CCv3 TypeScript and Rust data models with unknown-field preservation.
- Blank V3 card creation, V1/V2-to-V3 migration, validation, prompt preview, and token estimate helpers.
- React editor panels for project import/export, basic info, prompts, greetings, lorebook, assets, preview, and validation.
- Autosaved local draft and local recent file list.
- Rust Tauri commands for JSON, PNG/APNG `tEXt` metadata, CHARX zip import/export, and validation.
- PNG export writes `ccv3` metadata and optional legacy `chara` compatibility metadata.
- CHARX export writes root `card.json` and supports asset file entries through the backend command.
- AI settings panel for OpenAI-compatible APIs such as DeepSeek, including base URL, API key, model fetching, streaming test output, and thinking intensity.
- Global AI Chat drawer with current-card context, streaming responses, and optional reasoning display.

## Current Limits

- The first UI pass embeds selected local images as data URLs; the Rust CHARX backend can include asset files, but the UI does not yet map those assets into `embeded://` paths automatically.
- Remote asset URLs are editable but not automatically loaded for preview.
- Full AI-assisted card patch generation is not wired into the editor yet; the API settings and connection test are available.
- Rust verification is blocked on this Windows GNU environment until `dlltool.exe` or an MSVC Rust toolchain is available.
