# 仓库地图

## 入口与配置

| 路径 | 职责 |
| --- | --- |
| `package.json` | 前端依赖、pnpm 版本与脚本。 |
| `vite.config.ts` | React Vite 配置、开发地址 `127.0.0.1:1420`、版本常量。 |
| `tsconfig*.json` | TypeScript project references 与严格编译选项。 |
| `src/main.tsx` | React 入口。 |
| `src/app/App.tsx` | 应用壳、主题、更新检查与全局快捷键。 |
| `src-tauri/tauri.conf.json` | Tauri 应用、开发/构建命令、CSP、打包与 updater 配置。 |
| `src-tauri/src/main.rs`、`src-tauri/src/lib.rs` | Rust 可执行入口与 Tauri 命令注册。 |
| `.github/workflows/release.yml` | 语义版本 tag 触发的 Windows 发布工作流。 |

## 源码模块

| 目录 | 职责 |
| --- | --- |
| `src/app/` | 全局状态、项目操作、应用级样式。 |
| `src/components/` | 通用 UI 组件。 |
| `src/features/card-editor/` | 卡片基础信息、提示词、开场白、预览与校验面板。 |
| `src/features/lorebook/` | 世界书编辑器。 |
| `src/features/assets/` | 卡片资源管理。 |
| `src/features/import-export/` | 导入导出界面。 |
| `src/features/settings/` | 设置界面。 |
| `src/features/agent-studio/` | Agent 会话、提案审阅和历史界面。 |
| `src/lib/` | 前端领域逻辑、Tauri 包装与通用工具。 |
| `src/lib/agent/` | Agent 权限、工具、提案、会话与持久化逻辑。 |
| `src-tauri/src/` | Rust 领域、文件格式、AI 与 Tauri 命令。 |
| `src-tauri/icons/` | 应用图标资源。 |
| `src-tauri/capabilities/` | Tauri capability 配置。 |

## 不应频繁扫描的目录

- `node_modules/`：前端第三方依赖。
- `dist/`：Vite 构建输出。
- `.vite/`：Vite 缓存。
- `src-tauri/target/`：Cargo 构建输出和依赖编译产物。
- `src-tauri/gen/`：Tauri 生成文件。
- `.secrets/`：本地敏感配置目录，已被 Git 忽略。
- `.git/`：Git 内部数据。

这些目录不是业务源码；除非任务明确涉及构建产物、依赖诊断或本地密钥配置，否则从搜索范围中排除。
