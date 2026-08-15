# 0001：OpenAI Codex OAuth 后端边界

## 状态

已接受

## 背景

Agent Studio 需要支持使用 ChatGPT 订阅访问 OpenAI Codex 模型。通用 OpenAI Platform API 使用 API key；ChatGPT 登录属于 Codex 客户端专用认证。应用是 Tauri WebView，不能让真实 OAuth token 进入前端，也不应为此新增必须随桌面应用分发的 Node sidecar。

项目固定使用的 Pi AI 版本已实现 `openai-codex-responses` 模型协议与事件解析，并定义了浏览器 PKCE、设备码登录端点和客户端标识。Rust 后端已有系统凭据库与 AI HTTP/SSE 代理边界。

## 决策

- 使用 ChatGPT Codex OAuth，不把它描述为通用 OpenAI API OAuth。浏览器 PKCE + `http://localhost:1455/auth/callback` 是默认流程；浏览器回调端口不可用时才回退到设备码流程。
- Rust 执行授权 URL 生成、本地回调、设备码申请/轮询、token exchange、系统凭据存储与自动刷新；前端只接收授权 URL 或一次性 user code，不接收真实令牌。
- Pi AI 继续在前端执行 Codex Responses 请求构造与流解析，但收到的只是可解析且不可认证的占位 JWT。Rust 删除前端认证头，并从系统凭据库注入真实 access token 和 account id。
- `openai-codex` 固定使用 `https://chatgpt.com/backend-api/codex/responses`，不允许自定义 endpoint 或 insecure HTTP。
- 保留 DeepSeek 与 OpenAI-compatible API key provider，作为独立认证和计费路径。

## 后果

真实 OAuth token 不进入 WebView、卡片、Agent history 或 localStorage，且 refresh token 旋转由后端串行处理。桌面包不增加 Node 运行时或 sidecar。

该能力依赖固定 Pi AI 版本所支持的 Codex 客户端协议；升级 Pi AI 时必须复核浏览器/设备码端点、客户端标识、回调端口、模型目录、Responses 路径和认证头。真实登录应使用具备相应 Codex 权限的 ChatGPT 账户验收；设备码回退还要求账户在 ChatGPT 安全设置中启用设备码登录。
