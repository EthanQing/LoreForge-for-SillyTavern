# Agent Prompt And Tool Contract

本文档描述 v0.3.0 的生产契约。旧 Guide/Edit 提示词、通用 JSON Patch、原始模型 JSON 解析和路径白名单不再存在。

## 设计目标

- 模型只能看到前端权限允许的卡片投影。
- 模型通过语义化工具表达意图，纯领域层负责校验和编译。
- 所有写入都先成为提案，并由用户确认。
- Agent 不能删除字段、开场白或世界书条目。
- 权限、revision 和条目指纹不能由模型选择或扩大。

## 系统提示词原则

运行时系统提示词应明确：

1. 先使用检查工具读取必要信息。
2. 只使用与目标匹配的编辑工具。
3. 不得声称已经修改卡片；工具只会创建待审核提案。
4. 不得要求或构造 `allowedPaths`、JSON Patch、删除操作或文件操作。
5. 默认使用简体中文总结，除非用户要求其他语言。
6. 世界书新内容必须作为候选生成；已有条目修改必须使用读取结果中的指纹。

前端会把权限信封附在用户消息中供 Controller 恢复，但消息渲染会隐藏该信封。信封只是前端状态载体，不是模型可编辑的工具参数。

## 权限模型

`AgentPermission` 由前端生成，包含 scope 和 capabilities：

- `card`
- `section`
- `field`
- `lorebook`
- `lorebookEntry`

capabilities 区分 `read`、`edit` 和 `inject`。单条目范围绑定索引、精确可编辑字段和当前指纹；字段范围只包含一个精确字段路径。未指定目标时必须显式使用整张卡片 preset。

## 检查工具

### inspect_card

无模型可控权限参数。返回当前 revision、权限描述和经过投影的卡片字段。图片、文件路径、密钥与未授权字段不会进入结果。

### inspect_lorebook_entry

读取权限范围内的一个世界书条目，返回索引、完整可用字段和稳定指纹。条目不在 scope 内时拒绝。

### inspect_validation

返回前端当前校验报告，不修改状态。

### inspect_token_usage

返回卡片或相关字段的 Token 估算，不修改状态。

## 编辑工具

### propose_card_edits

输入为 `edits[]`，每项只有受支持的语义路径和值。支持的根字段包括名称、描述、性格、场景、首条开场白、备用开场白、示例对话、创作者备注、系统提示词、历史后指令、标签、创作者和角色版本；精确备用开场白可使用带索引路径。

领域层拒绝空编辑、未知字段、错误值类型和权限范围外路径。

### propose_lorebook_entry_edits

输入包含条目索引、读取时获得的指纹和允许字段集合。字段可包括标题、关键词、次要关键词、内容、启用状态、正则、选择性触发、触发策略、注入位置、角色、深度、顺序、概率、优先级、大小写敏感和 outlet。

领域层拒绝空编辑、指纹不匹配、越权字段和无效范围。应用时基于现有条目浅层复制并保留未知字段与 `extensions`。

### propose_lorebook_injection

输入为候选数组。每个候选必须包含 `candidateId`、标题和内容，可包含：

- `keys`、`secondaryKeys`
- `enabled`、`useRegex`、`selective`
- `triggerStrategy`: `keyword`、`constant` 或 `vectorized`
- `insertionPosition`: SillyTavern 位置 0–7
- `role`: system/user/assistant 的 0/1/2
- `depth`、`insertionOrder`
- `probability`、`priority`
- `caseSensitive`、`outletName`

候选只暂存在提案中。用户勾选后，领域层验证所有选中候选，再一次性追加到当前世界书；不允许部分成功。

## 提案与应用

提案保存 schema version、workspace、session、tool call、权限、语义变更、差异、创建时 revision、完整卡片快照哈希、候选选择和状态。

确认应用顺序：

1. 状态必须为 pending。
2. 当前 workspace 与 revision 必须匹配。
3. 当前卡片稳定哈希必须匹配。
4. 所有语义变更重新经过权限和字段校验。
5. 世界书条目指纹必须匹配。
6. 所有选中候选必须有效且至少选择一个。
7. 编译完整新卡片并运行前端卡片校验。
8. 仅在全部通过后调用 store 的 `applyAgentCard`。

任何失败都不修改 Zustand、草稿、文件或 SQLite 卡片内容。

## UI 分发

主输入框、字段助手和世界书入口都调用 Agent Studio context：

- 主输入框解析 scope selector 与 `@` 目标。
- 字段助手生成精确 field 或 lorebookEntry 权限，并直接发送到当前 Controller。
- 世界书入口只预设 lorebook scope 并聚焦输入框，仍由用户填写指令。

不得在字段组件内创建临时 Controller、局部预览或直接调用字段 setter 写入 Agent 结果。

## CardForge 参考边界

交互借鉴 CardForge 的集中卡片状态、AI 候选暂存和勾选批量注入概念，但实现使用本项目自己的权限、语义编译、revision/指纹冲突与原子确认流程，不复制 GPL-3.0 源码。
