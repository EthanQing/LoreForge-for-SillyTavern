# 领域模型与数据流

## 角色卡与世界书

核心前端类型和 Zod schema 位于 `src/lib/schema.ts`：`CharacterCardV3`、卡片数据、`Lorebook`、`LorebookEntry`、资源和校验报告。schema 使用 passthrough 保留未知字段；编辑或迁移既有数据时不能无意丢失未知顶层字段或 `extensions` 字段。

世界书位于 `card.data.character_book`。条目显示顺序是数组顺序，`insertion_order` 是独立的领域字段，重排界面条目时不应重写它。编辑器使用 `comment` 作为条目标题/memo；导出兼容层在 `src/lib/lorebookCompat.ts` 处理 SillyTavern 字段映射。

## 卡片状态与持久化

Zustand store 维护当前卡片、文件路径/来源、工作区 ID、卡片 revision、dirty 状态、校验报告与本地草稿。`updateCard` 会更新时间、重新校验、保存草稿、标记 dirty 并递增 revision；`replaceCard`、`markSaved` 和 `applyAgentCard` 分别用于导入替换、保存后同步与确认提案后的写入。

草稿、草稿元数据、最近文件和非敏感 AI 设置保存在浏览器 localStorage。API key 不属于这些数据，见 [security.md](security.md)。

## 导入、导出与校验

前端通过 `src/lib/tauri.ts` 调用后端，`src/app/useProjectActions.ts` 统一处理打开、保存与导出。

- 支持打开 JSON、PNG/APNG 和 CHARX。
- JSON、PNG/APNG、CHARX 保存分别调用 Rust 的 `save_card_json`、`export_card_png`、`export_charx`。
- PNG 导出需要基础 PNG；没有可用主封面时，前端先提示选择封面图片，再显示导出保存路径，避免保存路径确认后再次弹出文件选择窗口。后端写入兼容的角色卡元数据，导出前执行迁移/规范化与校验。
- PNG 中的 `data.character_book` 是卡片内嵌 Lorebook。SillyTavern 导入角色后不会自动将它创建为已绑定世界书；用户需在角色面板的“更多”中执行“导入卡片世界书”。包含世界书的 PNG 导出完成后，前端应明确提示这一后续步骤。
- 前端和 Rust 都有校验与迁移逻辑。共享规则变更应保持两侧一致。

资源位于 `card.data.assets`。内联图片可用作编辑器预览和 PNG 导出基础，但导出元数据会做兼容性处理；保存返回后，前端使用 `keepEditorAssetsAfterMetadataExport()` 保留编辑器所需资源。

## Agent 提案与历史

Agent 只产生语义提案，不直接修改 Zustand 或文件。提案包括权限、语义变更和当前状态标识；世界书候选支持选择后一次性确认注入。Agent 不提供删除能力，手动删除仍是普通 editor/store 操作。

Agent 输入框输入 `@` 时会按标题、ID 和关键词列出当前卡片的世界书条目，并可滚动查看全部匹配项。方向键移动选项，`Tab` 确认，鼠标也可选择；确认后请求权限锁定到所选条目。带空格的标题使用引号编码，重名标题附带一基条目序号，由权限解析层再次校验后转换为具体条目权限。

会话、消息和提案通过 Rust 的 Agent history 命令写入 `agent_history.sqlite3`。仓库历史文档描述了旧历史库清理行为；其当前实现细节应以 `src-tauri/src/agent_history.rs` 为准。
