# 安全边界

## 密钥与网络

- API key 通过 Rust 的 keyring 命令进入操作系统凭据库。前端加载 AI 设置时会清空 `apiKey`，非敏感设置才写入 localStorage。
- 不要将密钥写入源码、角色卡、localStorage、Agent history SQLite、日志、事件、错误信息或测试夹具。
- AI 请求经 `src-tauri/src/ai.rs` 的后端 HTTP/SSE 路径发起；URL 与凭据策略的最终实现以该模块为准。
- Tauri CSP 定义在 `src-tauri/tauri.conf.json`，修改前应评估 IPC、资源图片与网络连接需求。

## Agent 写入边界

- 前端在运行前构造 `AgentPermission`；模型工具不可接受可扩大范围的权限参数。
- `@` 候选的页面上下文是权限上限：世界书页只能产生世界书条目或条目集合权限，开场白页只能产生首条/备用开场白字段权限，卡片纲要页才允许卡片范围内全部当前契约对象。候选菜单关闭、切换下拉框或手工输入 token 都不能扩大页面上限。
- 单个字段、开场白或世界书条目 mention 使用精确 `read/edit` 权限；多个具体对象使用 `targets` 集合并分别过滤投影、校验和 Token 明细，不继承 `card`/`worldbook` 的 `inject` 能力。
- 模型只能提出类型化语义变更。应用前重新验证工作区、revision、卡片哈希、条目指纹、权限与卡片校验结果。
- 用户确认是 Agent 写入卡片的必要条件；世界书候选选择须整批验证，不能部分写入。

## 文件与发布

- Rust 文件命令处理用户选择的 JSON、PNG/APNG 与 CHARX 路径。变更文件读写、归档或 PNG 解析时应保持现有验证和错误处理路径。
- `.secrets/` 已被忽略，不能加入版本控制。
- GitHub Release 使用 `TAURI_SIGNING_PRIVATE_KEY` 和 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secrets。仅公钥和 updater endpoint 位于 Tauri 配置中；私钥不得提交或输出。

## 待维护者确认

- 尚未确认生产部署是否还存在 GitHub Actions 以外的密钥轮换、泄露响应或发布审批流程。
- 尚未确认应用数据目录、SQLite 文件和系统凭据条目的运维备份/清除要求。
- 尚未确认是否有额外的安全扫描、依赖审计或漏洞响应自动化。
