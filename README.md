# SillyTavern Card Creator

一个本地优先的 SillyTavern CCv3 角色卡编辑器，用来创建、整理、校验、预览和导出可在 SillyTavern 中使用的角色卡。项目基于 Tauri v2、React、Vite、TypeScript 和 Rust 构建。

## 文档入口

- [完整使用指南](docs/usage-guide.md)：启动应用、制作角色卡、导入清理旧卡、使用 AI 辅助编辑和导出。
- [更新历史](CHANGELOG.md)：按日期记录用户可见功能、行为变化和文档变化。

## 主要功能

- **本地优先**：草稿、最近打开记录、当前文件状态和 AI 设置保存在本机。
- **CCv3 角色卡编辑**：覆盖基础信息、提示词、开场白、世界书、资源、预览、Token 统计和校验。
- **导入与导出**：支持 JSON、PNG/APNG 角色卡元数据，以及 CHARX 归档；导入 V1/V2 旧卡时会迁移到 CCv3。
- **保存工作流**：顶部保存按钮、项目页保存、`Ctrl/Cmd+S` 和右键菜单共用同一保存逻辑；已绑定的 JSON、PNG/APNG 或 CHARX 会优先写回原文件。
- **世界书增强**：编辑条目标题/备忘录、触发词、正文、插入顺序、常驻、选择性触发、向量相似和常见 SillyTavern 高级设置。
- **资源管理**：上传封面、添加图片或手动资源引用；大体积 `data:` 图片 URI 会折叠显示。
- **校验、预览与统计**：前端和 Rust 后端都包含角色卡校验逻辑，并提供 prompt preview、分区 token 估算、最大字段、开场白预览和世界书条目统计。
- **AI 辅助编辑**：支持 OpenAI 兼容接口，例如 DeepSeek，可配置 Base URL、API Key、模型、流式输出、推理显示、输出长度和超时。
- **AI Guide 模式**：用于解释字段、诊断写卡方向和提供建议，不会修改当前角色卡。
- **AI Edit 模式**：通过结构化 JSON patch 生成修改预览，用户确认后才应用到角色卡。
- **快捷工作流**：在 AI Edit 模式中可通过底部 `+` 菜单或 `/` 命令运行角色卡体检、一键补全、资料提取、一致性修复、Token 优化、世界书构建和导入清洗。
- **字段级 AI 助手**：长文本字段可局部润色、扩写、重写、补全、缩短、翻译、检查冲突、提取关键词或生成候选版本。
- **自动更新**：安装版启动时检查 GitHub Release 更新；源码/dev 启动只提示新版本，不会自动修改本地仓库。

当前版本专注于本地角色卡编辑与可确认的 AI JSON patch 预览。

## 快速开始

### 环境要求

- Node.js 18 或更高版本
- pnpm，项目声明的包管理器为 `pnpm@10.12.1`
- Rust 工具链
- Tauri v2 所需系统依赖

安装依赖：

```bash
pnpm install
```

如果系统没有 pnpm：

```bash
corepack enable
corepack pnpm install
```

启动 Tauri 桌面应用：

```bash
pnpm tauri dev
```

只启动前端开发服务器：

```bash
pnpm dev
```

默认 Vite 地址是 `http://127.0.0.1:1420`。

Windows PowerShell 如果拦截 `pnpm.ps1`，可以改用：

```bash
pnpm.cmd install
pnpm.cmd tauri dev
pnpm.cmd test
pnpm.cmd build
```

## 常用命令

```bash
pnpm test
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri build
```

如果 Windows GNU Rust 工具链缺少 `dlltool.exe` 等 binutils，`cargo test` 或 `pnpm tauri build` 可能失败。此时需要安装 GNU binutils，或切换到可用的 MSVC Rust 工具链。

## 自动更新与发布

安装版使用 Tauri updater。应用启动时会检查 GitHub Release 的 `latest.json`；发现新版本后会提示用户确认下载和安装。源码/dev 启动只显示新版本提醒，需要手动 `git pull` 并重新构建。

自动更新版本必须使用合法 SemVer tag，例如 `v0.1.2`、`v0.1.3`。四段 tag（例如 `v0.1.0.2`）不用于 updater。

发布前需要在 GitHub Secrets 中配置：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

推送 `v*.*.*` tag 会触发 `.github/workflows/release.yml`，构建 Windows 安装包并上传 updater 所需的 `latest.json`。

## 基本使用流程

1. 新建空白角色卡，或导入已有 JSON、PNG/APNG、CHARX 文件。
2. 依次填写基础信息、提示词、开场白、世界书和资源。
3. 在预览页检查最终数据结构和 prompt preview。
4. 在 Token 统计页查看总量、最大字段、开场白预览和世界书条目占用。
5. 在校验页处理错误和警告。
6. 可选：配置 AI 服务，用 Guide 模式询问建议，或用 Edit 模式生成可确认的结构化修改。
7. 保存或导出 JSON、PNG/APNG、CHARX，用于 SillyTavern 或备份归档。

## 技术栈

- Tauri v2
- React 19
- Vite 6
- TypeScript
- Rust
- Zustand
- Zod
