# 架构

## 总体结构

应用是本地优先的桌面角色卡编辑器。`src/main.tsx` 挂载 React 应用，`src/app/App.tsx` 提供应用壳和 Agent Studio 主界面；`src-tauri/src/main.rs` 调用库中的 `run()`，由 `src-tauri/src/lib.rs` 注册 Tauri 插件和命令。

```text
React UI
  -> Zustand store / 前端领域工具
  -> Tauri invoke、dialog 与 updater API
  -> Rust commands
  -> 本地文件、SQLite、系统凭据库、AI HTTP/SSE
```

## 前端边界

- `src/app/`：应用壳、全局 Zustand 卡片状态、项目打开/保存/导出操作与全局样式。
- `src/components/`：跨功能区复用的表单、编辑器、错误边界和展示组件。
- `src/features/`：按用户界面划分的角色卡编辑、世界书、资源、设置、导入导出和 Agent Studio。
- `src/lib/`：CCv3 schema、迁移、校验、资源处理、Token 统计、国际化、更新和 Tauri 包装。
- `src/lib/agent/`：权限、受限投影、模型工具、语义变更、提案契约、会话编排、持久化和显示辅助。

`src/app/store.ts` 是当前卡片、工作区、revision、dirty 状态、草稿、校验结果、最近文件与 AI 设置的规范状态源。UI 与确认后的 Agent 变更均通过 store action 更新。

## Agent Studio 边界

`src/features/agent-studio/AgentStudio.tsx` 持有共享的 Agent 会话编排；字段助手与世界书入口通过 `src/lib/agent/uiContext.tsx` 进入相同会话和提案队列。运行时链路为：前端根据用户选择生成 `AgentPermission`，控制器调用 Pi Agent Core/Pi AI，模型通过类型化 inspect/propose 工具创建内存提案，用户审阅并确认后才由 store 写入卡片。

模型不能从工具输入扩大权限。提案应用会检查工作区、卡片 revision、卡片哈希以及（适用时）世界书条目指纹，再重新编译与校验语义变更。

长会话在发送给模型前由 `src/lib/agent/context.ts` 压缩。带工具调用的 assistant 消息与其连续工具结果必须作为整体保留或整体省略，避免向 OpenAI-compatible 接口发送孤立的 `tool` 消息。

Agent 编辑台支持桌面拖拽调整宽度和窄屏抽屉。编辑台内需要随可用栏宽变化的页面使用 `agent-inspector` CSS container query，不能只依赖窗口级 media query。

### 编辑台导航层级

左侧工作区导航的“项目文件”负责打开、保存、导入和导出角色卡文件，“预览”用于查看当前卡片的只读展示效果；右侧“卡片纲要”提供 CCv3 字段编辑入口，并提供进入“预览”的快捷入口。“卡片资源”只编辑当前卡片的 `card.data.assets`。两者属于不同导航层级，新增入口时不要再使用不带范围说明的“资源”作为工作区文件入口。

当前卡片的保存动作与应用主题切换属于侧栏中的常驻应用操作；桌面布局不依赖独立顶栏，窄屏侧栏收缩为图标后仍保留这两个入口。

卡片纲要首页按“编辑卡片 → 预览效果 → 卡片状态”分区呈现；卡片状态同时提供校验摘要与 Token 统计入口，入口应保持完整点击区域，并继续沿用现有编辑台的焦点管理与容器查询响应式约束。

### 校验报告与定位

`src/features/card-editor/ValidationPanel.tsx` 使用 store 中的前端校验报告，并可按需显示 Rust 复检结果。`src/lib/validationIssueNavigation.ts` 将 `ValidationIssue.path` 路由到基础信息、提示词、开场白、世界书或资源编辑台；编辑器通过 `data-validation-path` 提供精确目标，世界书条目在定位时先展开懒挂载内容。找不到精确字段时只能降级到最近的父级位置或保留在校验面板，不制造虚假焦点。

校验面板的 Agent 操作把报告作为诊断数据发送到当前 Agent 会话，要求先调用 `inspect_validation`，再按问题路径读取必要字段。单项问题使用最窄的字段/世界书条目权限，不支持直接提案的 spec、资源、扩展和未知路径使用只读权限；所有可写处理仍必须经过现有语义化提案和用户确认流程。

## Rust 后端边界

- `commands.rs`：JSON、PNG/APNG、CHARX 的打开、保存、导入、导出与校验命令。
- `card_schema.rs`、`migration.rs`、`validation.rs`：Rust 侧数据结构、格式迁移、导出准备与校验。
- `png_card.rs`、`charx.rs`：PNG 元数据和 CHARX 归档处理。
- `ai.rs`：AI HTTP/SSE 代理、取消、模型列表与凭据命令。
- `agent_history.rs`：Agent 工作区、会话、条目和提案的 SQLite 持久化。

`src-tauri/tauri.conf.json` 将 Tauri 开发流程连接到 `pnpm dev`，并将生产前端资源目录指定为 `../dist`。
