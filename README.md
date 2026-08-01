# SillyTavern Card Creator

本地优先的 SillyTavern CCv3 角色卡编辑器。v0.2.0 以 Pi Agent Core 为运行时，默认进入 Agent Studio：Agent 读取当前卡片、校验和 Token 统计，并生成需要用户确认的修改提案；确认前不会写入卡片或文件。

## 主要能力

- Agent Studio 三栏工作区：卡片级会话、统一对话、工具轨迹、提案审核和可展开编辑台。
- 每次用户请求按一个 Agent turn 展示：用户和 Agent 各保留一个消息气泡，工具调用收纳在可展开轨迹中；Agent 文本会随 SSE 增量流式更新。
- CCv3 字段编辑、世界书、资源、预览、校验、Token 统计与导入导出继续保留。
- 支持 JSON、PNG/APNG 和 CHARX，保留未知字段并沿用现有保存流程。
- Pi Agent Core 0.83.0 通过内置卡片工具读取卡片；修改只能以 AiPatch 提案形式产生，应用前执行 revision、路径和校验冲突检查。
- DeepSeek 与 OpenAI-compatible Chat Completions；模型网络由 Rust HTTP/SSE 代理处理，API key 只写入系统凭据库。
- 每张卡片拥有独立 workspace 和会话；旧 Guide/Edit 历史作为未绑定只读档案保留。
- Agent Studio 使用 Workbench / Iron / Copper / Sage 视觉令牌；右侧编辑台默认 560px，可拖拽或用方向键调整，窄窗口会切换为带遮罩和焦点管理的覆盖层。

## 开发环境

- Node.js 22.19.0
- pnpm 10
- Rust 工具链与 Tauri v2 所需系统依赖

安装依赖并启动桌面应用：

    pnpm install
    pnpm tauri dev

仅启动前端开发服务器：

    pnpm dev

Windows PowerShell 如果拦截 pnpm.ps1，可使用 pnpm.cmd。

## AI 连接

在 Agent Studio 右侧设置中选择 DeepSeek 或 OpenAI-compatible，填写 base URL、模型和 API key。保存或测试连接时，密钥会写入 Windows Credential Manager（其他平台使用系统 keyring），不会进入设置 JSON、SQLite、事件或错误信息。

生产环境默认要求 HTTPS；HTTP 仅允许 loopback，局域网 HTTP 需要显式开启不安全 HTTP。连接测试包含无副作用的工具调用探针；不支持工具调用的模型只能普通对话，提案工具会被禁用。

## Agent 使用方式

1. 在中栏输入问题，先让 Agent 读取卡片、校验或 Token 统计。
2. 需要修改时，Agent 必须调用 propose_card_changes 创建待审核提案。
3. 在对话或右侧提案卡中查看路径、diff 和校验报告。
4. 点击确认应用。应用前会再次检查当前 cardRevision 和受影响路径；冲突不会覆盖新编辑。
5. 已绑定文件沿用静默保存；未绑定卡片保持草稿并可通过现有保存/导出流程落盘。

停止会调用 Agent abort 并取消 Rust 网络流；运行期间再次发送会进入 steering，完成后继续可使用 follow-up。

## 检查命令

    pnpm test
    pnpm build
    cargo test --manifest-path src-tauri/Cargo.toml
    pnpm tauri build

最后一项需要完整的 Tauri Windows 工具链；若工具链不可用，前三项仍可用于前端和 Rust 回归检查。

## 文档

- [完整使用指南](docs/usage-guide.md)
- [AI 提示词契约](docs/ai-assistant-prompts.md)
- [更新历史](CHANGELOG.md)
- [第三方许可](THIRD_PARTY_NOTICES.md)
- [AI 知识库索引](docs/ai-kb/00-index.md)
