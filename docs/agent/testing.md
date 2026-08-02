# 测试与检查

## 已配置命令

从仓库根目录执行：

```powershell
pnpm test
pnpm build
pnpm tauri dev
cargo test --manifest-path src-tauri/Cargo.toml
```

- `pnpm test` 执行 `vitest run`。前端测试以 `*.test.ts` 和 `*.test.tsx` 与源码同目录放置。
- `pnpm build` 执行 `tsc -b && vite build`，因此包含已配置的 TypeScript project-reference 类型检查和前端生产构建。
- `pnpm tauri dev` 是完整桌面开发命令；Tauri 配置会先运行 `pnpm dev`。
- Rust 测试位于 `src-tauri/src` 中的模块内，可通过指定 Cargo manifest 从仓库根目录运行。

未在 `package.json`、根配置或 CI 中发现独立 lint、format、`typecheck` 脚本，也未发现单独的 Vitest 配置文件。不要将其写成项目命令。

## 按变更选择检查

- TypeScript 纯逻辑：运行 `pnpm test` 与 `pnpm build`。
- React UI：运行 `pnpm build`；在可用环境中通过 `pnpm tauri dev` 进行手工界面检查。
- Rust 命令、迁移、PNG/CHARX 或后端校验：运行 Rust 测试；若改动 Tauri 边界，也运行 `pnpm build`。
- Agent 权限、提案或会话：覆盖权限解析、语义变更、冲突校验、候选选择与会话显示的既有测试模式。
- 发布工作流或 updater：核对 `.github/workflows/release.yml` 与 `src-tauri/tauri.conf.json`；完整打包与签名依赖本地/CI 凭据和 Windows 原生工具链。

## 待维护者确认

- 尚未从仓库配置确认持续集成是否在 release 之外执行单元测试；当前工作流仅定义 tag 触发的发布任务。
- 尚未从仓库配置确认团队期望的代码格式化工具或本地 pre-commit 钩子。
