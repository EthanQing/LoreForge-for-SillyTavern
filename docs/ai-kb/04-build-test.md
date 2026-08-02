# Build And Test

## v0.3 Toolchain

Pi packages require Node `>=22.19.0`; CI uses Node `22.19.0`. Frontend dependencies pin `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` to `0.83.0`. Rust adds `keyring 4.1.5` with the Windows native store feature.

## Package Manager

The project uses pnpm:

```bash
pnpm install
```

If pnpm is not on PATH:

```bash
corepack enable
corepack pnpm install
```

## Frontend Commands

From `package.json`:

```bash
pnpm dev
pnpm build
pnpm test
pnpm tauri dev
pnpm tauri build
```

`pnpm dev` runs Vite at `127.0.0.1:1420`.

On Windows PowerShell, execution policy may block the `pnpm.ps1` shim. Use `pnpm.cmd build`, `pnpm.cmd test`, or `pnpm.cmd dev` from PowerShell when that happens.

## Updater And Release Builds

The installed app uses Tauri v2 updater. Updater artifacts are enabled in `src-tauri/tauri.conf.json` with `bundle.createUpdaterArtifacts: true`, and the updater endpoint points to the latest GitHub Release `latest.json`.

Updater versions must be valid SemVer tags such as `v0.3.0`; four-segment tags such as `v0.1.0.2` should not be used for updater releases.

Signing requirements:

- The public key is stored in `src-tauri/tauri.conf.json`.
- The private key must stay out of the repo. Use GitHub Secrets:
  - `TAURI_SIGNING_PRIVATE_KEY`
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- Local generated keys can live under `.secrets/`, which is ignored by Git.

GitHub release workflow:

- `.github/workflows/release.yml`
- Triggers on `v*.*.*` tags.
- Builds the Windows Tauri bundle and uploads updater JSON through `tauri-apps/tauri-action`.

## Rust Commands

Backend tests can be run with:

```bash
cargo test
```

Run Rust commands from `src-tauri` unless using a command that explicitly sets a manifest path.

## Known Toolchain Limitation

On Windows, use a complete MSVC toolchain and Windows SDK for Tauri. GNU targets additionally require matching binutils such as `dlltool.exe`.

## Suggested Verification By Change Type

- Pure TypeScript helper change: `pnpm test`, then `pnpm build`.
- React UI change: `pnpm build`; run app/browser check when practical.
- Updater UI/helper change: `pnpm test`, then `pnpm build`; run `pnpm tauri build` only when signing keys and a working Rust toolchain are available.
- Tauri command or Rust schema change: `cargo test` from `src-tauri`, plus `pnpm build` if frontend wrappers changed.
- Import/export behavior change: test the corresponding frontend wrapper and backend command path when possible.
- Agent domain change: test permission parsing, semantic compilation, candidate selection, revision/hash/fingerprint conflicts, and the shared field dispatcher.
- Agent history change: run the Rust cleanup test and verify deletion targets stay limited to the three exact old database files.
