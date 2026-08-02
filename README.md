# SillyTavern Card Creator

本地优先的 SillyTavern CCv3 角色卡编辑器。v0.3.0 将 Agent 操作统一到 Agent Studio：前端先确定权限范围，模型只能通过类型化领域工具创建提案，用户确认前不会写入卡片或文件。

## 主要能力

- 编辑 CCv3 基础信息、提示词、开场白、世界书与资源，支持预览、校验和 Token 统计。
- 导入与导出 JSON、PNG/APNG 和 CHARX；PNG 固定嵌入酒馆兼容的 `chara` 与标准 `ccv3` 双元数据块，未知 CCv3 字段与扩展字段按现有数据流保留。
- Agent Studio 提供卡片级会话、AI 短标题、流式输出、工具轨迹、提案队列和统一编辑台。
- `@` 目标、范围选择器和字段助手都会生成前端控制的 `AgentPermission`；模型不能扩大范围。
- 卡片字段、已有世界书条目和世界书候选分别使用类型化工具，不接受通用 JSON Patch，也不提供 Agent 删除能力。
- 世界书候选展示标题、关键词、内容摘要、触发与注入设置、Token 估算和校验错误；勾选后一次性确认注入。
- 提案应用前检查卡片 revision、卡片快照哈希和条目指纹；冲突或任一所选候选无效时整批拒绝。
- Agent 会话与提案使用 `agent_history.sqlite3`；v0.3.0 首次打开历史库时会不可恢复地删除旧 `ai_chat_history.sqlite3` 及其 WAL/SHM 文件。角色卡和草稿不受影响。

## 开发环境

- Node.js 22.19.0
- pnpm 10
- Rust 工具链与 Tauri v2 所需系统依赖

```powershell
pnpm install
pnpm tauri dev
```

只启动前端开发服务器：

```powershell
pnpm dev
```

## Agent 连接

在 Agent Studio 的设置中配置 DeepSeek 或 OpenAI-compatible 端点、模型和 API key。密钥只写入系统凭据库，不进入 localStorage、SQLite、事件或错误信息。v0.3.0 不读取旧设置中的明文密钥；升级后如系统凭据库中没有密钥，请重新输入。

生产环境默认要求 HTTPS；HTTP 仅允许 loopback，局域网 HTTP 需要显式开启。连接测试只执行无副作用的工具能力探针；不支持工具调用的模型不能创建 Agent 提案。

## Agent 使用方式

1. 在输入框上方选择整张卡片、基础信息、提示词、开场白或世界书范围，也可以输入 `@条目标题` 锁定已有世界书条目。
2. 输入具体要求并发送。字段助手和世界书面板入口会将请求送入同一会话。
   首轮成功完成后，应用会使用当前模型生成简短会话标题；标题生成不进入消息记录，也不会调用卡片工具。
3. Agent 读取授权投影，并通过卡片编辑、世界书条目编辑或世界书候选注入工具创建提案。
4. 审阅差异；世界书候选需先勾选条目，再点击“确认注入所选”。
5. 应用时会重新检查当前 revision、卡片快照和条目指纹。任何冲突或校验错误都会阻止整批写入。

手动世界书编辑与删除继续可用。Agent 不能删除卡片字段或世界书条目。

## 检查命令

```powershell
pnpm test
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
```

## 文档

- [完整使用指南](docs/usage-guide.md)
- [Agent 提示词与工具契约](docs/ai-assistant-prompts.md)
- [更新历史](CHANGELOG.md)
- [第三方许可](THIRD_PARTY_NOTICES.md)
- [AI 知识库索引](docs/ai-kb/00-index.md)
