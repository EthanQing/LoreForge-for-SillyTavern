# 已知陷阱

## Agent 工具消息不能拆分

OpenAI-compatible 消息中的 `tool` 必须紧跟声明对应 `tool_calls` 的 assistant 消息。Agent 上下文达到预算后，不能逐条截取尾部消息，否则可能保留工具结果却省略它的调用消息，导致接口返回 `Messages with role 'tool' must be a response to a preceding message with 'tool_calls'`。

`src/lib/agent/context.ts` 将带工具调用的 assistant 消息及其连续工具结果作为一个压缩组。调整上下文预算、历史恢复或消息转换时，应继续保持这个原子边界，并覆盖单次 assistant 并行调用多个工具的情况。
