# 已知陷阱

## Agent 工具消息不能拆分

OpenAI-compatible 消息中的 `tool` 必须紧跟声明对应 `tool_calls` 的 assistant 消息。Agent 上下文达到预算后，不能逐条截取尾部消息，否则可能保留工具结果却省略它的调用消息，导致接口返回 `Messages with role 'tool' must be a response to a preceding message with 'tool_calls'`。

`src/lib/agent/context.ts` 将带工具调用的 assistant 消息及其连续工具结果作为一个压缩组。调整上下文预算、历史恢复或消息转换时，应继续保持这个原子边界，并覆盖单次 assistant 并行调用多个工具的情况。

## 编辑台响应式断点看容器宽度

Agent 编辑台在桌面端可以独立调整宽度，窗口较宽不代表编辑页面也有足够空间。编辑台内部的表单列数、工具栏和摘要布局应使用命名为 `agent-inspector` 的 CSS container query；仅使用 viewport media query 会在窄编辑台中保留桌面布局并造成内容裁切。

## Agent 条目 mention 不是普通单词

世界书标题可能包含空格、标点或重复值，不能只用 `@` 后的首个无空格单词解析。自动补全插入带引号的标题；重名项额外携带一基数组序号。候选项不得在数据层截断，应由可滚动列表承载全部匹配结果。多个 mention 必须全部解析为条目集合权限，不能只保留第一个或最后一个；发送时也要保留原始文本，避免聊天记录与实际授权范围脱节。权限解析仍需对当前卡片重新核对标题或 ID，不能直接信任界面生成的序号。
