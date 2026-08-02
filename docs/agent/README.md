# Codex 知识库

此目录记录供 Codex 与维护者协作使用的项目事实。当前源代码、测试、构建配置和 CI 配置是最高优先级；本文档用于路由与总结，发生冲突时以代码和配置为准。

## 阅读路由

- 修改模块边界、Tauri 调用或 Agent Studio：读 [architecture.md](architecture.md)。
- 修改角色卡、世界书、导入导出或提案行为：读 [domain.md](domain.md)。
- 查找源码、配置、生成目录或入口：读 [repository-map.md](repository-map.md)。
- 修改代码风格、状态更新或共享校验：读 [coding-conventions.md](coding-conventions.md)。
- 执行或补充测试、构建检查：读 [testing.md](testing.md)。
- 修改密钥、网络、权限、文件写入或发布：读 [security.md](security.md)。
- 记录新的长期取舍：读 [decisions/README.md](decisions/README.md)。

高频执行规则在仓库根目录的 [AGENTS.md](../../AGENTS.md)。

## 已确认的项目快照

- 桌面壳为 Tauri v2；前端为 React 19、TypeScript、Vite 与 Zustand；后端为 Rust 2021。
- 包管理器由 `package.json` 的 `packageManager` 字段指定为 pnpm 10.12.1。
- 默认产品表面是 Agent Studio，同时提供角色卡、世界书、资源、设置与导入导出界面。
- 前端测试使用 Vitest；Rust 单元测试位于 `src-tauri/src` 的模块内。

## 维护规则

- 只更新与变更相关的页面，避免无关的全量重写。
- 文档中的命令必须来自 `package.json`、Cargo manifest、CI 或其他可核验配置。
- 无法从仓库确认的事实用“待维护者确认”标记，不要补写猜测的架构或流程。
- 本次建立知识库时，旧 README 与 `docs/ai-kb/` 在工作区中已删除；本目录不依赖或链接这些文件。
