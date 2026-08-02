# Codex 协作规则

本仓库是本地优先的 SillyTavern CCv3 角色卡编辑器。当前代码、测试和配置高于文档；任务开始时按需阅读 [docs/agent/README.md](docs/agent/README.md) 路由到专项说明。

## 日常工作

- 使用 pnpm 10.12.1 管理前端依赖。完整桌面开发运行 `pnpm tauri dev`；仅启动前端运行 `pnpm dev`。
- 前端测试运行 `pnpm test`。`pnpm build` 会先执行 `tsc -b`，再执行 Vite 构建，因此是已配置的 TypeScript 类型检查路径。
- Rust 测试运行 `cargo test --manifest-path src-tauri/Cargo.toml`。未配置独立的 lint 或 format 命令，不要编造或假定其存在。
- 通过 `src/app/store.ts` 的 action 更新卡片状态；不要绕过它直接修改卡片，以保留校验、草稿、dirty 状态与 revision 更新。
- 角色卡规则变更需同时检查前端 `src/lib/validation.ts` / `src/lib/migrations.ts` 和 Rust `src-tauri/src/validation.rs` / `src-tauri/src/migration.rs`。
- Agent 输入与模型输出均不可信：权限由前端创建，变更必须经类型化提案、当前状态校验和用户确认后才能写入。

## 安全与扫描边界

- 不要将 API key 写入源码、localStorage、SQLite、日志、事件或错误信息；密钥由后端系统凭据库处理。
- 不要频繁扫描或提交生成和依赖目录：`node_modules/`、`dist/`、`.vite/`、`src-tauri/target/`、`src-tauri/gen/`、`.secrets/`、`.git/`。
- 发布签名私钥只能通过 CI secrets 提供；不要将其加入仓库。

## 文档维护

- 用户可见功能、构建/启动方式、配置、模块边界、安全边界或测试策略变更时，同步更新相关 `docs/agent/` 页面；详细路由见 [知识库索引](docs/agent/README.md)。
- 新的长期技术决策写入 `docs/agent/decisions/`；不要将推测当作既有决策记录。
