# X Follow 历史报告浏览器设计

## 目标

基于 `x-follow-report` skill 生成的历史 Markdown 报告，构建一个本地优先的 Web 项目，方便浏览、搜索和阅读历史报告，同时预留稳定的上传发布接口，供后续 skill 自动发布新报告。

第一版要解决两个问题：

1. 让当前 `YYYY-MM/DD/*.md` 目录结构下的历史报告变得好找、好读。
2. 让 skill 可以通过一个带 Token 鉴权的 HTTP 接口上传报告并发布。

## 选定方案

采用单仓库结构：

- 前端使用 `Vue 3 + TypeScript + Vite + pnpm`。
- 后端使用轻量 Node TypeScript API 服务，负责报告索引、读取和发布。
- 报告文件继续沿用现有根目录存储规范：`YYYY-MM/DD/HHMMSS-早|午|晚报.md`。

这个方案能先把本地体验做出来，同时 API 路由、数据结构和落盘规则都按后续服务端部署来设计，避免之后重做。

## 产品体验

主界面采用“日期侧栏 + 阅读器”布局。

左侧侧栏按月份和日期组织报告，支持按 `早报`、`午报`、`晚报` 过滤。右侧主阅读区展示当前选中的报告，包括标题、生成时间、覆盖时间、来源、原始路径和渲染后的 Markdown 正文。顶部提供搜索框，用于按标题、正文、报告类型和元信息过滤报告。

第一版核心流程：

1. 打开应用后默认选中最新报告。
2. 通过报告类型或关键词过滤历史内容。
3. 点击旧报告时保持在同一个阅读上下文内切换。
4. 本地文件变化后可以刷新索引。
5. skill 调用上传接口发布新报告后，刷新列表即可看到新报告。

界面应该像一个紧凑的阅读工具，而不是营销页。优先保证中文长文阅读舒适、列表可扫描、布局稳定，不做装饰性页面。

## 数据模型

API 对外暴露标准化报告摘要：

```ts
export type ReportKind = "早报" | "午报" | "晚报" | "未知";

export type ReportSummary = {
  id: string;
  title: string;
  kind: ReportKind;
  date: string;
  generatedAt?: string;
  period?: string;
  source?: string;
  path: string;
  excerpt: string;
  itemCount?: number;
  createdAtMs: number;
};
```

报告详情包含完整 Markdown：

```ts
export type ReportDetail = ReportSummary & {
  markdown: string;
};
```

`id` 由报告相对路径生成，并使用 URL 安全编码。服务端不接受客户端传入任意绝对路径。

## API 约定

### `GET /api/reports`

返回报告列表：

```ts
{
  reports: ReportSummary[];
}
```

排序规则：优先按路径中的时间戳倒序排列；无法从路径解析时间时，使用文件修改时间作为兜底。

### `GET /api/reports/:id`

返回单篇报告详情：

```ts
{
  report: ReportDetail;
}
```

如果 `id` 无法解析到已知报告，返回 `404`。

### `POST /api/reports`

发布新报告。请求必须包含：

```http
X-Report-Token: <REPORT_UPLOAD_TOKEN>
Content-Type: application/json
```

请求体：

```ts
{
  title?: string;
  kind?: "早报" | "午报" | "晚报";
  generatedAt?: string;
  path?: string;
  content: string;
  overwrite?: boolean;
}
```

规则：

- 如果 `REPORT_UPLOAD_TOKEN` 未配置，禁用发布接口并返回 `503`。
- 如果 Token 缺失或不正确，返回 `401`。
- 如果 `content` 为空，返回 `400`。
- 如果未传 `path`，根据 `generatedAt` 或服务端当前时间生成 `YYYY-MM/DD/HHMMSS-早|午|晚报.md`。
- 如果传入 `path`，只接受匹配 `YYYY-MM/DD/<filename>.md` 的相对报告路径。
- 如果目标文件已存在，默认拒绝覆盖；只有传入 `overwrite: true` 时才覆盖。
- 写入前自动创建父目录。
- 写入成功后重新索引，并返回报告摘要和前端访问地址。

响应：

```ts
{
  report: ReportSummary;
  url: string;
}
```

## 报告解析

服务端以保守方式解析已有 Markdown：

- `# ...` 解析为标题。
- `生成时间：...` 解析为 `generatedAt`。
- `覆盖时间：...` 解析为 `period`。
- `来源：...` 解析为 `source`。
- 报告类型优先从文件名推断，其次从标题推断。
- 摘要优先取 `今日要点` 内容；如果没有，则取第一段非元信息正文。
- `itemCount` 根据二级或三级资讯标题估算。

如果某个文件部分解析失败，仍然应该出现在归档列表中，并使用兜底元信息。

## 前端结构

建议文件：

- `src/main.ts`
- `src/App.vue`
- `src/api/reports.ts`
- `src/types/report.ts`
- `src/components/ReportShell.vue`
- `src/components/ReportSidebar.vue`
- `src/components/ReportReader.vue`
- `src/components/ReportToolbar.vue`
- `src/styles.css`

前端状态保持简单：

- 报告列表
- 当前选中的报告 id
- 搜索关键词
- 已选报告类型
- 加载和错误状态

Markdown 渲染使用维护良好的解析库，并采用适合消毒处理的渲染方式。报告中的外部链接默认在新标签页打开。

## 后端结构

建议文件：

- `server/index.ts`
- `server/reportIndex.ts`
- `server/reportParser.ts`
- `server/reportPaths.ts`
- `server/types.ts`

职责划分：

- `index.ts`：HTTP 路由、静态前端服务、JSON 响应。
- `reportIndex.ts`：扫描报告文件、缓存摘要、读取详情。
- `reportParser.ts`：从 Markdown 中提取元信息。
- `reportPaths.ts`：校验 id 和上传路径，防止路径穿越。
- `types.ts`：后端共享类型。

## 配置

使用环境变量：

- `REPORT_ROOT`：可选，报告根目录，默认项目根目录。
- `REPORT_UPLOAD_TOKEN`：`POST /api/reports` 所需 Token。
- `PORT`：API 服务端口。

本地开发时，Vite 将 `/api` 代理到 Node API 服务。

建议脚本：

- `pnpm dev`：同时运行 API 服务和 Vite 前端。
- `pnpm dev:api`：只运行 API 服务。
- `pnpm dev:web`：只运行 Vite 前端。
- `pnpm build`：类型检查并构建前端。
- `pnpm test`：运行后端和前端单元测试。

## 错误处理

前端：

- 没有报告时展示空状态。
- API 无法访问时展示紧凑错误提示。
- 刷新列表失败时保留当前已打开报告。

后端：

- 错误统一返回 `{ error: { code, message } }`。
- 不向客户端返回堆栈信息。
- 单个文件解析失败时记录路径，但继续索引其他报告。
- 拒绝路径穿越和非法上传路径。

## 测试

后端重点测试：

- 路径校验能拒绝路径穿越和绝对路径。
- 报告解析器能提取标题、类型、生成时间、来源和摘要。
- 索引器能发现现有 `YYYY-MM/DD/*.md` 报告。
- 上传路径生成符合预期。
- 上传接口能拒绝缺失或错误 Token。

前端第一版轻量测试：

- API client 能处理列表和详情响应。
- 类型过滤和搜索过滤行为正确。

手动验证：

- 启动 API 和 Vite 前端。
- 在浏览器打开应用。
- 确认最新历史报告能正常渲染。
- 使用 `X-Report-Token` 发布一篇样例报告。
- 刷新后确认新报告出现在列表中。

## 非目标

- 完整用户登录系统。
- 数据库存储。
- 多用户协作编辑。
- 报告写作 UI。
- 重写 `x-follow-report` 生成流程。
- 导入报告目录规范之外的任意 Markdown 文件。

