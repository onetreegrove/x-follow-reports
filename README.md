# X Follow Report Browser

X Follow Report Browser 是一个用于浏览 X/Twitter 关注流报告的本地 Web 应用。它把已经生成好的 Markdown 报告整理成按月份、日期和早/午/晚报分类的阅读界面，方便快速回看每天关注列表里的 AI 开发者动态、工具发布、行业观察和相关链接。

## 项目用途

这个项目适合用来管理和阅读由 X 关注时间线生成的日报素材。报告以 Markdown 文件形式保存在本地，应用启动后会自动扫描报告目录，提取标题、生成时间、覆盖时间、来源、摘要和资讯数量，并在浏览器里提供一个更适合长期阅读与检索的界面。

主要能力包括：

- 按 `年-月 / 日期 / 早报、午报、晚报` 组织历史报告。
- 支持搜索报告标题、摘要、路径、来源和覆盖时间。
- 支持按早报、午报、晚报快速筛选。
- 使用 Markdown 渲染报告正文，并对 HTML 输出做安全清理。
- 提供本地 API，可读取报告列表、报告详情，也可通过 Token 上传新报告。
- 支持开发模式前后端联动，也支持构建后由同一个本地服务托管静态页面和 API。

## 技术栈

- Vue 3 + TypeScript：前端报告浏览界面。
- Vite：前端开发服务器和构建工具。
- Node.js HTTP Server：本地报告 API 与静态文件服务。
- Markdown-it + sanitize-html：Markdown 渲染和 HTML 清理。
- Vitest：单元测试。
- pnpm workspace：工作区脚本管理。

## 目录结构

```text
.
├── web/
│   ├── src/                 # Vue 前端源码
│   ├── server/              # 本地报告 API 服务
│   ├── index.html
│   └── package.json
├── .x-follow-report/
│   └── report-outputs/      # 默认报告输出目录
├── package.json             # 根工作区脚本
└── pnpm-workspace.yaml
```

报告文件默认放在：

```text
.x-follow-report/report-outputs/YYYY-MM/DD/HHmmss-早报.md
.x-follow-report/report-outputs/YYYY-MM/DD/HHmmss-午报.md
.x-follow-report/report-outputs/YYYY-MM/DD/HHmmss-晚报.md
```

例如：

```text
.x-follow-report/report-outputs/2026-05/22/141141-晚报.md
```

## 安装依赖

项目使用 pnpm：

```bash
pnpm install
```

建议使用 Node.js 22 或较新的 LTS 版本。

## 本地开发

启动前端和 API：

```bash
pnpm dev
```

开发模式会同时启动：

- API 服务：`http://127.0.0.1:8787`
- Vite 前端服务：通常为 `http://127.0.0.1:5173`

前端开发服务器会把 `/api` 请求代理到本地 API 服务。

也可以分别启动：

```bash
pnpm dev:api
pnpm dev:web
```

## 使用方式

1. 将报告 Markdown 文件放入报告目录：

   ```text
   .x-follow-report/report-outputs/YYYY-MM/DD/
   ```

2. 启动应用：

   ```bash
   pnpm dev
   ```

3. 在浏览器打开 Vite 输出的本地地址。

4. 在左侧按月份、日期和报告类型选择报告。

5. 使用顶部搜索框检索标题、摘要、账号来源或覆盖时间。

6. 点击 `早报`、`午报`、`晚报` 按钮筛选报告类型。

7. 点击 `刷新` 重新读取本地报告目录。

## 环境变量

API 服务支持以下环境变量：

| 变量名 | 说明 | 默认值 |
| --- | --- | --- |
| `PORT` | API 服务端口 | `8787` |
| `REPORT_ROOT` | 报告 Markdown 根目录 | 自动选择 `.x-follow-report/report-outputs` |
| `REPORT_UPLOAD_TOKEN` | 上传报告接口的鉴权 Token | 未配置时禁用上传 |

如果没有设置 `REPORT_ROOT`，服务会优先查找当前目录上一级的 `.x-follow-report/report-outputs`，不存在时使用当前工作目录下的 `.x-follow-report/report-outputs`。

## API 简介

### 获取报告列表

```http
GET /api/reports
```

返回按生成时间倒序排列的报告摘要。

### 获取报告详情

```http
GET /api/reports/:id
```

返回单篇报告摘要和完整 Markdown 正文。

### 上传报告

```http
POST /api/reports
X-Report-Token: <REPORT_UPLOAD_TOKEN>
Content-Type: application/json
```

请求体示例：

```json
{
  "kind": "晚报",
  "generatedAt": "2026-05-22T06:11:41.000Z",
  "content": "# AI 开发者晚报\n\n生成时间：2026-05-22 14:11:41\n\n正文...",
  "overwrite": false
}
```

上传成功后，服务会根据生成时间和报告类型写入对应日期目录。如果同一天已经存在同类型报告，新报告发布成功后会清理当天旧的同类型报告。

## 构建与预览

构建生产版本：

```bash
pnpm build
```

构建产物位于：

```text
web/dist/
```

构建后可以启动 API 服务托管静态页面和接口：

```bash
pnpm dev:api
```

然后打开：

```text
http://127.0.0.1:8787
```

## 测试

运行测试：

```bash
pnpm test
```

监听模式：

```bash
pnpm test:watch
```

## 报告 Markdown 格式建议

应用会从 Markdown 中自动提取部分元信息。推荐报告包含以下字段：

```markdown
# AI 开发者晚报

生成时间：2026-05-22 14:11:41
来源：X 关注时间线
覆盖时间：2026-05-21 14:11 - 2026-05-22 14:11

## 今日要点

- 要点一
- 要点二

## 资讯

### 标题

正文内容...
```

其中标题、生成时间、覆盖时间、来源和资讯条数会用于列表展示、搜索和阅读元信息。
