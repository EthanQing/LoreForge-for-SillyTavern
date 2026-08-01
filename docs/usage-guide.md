# SillyTavern Card Creator 使用指南

本指南对应 v0.2.0。应用启动后默认进入 Agent Studio；传统卡片编辑、导入导出和保存能力在右侧编辑台继续可用。

## 启动

开发环境需要 Node.js 22.19.0、pnpm、Rust 和 Tauri v2 依赖。

    pnpm install
    pnpm tauri dev

只调试前端时运行 pnpm dev。Windows PowerShell 若拦截 pnpm.ps1，可使用 pnpm.cmd。

## Agent Studio 布局

- 左栏显示当前卡片、卡片级会话、新建会话和旧版只读档案，并提供资源、预览和设置入口。
- 中栏是统一 Agent 对话。一次用户请求只显示一个用户气泡和一个 Agent 气泡；Agent 通过 SSE 增量流式更新，读取工具轨迹、提案 diff 和运行状态收纳在同一时间线中。
- 工具轨迹默认折叠，展开后可查看格式化结果。消息历史只允许纵向滚动，长路径、JSON 和长文本会在气泡内换行，不会把主区撑出横向滚动条。
- 右栏默认显示 CCv3 索引、待审核提案、校验和 Token 状态。打开索引项后，右栏扩展为编辑台。

宽屏显示三栏；中等宽度会折叠左栏；较窄窗口把编辑台改为带焦点管理的覆盖层。分隔器可用键盘操作，Escape 可关闭覆盖层，系统 reduced-motion 设置会减少动画。

右侧编辑台默认宽度为 560px，可拖动左侧分隔器或聚焦分隔器后使用左右方向键调整到 420–720px。设置页在编辑台内按区块纵向排列；预览和项目操作会根据可用宽度自动改为单列，避免字段、按钮和长路径被截断。编辑台打开时，窄窗口会显示可点击的遮罩，关闭后焦点返回原来的入口。

## 创建或打开卡片

使用资源与文件入口新建空白卡片，或导入 JSON、PNG/APNG、CHARX。新建或导入时会生成 workspace ID；打开已有文件会按规范化绝对路径恢复工作区和会话。Save As 保留当前工作区，仅更新绑定路径。

卡片仍支持基础信息、提示词、开场白、世界书、资源、预览、Token 统计和校验。编辑器会保留 CCv3 未知字段，导出流程沿用原有 JSON、PNG/APNG 和 CHARX 兼容处理。

## 使用 Agent

在中栏输入自然语言请求。Agent 只拥有以下卡片领域工具：

- inspect_card：读取 overview、basic、prompts、greetings 或 worldbook 范围的 normalized card，不返回内嵌图片和原始未知字段。
- inspect_lorebook_entry：按 ID、序号或标题读取一个世界书条目。
- inspect_validation：读取前端校验报告。
- inspect_token_usage：读取 Token 统计和 prompt preview 摘要。
- propose_card_changes：提交摘要和 AiPatch[]，创建待审核提案，不直接修改卡片。

提案生成前必须读取当前 cardRevision，工具执行层还会复核 @ 目标、排除路径和字段范围。用户点击确认后，应用层重新执行路径过滤、类型校验和 patch：

- 未涉及路径发生变化时可以合并。
- 任一受影响路径发生变化时标记为冲突，不能强制覆盖；请重新读取卡片再生成提案。
- 新卡存在阻塞校验错误时保持 pending。
- 应用后绑定文件沿用现有静默保存；保存失败不会回滚内存卡片，会保留 dirty 状态并记录失败。

停止按钮会调用 Agent abort 并取消 Rust 网络请求。生成期间再次发送会 steering 当前轮次；完成后继续使用 follow-up。Ctrl/Cmd+Enter 发送消息。

## AI 设置与凭据

设置中支持 DeepSeek 和 OpenAI-compatible Chat Completions。填写 base URL、模型、上下文窗口、最大输出、温度和超时；工具调用探针会记录 supported、unsupported 或 unknown。

API key 只在输入和首次迁移期间存在于内存。保存后写入系统凭据库并从设置 JSON 删除；旧版本 localStorage 中的 key 只尝试迁移一次，迁移失败会显示阻塞性提示，不会静默回退到明文文件。

远程地址默认要求 HTTPS，HTTP 仅允许 loopback；局域网 HTTP 必须显式开启不安全 HTTP。WebView 不直接连接模型域名，模型请求统一经过 Rust 代理。请求和响应头、体大小及重定向范围都有限制。

## 历史与会话

每个 workspace 的 Agent 会话和提案保存在 Rust SQLite 表中。完整消息在 message_end 时追加，工具调用和结果不会通过 debounce 重写整段历史。启动时会将没有 toolResult 的中断调用补成“上次运行中断”的错误结果。

旧 sessions/messages 表执行幂等迁移。没有 workspace 的旧 Guide/Edit 记录标记为未绑定、只读档案；复制到当前卡片会建立新会话。旧 pending preview 只能重新生成，不能直接应用。

## 保存、导出与回归

顶部保存按钮、项目保存入口、Ctrl/Cmd+S 和右键菜单共用同一保存逻辑。已绑定 JSON、PNG/APNG 或 CHARX 会写回原路径；未绑定草稿会打开保存对话框。

提交前建议运行：

    pnpm test
    pnpm build
    cargo test --manifest-path src-tauri/Cargo.toml

完整 Windows 安装包使用 pnpm tauri build。发布流程要求使用 SemVer tag，并通过系统 keyring 保存签名和 AI 凭据，不要将任何 API key 提交到仓库。
