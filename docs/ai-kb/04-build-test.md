# Build And Test

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

## Rust Commands

Backend tests can be run with:

```bash
cargo test
```

Run Rust commands from `src-tauri` unless using a command that explicitly sets a manifest path.

## Known Toolchain Limitation

README notes that on Windows GNU Rust toolchains, `cargo test` and `pnpm tauri build` require GNU binutils such as `dlltool.exe`.

This machine currently has `x86_64-pc-windows-gnu` installed but not `dlltool.exe`, so Rust verification may be blocked until GNU binutils are installed or an MSVC Rust toolchain is used.

## Suggested Verification By Change Type

- Pure TypeScript helper change: `pnpm test`, then `pnpm build`.
- React UI change: `pnpm build`; run app/browser check when practical.
- Tauri command or Rust schema change: `cargo test` from `src-tauri`, plus `pnpm build` if frontend wrappers changed.
- Import/export behavior change: test the corresponding frontend wrapper and backend command path when possible.
