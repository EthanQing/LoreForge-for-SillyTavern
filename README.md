# SillyTavern 角色卡制作器

一个本地优先的 SillyTavern CCv3 角色卡编辑器，基于 Tauri v2、React、Vite、TypeScript 和 Rust 构建。它适合用来创建、清理、校验和导出 SillyTavern 角色卡，并提供 AI 辅助编辑能力。

## 特性

- **本地优先编辑**：角色卡草稿保存在本地，最近打开记录也保存在本机。
- **CCv3 兼容**：支持创建空白 V3 角色卡，并迁移旧版 V1/V2 数据到 V3 结构。
- **完整编辑面板**：覆盖基础信息、提示词、开场白、世界书、资源、预览和校验等常用区域。
- **导入与导出**：支持 JSON、带角色卡元数据的 PNG/APNG，以及 CHARX 归档格式。
- **世界书兼容增强**：支持 SillyTavern 世界书条目的标题/备忘录、触发词、插入顺序、常驻/选择性触发和常见高级设置。
- **数据保护**：尽量保留未知字段，降低导入、清理、再导出时丢失兼容字段的风险。
- **校验与预览**：前端和 Rust 后端都包含角色卡校验逻辑，并提供提示词预览与 token 估算辅助。
- **AI 辅助编辑**：支持 OpenAI 兼容接口，例如 DeepSeek；可配置 Base URL、API Key、模型、流式输出和推理强度。
- **AI 对话抽屉**：支持普通问答和结构化编辑模式，可对当前角色卡生成补丁、预览 JSON 变更后再确认应用。
- **快捷工作流**：在 AI 编辑模式中可通过底部 `+` 菜单或 `/` 命令运行角色卡体检、一键补全、资料提取、一致性修复、Token 优化、世界书构建和导入清洗。

## 如何使用

1. 打开应用后，可以从「项目」页新建角色卡，或导入已有的 JSON、PNG/APNG、CHARX 文件。
2. 在左侧导航中切换编辑区域：
   - 「基础」填写名称、作者、标签、版本等信息。
   - 「提示词」编辑角色描述、性格、场景、示例对话、系统提示词等内容。
   - 「开场白」编辑首条消息和备用开场白。
   - 「世界书」维护条目标题/备忘录、触发词、正文和高级设置。
   - 「资源」管理封面或其它资源引用。
   - 「预览」检查角色卡的整体数据。
   - 「校验」查看错误和警告。
3. 修改会自动保存到本地草稿。导出前建议先查看「校验」页，确认没有阻塞性错误。
4. 使用「项目」页导出：
   - JSON：导出标准角色卡 JSON。
   - PNG/APNG：写入 `ccv3` 元数据，并保留可选旧版 `chara` 兼容元数据。
   - CHARX：导出包含 `card.json` 的归档包。
5. 如需使用 AI：
   - 进入「设置」页，填写 AI 服务地址、API Key 和模型。
   - 使用连接测试确认配置可用。
   - 打开顶部 AI 对话按钮，选择普通模式或编辑模式。
   - 编辑模式会先展示 AI 输出 JSON 和应用后的 JSON，确认后才写入角色卡。

## 本地开发

### 环境要求

- Node.js 18 或更高版本。
- pnpm。项目声明的包管理器为 `pnpm@10.12.1`。
- Rust 工具链。
- Tauri v2 所需的系统依赖。不同平台的依赖可参考 Tauri 官方文档。

如果系统里没有 pnpm，可以先启用 Corepack：

```bash
corepack enable
corepack pnpm install
```

如果已经有 pnpm：

```bash
pnpm install
```

### 启动前端开发服务器

```bash
pnpm dev
```

Vite 会在 `http://127.0.0.1:1420` 启动前端。

### 启动 Tauri 桌面应用

```bash
pnpm tauri dev
```

该命令会启动 Vite，并打开 Tauri 桌面窗口。

## 本地构建

### 构建前端

```bash
pnpm build
```

构建产物会输出到 `dist/`。

### 构建桌面应用

```bash
pnpm tauri build
```

Tauri 会先执行前端构建，再打包桌面应用。打包产物位于 `src-tauri/target/` 下的对应平台目录。

## 测试

运行前端和 TypeScript 测试：

```bash
pnpm test
```

运行 Rust 后端测试：

```bash
cd src-tauri
cargo test
```

也可以在项目根目录运行前端类型检查与构建：

```bash
pnpm build
```

## Windows Rust 工具链注意事项

如果使用 Windows GNU Rust 工具链，`cargo test` 和 `pnpm tauri build` 可能需要 GNU binutils，例如 `dlltool.exe`。如果缺少这些工具，可以安装对应 binutils，或改用 MSVC Rust 工具链。

## 技术栈

- Tauri v2
- React 19
- Vite 6
- TypeScript
- Rust
- Zustand
- Zod

