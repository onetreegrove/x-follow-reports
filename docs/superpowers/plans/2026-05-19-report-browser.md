# X Follow 历史报告浏览器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 `Vue 3 + TypeScript + pnpm` 的本地优先报告浏览器，并提供带 Token 鉴权的报告上传发布 API。

**Architecture:** 前端由 Vite/Vue 提供“日期侧栏 + 阅读器”单页应用；后端由轻量 Node TypeScript 服务提供 `/api/reports` 列表、详情和发布接口。报告继续存储在项目根目录的 `YYYY-MM/DD/HHMMSS-早|午|晚报.md` 路径中，后端负责索引、解析、路径安全和写入。

**Tech Stack:** pnpm, TypeScript, Vue 3, Vite, Vitest, Node HTTP server, markdown-it, sanitize-html, concurrently, tsx.

---

## 文件结构

- Create `package.json`：项目脚本和依赖声明。
- Create `pnpm-workspace.yaml`：单包 workspace，方便以后拆包。
- Create `tsconfig.json`：共享 TypeScript 配置。
- Create `vite.config.ts`：Vue/Vite 配置和 `/api` 开发代理。
- Create `index.html`：Vite 入口 HTML。
- Create `src/main.ts`：挂载 Vue 应用。
- Create `src/App.vue`：组合应用壳、数据加载、选择状态、过滤状态。
- Create `src/styles.css`：全局布局、阅读排版和响应式样式。
- Create `src/types/report.ts`：前端共享报告类型。
- Create `src/api/reports.ts`：前端 API client。
- Create `src/components/ReportToolbar.vue`：搜索、类型过滤、刷新状态。
- Create `src/components/ReportSidebar.vue`：按月份/日期分组的报告列表。
- Create `src/components/ReportReader.vue`：报告详情、元信息和渲染后的 Markdown。
- Create `server/types.ts`：后端共享类型。
- Create `server/reportPaths.ts`：报告路径、id、时间戳和上传路径校验。
- Create `server/reportParser.ts`：Markdown 元信息解析。
- Create `server/reportIndex.ts`：扫描、缓存、详情读取和报告写入。
- Create `server/index.ts`：HTTP API、Token 鉴权、静态前端服务。
- Create `server/reportPaths.test.ts`：路径安全和路径生成测试。
- Create `server/reportParser.test.ts`：报告解析测试。
- Create `server/reportIndex.test.ts`：索引和写入测试。
- Create `src/api/reports.test.ts`：前端 API client 测试。
- Create `src/reportFilters.test.ts`：前端搜索和类型过滤测试。
- Create `src/reportFilters.ts`：可单测的过滤函数。
- Modify `docs/superpowers/specs/2026-05-19-report-browser-design.md`：如实现中发现接口必须调整，同步更新设计文档。

## Task 1: 初始化项目脚手架

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`

- [ ] **Step 1: 创建项目配置文件**

Create `package.json`:

```json
{
  "name": "x-follow-report-browser",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "concurrently -k -n api,web -c cyan,green \"pnpm dev:api\" \"pnpm dev:web\"",
    "dev:api": "tsx watch server/index.ts",
    "dev:web": "vite --host 127.0.0.1",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "node dist-server/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@vitejs/plugin-vue": "^6.0.0",
    "markdown-it": "^14.1.0",
    "sanitize-html": "^2.13.1",
    "vue": "^3.5.0"
  },
  "devDependencies": {
    "@types/markdown-it": "^14.1.2",
    "@types/node": "^22.10.0",
    "@types/sanitize-html": "^2.13.0",
    "@vue/test-utils": "^2.4.6",
    "concurrently": "^9.1.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0",
    "vue-tsc": "^2.2.0"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "."
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node", "vitest/globals"],
    "skipLibCheck": true
  },
  "include": ["src", "server", "vite.config.ts"]
}
```

Create `vite.config.ts`:

```ts
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787"
    }
  },
  test: {
    environment: "node",
    globals: true
  }
});
```

Create `index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>X Follow 报告浏览器</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: 安装依赖**

Run:

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` is created and dependencies install successfully.

- [ ] **Step 3: 运行空测试命令**

Run:

```bash
pnpm test
```

Expected: Vitest runs and reports no test files or passes once tests are added in later tasks.

## Task 2: 实现报告路径工具

**Files:**
- Create: `server/types.ts`
- Create: `server/reportPaths.ts`
- Create: `server/reportPaths.test.ts`

- [ ] **Step 1: 写路径工具测试**

Create `server/reportPaths.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  deriveReportPath,
  idToRelativePath,
  isValidReportPath,
  relativePathToId
} from "./reportPaths";

describe("reportPaths", () => {
  it("accepts only report markdown paths", () => {
    expect(isValidReportPath("2026-05/19/144437-晚报.md")).toBe(true);
    expect(isValidReportPath("2026-05/19/report.md")).toBe(true);
    expect(isValidReportPath("../secret.md")).toBe(false);
    expect(isValidReportPath("/tmp/secret.md")).toBe(false);
    expect(isValidReportPath("2026/05/19.md")).toBe(false);
    expect(isValidReportPath("2026-05/19/report.txt")).toBe(false);
  });

  it("round-trips ids and relative paths", () => {
    const path = "2026-05/19/144437-晚报.md";
    const id = relativePathToId(path);
    expect(idToRelativePath(id)).toBe(path);
  });

  it("derives a report path from generatedAt and kind", () => {
    expect(deriveReportPath("2026-05-19T06:44:37.000Z", "晚报")).toBe(
      "2026-05/19/144437-晚报.md"
    );
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm test server/reportPaths.test.ts
```

Expected: FAIL because `server/reportPaths.ts` does not exist.

- [ ] **Step 3: 实现类型和路径工具**

Create `server/types.ts`:

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

export type ReportDetail = ReportSummary & {
  markdown: string;
};

export type PublishReportInput = {
  title?: string;
  kind?: Exclude<ReportKind, "未知">;
  generatedAt?: string;
  path?: string;
  content: string;
  overwrite?: boolean;
};

export type ApiError = {
  error: {
    code: string;
    message: string;
  };
};
```

Create `server/reportPaths.ts`:

```ts
import path from "node:path";
import type { ReportKind } from "./types";

const REPORT_PATH_RE = /^\d{4}-\d{2}\/\d{2}\/[^/]+\.md$/;

export function isValidReportPath(relativePath: string): boolean {
  if (path.isAbsolute(relativePath)) return false;
  if (relativePath.includes("..")) return false;
  return REPORT_PATH_RE.test(relativePath);
}

export function relativePathToId(relativePath: string): string {
  return Buffer.from(relativePath, "utf8").toString("base64url");
}

export function idToRelativePath(id: string): string {
  return Buffer.from(id, "base64url").toString("utf8");
}

export function inferKindFromPath(relativePath: string): ReportKind {
  if (relativePath.includes("早报")) return "早报";
  if (relativePath.includes("午报")) return "午报";
  if (relativePath.includes("晚报")) return "晚报";
  return "未知";
}

export function deriveReportPath(generatedAt: string, kind: Exclude<ReportKind, "未知">): string {
  const date = new Date(generatedAt);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid generatedAt");
  }

  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}/${parts.day}/${parts.hour}${parts.minute}${parts.second}-${kind}.md`;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
pnpm test server/reportPaths.test.ts
```

Expected: PASS.

## Task 3: 实现 Markdown 报告解析

**Files:**
- Create: `server/reportParser.ts`
- Create: `server/reportParser.test.ts`

- [ ] **Step 1: 写解析器测试**

Create `server/reportParser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseReportMarkdown } from "./reportParser";

describe("parseReportMarkdown", () => {
  it("extracts metadata and excerpt from 今日要点", () => {
    const markdown = `# AI 开发者晚报 2026-05-19

生成时间：2026-05-19 14:44:37  
覆盖时间：2026-05-18 14:44 至 2026-05-19 14:44（Asia/Shanghai）  
来源：X Following 时间线，共抓取 82 条，整理 31 条相关动态。

## 今日要点

- Claude Design 将所有套餐 token limit 翻倍。
- OpenAI Developers 介绍 Codex 桌面端远程连接。

## 资讯

### Claude Design 将所有套餐 token limit 翻倍

正文。
`;

    const result = parseReportMarkdown(markdown, "2026-05/19/144437-晚报.md", 1779173077000);

    expect(result.title).toBe("AI 开发者晚报 2026-05-19");
    expect(result.kind).toBe("晚报");
    expect(result.generatedAt).toBe("2026-05-19 14:44:37");
    expect(result.period).toContain("2026-05-18 14:44");
    expect(result.source).toContain("X Following");
    expect(result.excerpt).toContain("Claude Design");
    expect(result.itemCount).toBe(1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm test server/reportParser.test.ts
```

Expected: FAIL because `server/reportParser.ts` does not exist.

- [ ] **Step 3: 实现解析器**

Create `server/reportParser.ts`:

```ts
import type { ReportSummary } from "./types";
import { inferKindFromPath, relativePathToId } from "./reportPaths";

export function parseReportMarkdown(markdown: string, relativePath: string, createdAtMs: number): ReportSummary {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || relativePath.split("/").at(-1) || "未命名报告";
  const generatedAt = markdown.match(/^生成时间：(.+?)(?:\s{2,})?$/m)?.[1]?.trim();
  const period = markdown.match(/^覆盖时间：(.+?)(?:\s{2,})?$/m)?.[1]?.trim();
  const source = markdown.match(/^来源：(.+?)(?:\s{2,})?$/m)?.[1]?.trim();
  const kindFromTitle = title.includes("早报") ? "早报" : title.includes("午报") ? "午报" : title.includes("晚报") ? "晚报" : "未知";
  const kind = inferKindFromPath(relativePath) === "未知" ? kindFromTitle : inferKindFromPath(relativePath);

  return {
    id: relativePathToId(relativePath),
    title,
    kind,
    date: relativePath.slice(0, 10),
    generatedAt,
    period,
    source,
    path: relativePath,
    excerpt: extractExcerpt(markdown),
    itemCount: countItems(markdown),
    createdAtMs
  };
}

function extractExcerpt(markdown: string): string {
  const keyPoints = markdown.match(/## 今日要点\s+([\s\S]*?)(?:\n##\s+|$)/);
  if (keyPoints?.[1]) {
    return keyPoints[1].replace(/\s+/g, " ").trim().slice(0, 240);
  }

  const paragraph = markdown
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .find((part) => part && !part.startsWith("#") && !part.startsWith("生成时间：") && !part.startsWith("覆盖时间：") && !part.startsWith("来源："));
  return (paragraph || "").replace(/\s+/g, " ").slice(0, 240);
}

function countItems(markdown: string): number | undefined {
  const section = markdown.match(/## 资讯\s+([\s\S]*)/);
  const body = section?.[1] || markdown;
  const count = (body.match(/^###\s+/gm) || []).length || (body.match(/^##\s+(?!今日要点|资讯)/gm) || []).length;
  return count || undefined;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
pnpm test server/reportParser.test.ts
```

Expected: PASS.

## Task 4: 实现报告索引和写入

**Files:**
- Create: `server/reportIndex.ts`
- Create: `server/reportIndex.test.ts`

- [ ] **Step 1: 写索引和写入测试**

Create `server/reportIndex.test.ts`:

```ts
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createReportIndex } from "./reportIndex";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "x-follow-reports-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("createReportIndex", () => {
  it("indexes markdown reports under date directories", async () => {
    await writeFile(
      path.join(root, "2026-05/19/144437-晚报.md"),
      "# AI 开发者晚报 2026-05-19\n\n生成时间：2026-05-19 14:44:37\n\n## 今日要点\n\n- 一条重点。",
      "utf8"
    );

    const index = createReportIndex(root);
    const reports = await index.listReports();

    expect(reports).toHaveLength(1);
    expect(reports[0].title).toBe("AI 开发者晚报 2026-05-19");
    expect(reports[0].kind).toBe("晚报");
  });

  it("writes a new report and rejects overwrite by default", async () => {
    const index = createReportIndex(root);
    const result = await index.publishReport({
      kind: "晚报",
      generatedAt: "2026-05-19T06:44:37.000Z",
      content: "# AI 开发者晚报 2026-05-19\n\n正文"
    });

    expect(result.path).toBe("2026-05/19/144437-晚报.md");
    await expect(index.publishReport({ path: result.path, content: "# duplicate" })).rejects.toThrow("Report already exists");

    const content = await readFile(path.join(root, result.path), "utf8");
    expect(content).toContain("AI 开发者晚报");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm test server/reportIndex.test.ts
```

Expected: FAIL because `server/reportIndex.ts` does not exist.

- [ ] **Step 3: 实现索引器**

Create `server/reportIndex.ts`:

```ts
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseReportMarkdown } from "./reportParser";
import { deriveReportPath, idToRelativePath, isValidReportPath } from "./reportPaths";
import type { PublishReportInput, ReportDetail, ReportSummary } from "./types";

export function createReportIndex(root: string) {
  async function listReportPaths(): Promise<string[]> {
    const years = await safeReaddir(root);
    const paths: string[] = [];
    for (const yearMonth of years.filter((name) => /^\d{4}-\d{2}$/.test(name))) {
      const monthDir = path.join(root, yearMonth);
      const days = await safeReaddir(monthDir);
      for (const day of days.filter((name) => /^\d{2}$/.test(name))) {
        const dayDir = path.join(monthDir, day);
        const files = await safeReaddir(dayDir);
        for (const file of files.filter((name) => name.endsWith(".md"))) {
          const relativePath = `${yearMonth}/${day}/${file}`;
          if (isValidReportPath(relativePath)) paths.push(relativePath);
        }
      }
    }
    return paths;
  }

  async function listReports(): Promise<ReportSummary[]> {
    const summaries = await Promise.all(
      (await listReportPaths()).map(async (relativePath) => {
        const absolutePath = path.join(root, relativePath);
        const [markdown, stats] = await Promise.all([readFile(absolutePath, "utf8"), stat(absolutePath)]);
        return parseReportMarkdown(markdown, relativePath, pathTime(relativePath) || stats.mtimeMs);
      })
    );
    return summaries.sort((a, b) => b.createdAtMs - a.createdAtMs);
  }

  async function getReportById(id: string): Promise<ReportDetail | undefined> {
    const relativePath = idToRelativePath(id);
    if (!isValidReportPath(relativePath)) return undefined;
    const absolutePath = path.join(root, relativePath);
    try {
      const [markdown, stats] = await Promise.all([readFile(absolutePath, "utf8"), stat(absolutePath)]);
      return { ...parseReportMarkdown(markdown, relativePath, pathTime(relativePath) || stats.mtimeMs), markdown };
    } catch {
      return undefined;
    }
  }

  async function publishReport(input: PublishReportInput): Promise<ReportSummary> {
    if (!input.content?.trim()) throw new Error("Report content is required");
    const kind = input.kind || "晚报";
    const relativePath = input.path || deriveReportPath(input.generatedAt || new Date().toISOString(), kind);
    if (!isValidReportPath(relativePath)) throw new Error("Invalid report path");

    const absolutePath = path.join(root, relativePath);
    if (!input.overwrite) {
      try {
        await stat(absolutePath);
        throw new Error("Report already exists");
      } catch (error) {
        if (error instanceof Error && error.message === "Report already exists") throw error;
      }
    }

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.content, "utf8");
    const stats = await stat(absolutePath);
    return parseReportMarkdown(input.content, relativePath, pathTime(relativePath) || stats.mtimeMs);
  }

  return { listReports, getReportById, publishReport };
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

function pathTime(relativePath: string): number | undefined {
  const match = relativePath.match(/^(\d{4})-(\d{2})\/(\d{2})\/(\d{2})(\d{2})(\d{2})/);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second] = match;
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`).getTime();
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
pnpm test server/reportIndex.test.ts
```

Expected: PASS.

## Task 5: 实现 HTTP API

**Files:**
- Create: `server/index.ts`

- [ ] **Step 1: 实现 API 服务**

Create `server/index.ts`:

```ts
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createReportIndex } from "./reportIndex";

const port = Number(process.env.PORT || 8787);
const root = process.env.REPORT_ROOT ? path.resolve(process.env.REPORT_ROOT) : process.cwd();
const uploadToken = process.env.REPORT_UPLOAD_TOKEN;
const index = createReportIndex(root);

const server = createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: { code: "internal_error", message: "服务内部错误" } });
  }
});

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/api/reports") {
    sendJson(res, 200, { reports: await index.listReports() });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/reports/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/reports/".length));
    const report = await index.getReportById(id);
    if (!report) {
      sendJson(res, 404, { error: { code: "not_found", message: "报告不存在" } });
      return;
    }
    sendJson(res, 200, { report });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/reports") {
    if (!uploadToken) {
      sendJson(res, 503, { error: { code: "publishing_disabled", message: "未配置 REPORT_UPLOAD_TOKEN" } });
      return;
    }
    if (req.headers["x-report-token"] !== uploadToken) {
      sendJson(res, 401, { error: { code: "unauthorized", message: "上传 Token 无效" } });
      return;
    }
    const body = await readJson(req);
    const report = await index.publishReport(body);
    sendJson(res, 201, { report, url: `/?report=${encodeURIComponent(report.id)}` });
    return;
  }

  if (req.method === "GET" && !url.pathname.startsWith("/api")) {
    await serveStatic(url.pathname, res);
    return;
  }

  sendJson(res, 404, { error: { code: "not_found", message: "接口不存在" } });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(urlPath: string, res: ServerResponse) {
  const filePath = urlPath === "/" ? "dist/index.html" : path.join("dist", urlPath);
  try {
    const body = await readFile(path.join(process.cwd(), filePath));
    res.writeHead(200);
    res.end(body);
  } catch {
    const body = await readFile(path.join(process.cwd(), "dist/index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(body);
  }
}

server.listen(port, "127.0.0.1", () => {
  console.log(`Report API listening on http://127.0.0.1:${port}`);
});
```

- [ ] **Step 2: 手动验证列表接口**

Run:

```bash
pnpm dev:api
```

In another shell:

```bash
curl http://127.0.0.1:8787/api/reports
```

Expected: JSON response with existing reports from `2026-05/...`.

## Task 6: 实现前端 API、过滤和基础组件

**Files:**
- Create: `src/types/report.ts`
- Create: `src/api/reports.ts`
- Create: `src/api/reports.test.ts`
- Create: `src/reportFilters.ts`
- Create: `src/reportFilters.test.ts`

- [ ] **Step 1: 写前端 API 和过滤测试**

Create `src/api/reports.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { fetchReports } from "./reports";

describe("fetchReports", () => {
  it("loads report summaries", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reports: [{ id: "a", title: "报告", kind: "晚报", date: "2026-05/19", path: "2026-05/19/a.md", excerpt: "", createdAtMs: 1 }] })
    }));

    await expect(fetchReports()).resolves.toHaveLength(1);
  });
});
```

Create `src/reportFilters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filterReports } from "./reportFilters";
import type { ReportSummary } from "./types/report";

const reports: ReportSummary[] = [
  { id: "1", title: "AI 开发者晚报", kind: "晚报", date: "2026-05/19", path: "2026-05/19/a.md", excerpt: "Claude", createdAtMs: 2 },
  { id: "2", title: "AI 开发者早报", kind: "早报", date: "2026-05/18", path: "2026-05/18/a.md", excerpt: "OpenAI", createdAtMs: 1 }
];

describe("filterReports", () => {
  it("filters by kind and query", () => {
    expect(filterReports(reports, "claude", new Set(["晚报"]))).toHaveLength(1);
    expect(filterReports(reports, "claude", new Set(["早报"]))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 实现前端类型、API 和过滤**

Create `src/types/report.ts`:

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

export type ReportDetail = ReportSummary & {
  markdown: string;
};
```

Create `src/api/reports.ts`:

```ts
import type { ReportDetail, ReportSummary } from "../types/report";

export async function fetchReports(): Promise<ReportSummary[]> {
  const response = await fetch("/api/reports");
  if (!response.ok) throw new Error("报告列表加载失败");
  const data = await response.json();
  return data.reports;
}

export async function fetchReport(id: string): Promise<ReportDetail> {
  const response = await fetch(`/api/reports/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error("报告详情加载失败");
  const data = await response.json();
  return data.report;
}
```

Create `src/reportFilters.ts`:

```ts
import type { ReportKind, ReportSummary } from "./types/report";

export function filterReports(reports: ReportSummary[], query: string, kinds: Set<ReportKind>): ReportSummary[] {
  const normalized = query.trim().toLowerCase();
  return reports.filter((report) => {
    const kindMatches = kinds.size === 0 || kinds.has(report.kind);
    const haystack = [report.title, report.excerpt, report.kind, report.path, report.source, report.period]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return kindMatches && (!normalized || haystack.includes(normalized));
  });
}
```

- [ ] **Step 3: 运行测试确认通过**

Run:

```bash
pnpm test src/api/reports.test.ts src/reportFilters.test.ts
```

Expected: PASS.

## Task 7: 实现 Vue 界面

**Files:**
- Create: `src/main.ts`
- Create: `src/App.vue`
- Create: `src/components/ReportToolbar.vue`
- Create: `src/components/ReportSidebar.vue`
- Create: `src/components/ReportReader.vue`
- Create: `src/styles.css`

- [ ] **Step 1: 创建 Vue 入口**

Create `src/main.ts`:

```ts
import { createApp } from "vue";
import App from "./App.vue";
import "./styles.css";

createApp(App).mount("#app");
```

- [ ] **Step 2: 创建工具栏组件**

Create `src/components/ReportToolbar.vue`:

```vue
<script setup lang="ts">
import type { ReportKind } from "../types/report";

defineProps<{ query: string; selectedKinds: Set<ReportKind>; loading: boolean }>();
const emit = defineEmits<{ "update:query": [value: string]; toggleKind: [kind: ReportKind]; refresh: [] }>();
const kinds: ReportKind[] = ["早报", "午报", "晚报"];
</script>

<template>
  <header class="toolbar">
    <input class="search" :value="query" placeholder="搜索标题、正文、账号..." @input="emit('update:query', ($event.target as HTMLInputElement).value)" />
    <div class="kindFilters">
      <button v-for="kind in kinds" :key="kind" :class="{ active: selectedKinds.has(kind) }" @click="emit('toggleKind', kind)">
        {{ kind }}
      </button>
    </div>
    <button class="iconButton" :disabled="loading" title="刷新" @click="emit('refresh')">刷新</button>
  </header>
</template>
```

- [ ] **Step 3: 创建侧栏组件**

Create `src/components/ReportSidebar.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { ReportSummary } from "../types/report";

const props = defineProps<{ reports: ReportSummary[]; selectedId?: string }>();
const emit = defineEmits<{ select: [id: string] }>();

const grouped = computed(() => {
  const groups = new Map<string, ReportSummary[]>();
  for (const report of props.reports) {
    const key = report.path.slice(0, 10);
    groups.set(key, [...(groups.get(key) || []), report]);
  }
  return [...groups.entries()];
});
</script>

<template>
  <aside class="sidebar">
    <div class="brand">X Reports</div>
    <div v-for="[date, items] in grouped" :key="date" class="dateGroup">
      <div class="dateLabel">{{ date }}</div>
      <button v-for="report in items" :key="report.id" class="reportItem" :class="{ selected: report.id === selectedId }" @click="emit('select', report.id)">
        <span class="kind">{{ report.kind }}</span>
        <span class="title">{{ report.title }}</span>
      </button>
    </div>
  </aside>
</template>
```

- [ ] **Step 4: 创建阅读器组件**

Create `src/components/ReportReader.vue`:

```vue
<script setup lang="ts">
import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";
import { computed } from "vue";
import type { ReportDetail } from "../types/report";

const props = defineProps<{ report?: ReportDetail; loading: boolean; error?: string }>();
const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

const html = computed(() => {
  if (!props.report) return "";
  return sanitizeHtml(md.render(props.report.markdown), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["h1", "h2", "h3"]),
    allowedAttributes: {
      a: ["href", "name", "target", "rel"]
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noreferrer" })
    }
  });
});
</script>

<template>
  <main class="reader">
    <div v-if="loading" class="state">正在加载报告...</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <div v-else-if="!report" class="state">暂无报告</div>
    <article v-else>
      <div class="meta">
        <span>{{ report.generatedAt || report.date }}</span>
        <span>{{ report.kind }}</span>
        <span v-if="report.itemCount">{{ report.itemCount }} 条资讯</span>
      </div>
      <h1>{{ report.title }}</h1>
      <p class="path">{{ report.path }}</p>
      <div class="markdown" v-html="html"></div>
    </article>
  </main>
</template>
```

- [ ] **Step 5: 创建 App 状态组合**

Create `src/App.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { fetchReport, fetchReports } from "./api/reports";
import ReportReader from "./components/ReportReader.vue";
import ReportSidebar from "./components/ReportSidebar.vue";
import ReportToolbar from "./components/ReportToolbar.vue";
import { filterReports } from "./reportFilters";
import type { ReportDetail, ReportKind, ReportSummary } from "./types/report";

const reports = ref<ReportSummary[]>([]);
const selectedId = ref<string>();
const selectedReport = ref<ReportDetail>();
const query = ref("");
const selectedKinds = ref(new Set<ReportKind>());
const listLoading = ref(false);
const detailLoading = ref(false);
const error = ref<string>();

const filteredReports = computed(() => filterReports(reports.value, query.value, selectedKinds.value));

async function loadReports() {
  listLoading.value = true;
  error.value = undefined;
  try {
    reports.value = await fetchReports();
    if (!selectedId.value && reports.value[0]) selectedId.value = reports.value[0].id;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "报告列表加载失败";
  } finally {
    listLoading.value = false;
  }
}

async function loadDetail(id: string) {
  detailLoading.value = true;
  error.value = undefined;
  try {
    selectedReport.value = await fetchReport(id);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "报告详情加载失败";
  } finally {
    detailLoading.value = false;
  }
}

function toggleKind(kind: ReportKind) {
  const next = new Set(selectedKinds.value);
  if (next.has(kind)) next.delete(kind);
  else next.add(kind);
  selectedKinds.value = next;
}

watch(selectedId, (id) => {
  if (id) void loadDetail(id);
});

onMounted(loadReports);
</script>

<template>
  <div class="appShell">
    <ReportSidebar :reports="filteredReports" :selected-id="selectedId" @select="selectedId = $event" />
    <section class="mainPanel">
      <ReportToolbar :query="query" :selected-kinds="selectedKinds" :loading="listLoading" @update:query="query = $event" @toggle-kind="toggleKind" @refresh="loadReports" />
      <ReportReader :report="selectedReport" :loading="detailLoading" :error="error" />
    </section>
  </div>
</template>
```

- [ ] **Step 6: 创建全局样式**

Create `src/styles.css`:

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; background: #f5f7fb; }
button, input { font: inherit; }
.appShell { display: grid; grid-template-columns: 300px minmax(0, 1fr); min-height: 100vh; }
.sidebar { background: #ffffff; border-right: 1px solid #dde3ec; padding: 20px 14px; overflow: auto; }
.brand { font-size: 22px; font-weight: 800; margin: 0 8px 24px; }
.dateGroup { margin-bottom: 18px; }
.dateLabel { color: #64748b; font-size: 12px; font-weight: 700; margin: 0 8px 8px; }
.reportItem { width: 100%; border: 0; background: transparent; display: grid; gap: 4px; text-align: left; padding: 10px 12px; border-radius: 8px; cursor: pointer; }
.reportItem:hover { background: #f1f5f9; }
.reportItem.selected { background: #e9f2ff; color: #174ea6; }
.kind { font-size: 12px; font-weight: 800; }
.title { font-size: 14px; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mainPanel { min-width: 0; display: grid; grid-template-rows: auto 1fr; }
.toolbar { display: flex; gap: 12px; align-items: center; padding: 16px 20px; background: rgba(245, 247, 251, 0.92); border-bottom: 1px solid #dde3ec; position: sticky; top: 0; z-index: 2; }
.search { flex: 1; border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; padding: 10px 12px; min-width: 180px; }
.kindFilters { display: flex; gap: 6px; }
.kindFilters button, .iconButton { border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; padding: 9px 12px; cursor: pointer; }
.kindFilters button.active { background: #111827; color: #fff; border-color: #111827; }
.reader { overflow: auto; padding: 28px; }
.reader article { max-width: 900px; margin: 0 auto; background: #fff; border: 1px solid #dde3ec; border-radius: 8px; padding: 32px; }
.meta { display: flex; gap: 10px; flex-wrap: wrap; color: #64748b; font-size: 13px; }
.reader h1 { font-size: 30px; line-height: 1.2; margin: 12px 0 8px; }
.path { color: #64748b; font-size: 13px; }
.markdown { line-height: 1.78; font-size: 16px; }
.markdown h1 { display: none; }
.markdown h2 { margin-top: 34px; padding-top: 18px; border-top: 1px solid #e2e8f0; }
.markdown h3 { margin-top: 28px; color: #0f172a; }
.markdown a { color: #2563eb; text-decoration: none; }
.markdown a:hover { text-decoration: underline; }
.state { max-width: 900px; margin: 48px auto; color: #64748b; }
.state.error { color: #b42318; }
@media (max-width: 820px) {
  .appShell { grid-template-columns: 1fr; }
  .sidebar { max-height: 42vh; border-right: 0; border-bottom: 1px solid #dde3ec; }
  .toolbar { flex-wrap: wrap; }
  .reader { padding: 16px; }
  .reader article { padding: 22px; }
}
```

- [ ] **Step 7: 运行构建**

Run:

```bash
pnpm build
```

Expected: TypeScript and Vite build pass.

## Task 8: 手动联调上传发布接口

**Files:**
- Modify only if verification uncovers bugs in previous files.

- [ ] **Step 1: 启动开发服务**

Run:

```bash
REPORT_UPLOAD_TOKEN=dev-token pnpm dev
```

Expected: API starts on `http://127.0.0.1:8787`, Vite starts on its dev URL.

- [ ] **Step 2: 浏览器验证**

Open the Vite URL.

Expected:
- 最新报告默认选中；
- 左侧列表按日期显示；
- 搜索 `Claude` 能过滤报告；
- 点击旧报告能切换正文。

- [ ] **Step 3: 发布样例报告**

Run:

```bash
curl -sS -X POST http://127.0.0.1:8787/api/reports \
  -H 'Content-Type: application/json' \
  -H 'X-Report-Token: dev-token' \
  -d '{"kind":"晚报","generatedAt":"2026-05-19T12:00:00.000Z","path":"2026-05/19/200000-晚报.md","content":"# AI 开发者晚报 2026-05-19\n\n生成时间：2026-05-19 20:00:00\n\n## 今日要点\n\n- 上传接口联调成功。\n\n## 资讯\n\n### 上传接口写入样例报告\n\n正文。"}'
```

Expected: `201` response with `report.path` equal to `2026-05/19/200000-晚报.md`.

- [ ] **Step 4: 刷新前端列表**

Click refresh.

Expected: 样例报告出现在左侧列表，并可正常阅读。

- [ ] **Step 5: 验证鉴权失败**

Run:

```bash
curl -i -X POST http://127.0.0.1:8787/api/reports \
  -H 'Content-Type: application/json' \
  -d '{"content":"# should fail"}'
```

Expected: `401` response with JSON error code `unauthorized`.

## Task 9: 最终验证和文档同步

**Files:**
- Modify: `docs/superpowers/specs/2026-05-19-report-browser-design.md` only if implementation differs from spec.

- [ ] **Step 1: 运行全量测试**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 2: 运行生产构建**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 3: 检查未预期文件**

Run:

```bash
find . -maxdepth 2 -type f | sort
```

Expected: 包含新增项目文件、测试文件和 `pnpm-lock.yaml`。如果 Task 8 创建了样例报告，保留或删除需由用户决定；不要擅自删除用户历史报告。

- [ ] **Step 4: 如果目录已初始化 git，再提交**

Run only if `.git` exists:

```bash
git add package.json pnpm-workspace.yaml tsconfig.json vite.config.ts index.html src server docs/superpowers/specs/2026-05-19-report-browser-design.md docs/superpowers/plans/2026-05-19-report-browser.md
git commit -m "feat: add x follow report browser"
```

Expected: commit succeeds. If this directory remains non-git, skip commit and mention it in final summary.

