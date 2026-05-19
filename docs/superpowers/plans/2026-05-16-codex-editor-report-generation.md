# Codex Editor Report Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `x-follow-report` into a Codex-in-the-loop workflow where the script exports clean tweet materials and Codex writes the final Chinese news-style Markdown report.

**Architecture:** Keep the Bun TypeScript script as a deterministic X data collector and material exporter. The script handles auth, pagination, normalization, filtering helpers, report path calculation, and safe JSON material output; Codex, running inside the current session, reads that material JSON and writes the final report directly as Markdown. No OpenAI API key, model provider key, or in-script LLM call is required.

**Tech Stack:** Bun, TypeScript, `bun:test`, local Codex session, Markdown output under `YYYY-MM/DD/HHMMSS-早|午|晚报.md`.

---

## Product Spec

### Desired User Outcome

When the user says “帮我执行一次日报技能”, Codex should:

1. run the local script to fetch X timeline data;
2. receive a structured material package from the script;
3. read the material package in the current Codex context;
4. write a polished Chinese report in the project root using the existing date path convention.

The final report should read like a Chinese tech/news briefing. A reader should understand the concrete event from the heading alone, and the summary should explain the specific contents of the source tweet rather than describing a category.

Good output shape:

```markdown
### 🤖 【实战】Claude Code 维护大型代码库的心得：上下文边界、测试反馈和小步提交是关键
**内容摘要**：
开发者分享了 Claude Code 在大型代码库维护中的使用心得，重点不是让 Agent 一次性完成所有修改，而是通过清晰上下文、明确变更边界和持续测试反馈来降低误改风险。
*   **核心观点**：大型代码库里的 Agent 工作流要围绕可审查的小变更组织，而不是追求一次性自动完成。
*   **实践细节**：上下文压缩、任务拆分、测试反馈和人工审核节奏是稳定性的主要来源。

**关联推文**：[查看原推](https://x.com/9hills/status/2055251796218753204)
```

Bad output examples:

```markdown
### 🚀 【发布】产品发布与关键更新
这条动态提到一次产品发布或功能预览，值得结合原推确认适用范围、可用平台和配置要求。
```

```markdown
### 🧠 【观点】sama 分享开发者社区动态
这条英文动态包含开发者社区信号，建议打开原推核对完整语境。
```

### Non-Goals

- Do not require `OPENAI_API_KEY` or any other model provider key.
- Do not call OpenAI, Anthropic, Gemini, or other model APIs from the Bun script.
- Do not build a generic X-to-Markdown archive.
- Do not generate one Markdown file per tweet.
- Do not reintroduce a separate `### 🛠️ 【新工具/资源】` link-dump section.
- Do not rely on handcrafted per-topic templates as the primary writing mechanism.
- Do not call or depend on other X-to-Markdown skills.

### Editorial Rules For Codex

1. All prose in the report must be written in Chinese.
2. Proper nouns, account handles, product names, URLs, model names, and code names may remain in their original language.
3. Every retained tweet becomes either a standalone news item or part of a merged news item when multiple tweets clearly discuss the same event.
4. There is no hard report item cap.
5. Obvious unrelated noise can still be filtered by Codex, such as politics, celebrity entertainment, health/insurance, sports, or replies with no standalone information.
6. News item headings must include a concrete subject and action, for example `OpenAI 推出...`, `Clerk 发布...`, `开发者分享...`, `LangChain 公布...`.
7. Headings must not be generic category labels.
8. Summaries must summarize the actual tweet content and must not say “建议查看原推了解上下文” as the main information.
9. Link-only tweets should be summarized by the tweet text plus visible domain/resource context. Codex must not invent details unavailable from the provided tweet facts.
10. `x.com`, `weibo.com`, `feishu.cn`, generic blog links, and event pages are not automatically “new tools/resources”. They are only supporting links for the news item.
11. GitHub/Hugging Face/npm/PyPI links can be described as project/resource entries only when the tweet itself presents or recommends them as such.
12. The final Markdown must preserve the existing report metadata and output path convention.

### Material Export Contract

The script exports a compact JSON package. It must never include raw cookies, auth headers, raw API pages, or unrelated local files.

```ts
export type ReportMaterialTweet = {
  id: string;
  url: string;
  authorName: string;
  authorHandle: string;
  createdAt: string;
  text: string;
  language: string;
  links: string[];
  hashtags: string[];
  metrics: {
    replies: number;
    reposts: number;
    likes: number;
    quotes: number;
    views: number;
  };
  flags: {
    isReply: boolean;
    isRepost: boolean;
    isQuote: boolean;
  };
};

export type ReportMaterials = {
  version: 1;
  reportKind: "早报" | "午报" | "晚报";
  generatedAt: string;
  sourceLabel: string;
  timeline: "following" | "home";
  totalTweets: number;
  selectedTweets: number;
  periodStart: string;
  periodEnd: string;
  outputPath: string;
  focusAccounts: string[];
  keywords: string[];
  tweets: ReportMaterialTweet[];
  warnings: string[];
};
```

### Material Output Mode

Add a script mode for Codex:

```bash
bun main.ts --timeline following --max-items 100 --lookback-hours 24 --materials-json
```

Behavior:

- Fetch X timeline as today.
- Normalize tweets as today.
- Select likely relevant AI/dev tweets but do not cap the final count.
- Print `ReportMaterials` JSON to stdout.
- Do not write a Markdown report in this mode.
- Do not print tokens, cookies, or raw X responses.

Optional file output for easier Codex reading:

```bash
bun main.ts --timeline following --max-items 100 --lookback-hours 24 --materials-file /tmp/x-follow-materials.json
```

Behavior:

- Write the same `ReportMaterials` JSON to the requested file path.
- Print only that file path to stdout.
- Use this when stdout would be too large for comfortable terminal reading.

### Codex Report Writing Contract

After materials are exported, Codex writes the Markdown file itself using normal filesystem editing tools.

Codex must:

- read `materials.outputPath`;
- create parent directories if needed;
- write the final report to `materials.outputPath`;
- organize each item as `标题 + 内容摘要 + 1-3 bullets + 关联推文`;
- scan the final report for banned generic phrases before claiming completion.

Banned phrases:

- `开发者社区信号`
- `产品发布与关键更新`
- `技术洞察与社区热议`
- `这条英文动态`
- `建议打开原推`
- `建议查看原推`
- `值得结合原推确认`
- `分享了一条开发者相关动态`
- `新工具/资源`

### Fallback Behavior

If X collection fails with `401`, `429`, or parser drift:

- Preserve existing failure behavior from `main.ts` and `xapi.ts`.
- Do not fabricate a report.

If the material package contains zero selected tweets:

- Codex writes a short Chinese report with metadata and `### 🧭 【暂无可分析动态】`.

If the material package is too large for one Codex response:

- Codex should process tweets in batches, merge related topics, and still write one final report.

## File Structure

### Modify Existing Files

- `/Users/justonetree/wwwroot/x-follow/.agents/skills/x-follow-report/SKILL.md`
  - Update the workflow description so “报纸生成” means “脚本导出素材，Codex 生成报告正文”.
  - Remove the stale separate `### 🛠️ 【新工具/资源】` template.
  - Add the Codex execution procedure.

- `/Users/justonetree/wwwroot/x-follow/.agents/skills/x-follow-report/scripts/types.ts`
  - Add `ReportKind`, `ReportMaterialTweet`, and `ReportMaterials` types.

- `/Users/justonetree/wwwroot/x-follow/.agents/skills/x-follow-report/scripts/materials.ts`
  - New module responsible for relevance filtering, scoring, keyword extraction, focus account extraction, material package construction, and JSON serialization.

- `/Users/justonetree/wwwroot/x-follow/.agents/skills/x-follow-report/scripts/main.ts`
  - Add CLI flags `--materials-json` and `--materials-file <path>`.
  - In material mode, collect timeline and export materials instead of writing Markdown.
  - Keep existing default behavior until it is intentionally retired, so current tests do not break all at once.

- `/Users/justonetree/wwwroot/x-follow/.agents/skills/x-follow-report/scripts/markdown.ts`
  - Stop expanding the handwritten template system further.
  - Keep timestamp and report kind helpers if still imported by material generation.
  - Later cleanup can remove unused template functions after Codex material mode becomes the primary workflow.

- `/Users/justonetree/wwwroot/x-follow/.agents/skills/x-follow-report/scripts/timeline.test.ts`
  - Add tests for material export mode and safe JSON shape.

### Do Not Modify

- `/Users/justonetree/wwwroot/x-follow/.agents/skills/x-follow-report/scripts/llm.ts`
  - This file can remain unused for now or be deleted in a later cleanup task, but this plan does not route report generation through it.

## Implementation Plan

### Task 1: Define Material Export Types

**Files:**
- Modify: `/Users/justonetree/wwwroot/x-follow/.agents/skills/x-follow-report/scripts/types.ts`
- Create: `/Users/justonetree/wwwroot/x-follow/.agents/skills/x-follow-report/scripts/materials.ts`
- Test: `/Users/justonetree/wwwroot/x-follow/.agents/skills/x-follow-report/scripts/materials.test.ts`

- [ ] **Step 1: Write failing material-shape test**

Create `/Users/justonetree/wwwroot/x-follow/.agents/skills/x-follow-report/scripts/materials.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { buildReportMaterials } from "./materials.js";
import type { NormalizedTweet } from "./types.js";

function tweet(overrides: Partial<NormalizedTweet> = {}): NormalizedTweet {
  return {
    tweetId: "1",
    url: "https://x.com/alice/status/1",
    timeline: "following",
    authorName: "Alice",
    authorHandle: "alice",
    createdAt: "2026-05-16T06:00:00.000Z",
    collectedAt: "2026-05-16T06:01:00.000Z",
    text: "OpenAI 推出 ChatGPT 手机版 Codex 预览，支持 iOS 与安卓远程查看任务进度。",
    language: "zh",
    links: [],
    media: [],
    hashtags: [],
    metrics: { replies: 1, reposts: 2, likes: 3, quotes: 4, views: 100 },
    isReply: false,
    isRepost: false,
    isQuote: false,
    ...overrides,
  };
}

describe("report materials", () => {
  test("buildReportMaterials exports safe tweet facts and output path", () => {
    const materials = buildReportMaterials({
      tweets: [tweet()],
      outputPath: "/tmp/2026-05/16/140000-晚报.md",
      timeline: "following",
      reportKind: "晚报",
      generatedAt: "2026-05-16 14:00:00",
      sourceLabel: "X 关注时间线",
      periodStart: "2026-05-16T00:00:00+08:00",
      periodEnd: "2026-05-16T23:59:59+08:00",
    });

    expect(materials.version).toBe(1);
    expect(materials.outputPath).toBe("/tmp/2026-05/16/140000-晚报.md");
    expect(materials.totalTweets).toBe(1);
    expect(materials.selectedTweets).toBe(1);
    expect(materials.tweets[0]).toEqual({
      id: "1",
      url: "https://x.com/alice/status/1",
      authorName: "Alice",
      authorHandle: "alice",
      createdAt: "2026-05-16T06:00:00.000Z",
      text: "OpenAI 推出 ChatGPT 手机版 Codex 预览，支持 iOS 与安卓远程查看任务进度。",
      language: "zh",
      links: [],
      hashtags: [],
      metrics: { replies: 1, reposts: 2, likes: 3, quotes: 4, views: 100 },
      flags: { isReply: false, isRepost: false, isQuote: false },
    });
    expect(JSON.stringify(materials)).not.toContain("auth_token");
    expect(JSON.stringify(materials)).not.toContain("ct0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/justonetree/wwwroot/x-follow/.agents/skills/x-follow-report/scripts
bun test materials.test.ts
```

Expected: FAIL because `materials.ts` and material types do not exist.

- [ ] **Step 3: Add material types**

Append to `/Users/justonetree/wwwroot/x-follow/.agents/skills/x-follow-report/scripts/types.ts`:

```ts
export type ReportKind = "早报" | "午报" | "晚报";

export type ReportMaterialTweet = {
  id: string;
  url: string;
  authorName: string;
  authorHandle: string;
  createdAt: string;
  text: string;
  language: string;
  links: string[];
  hashtags: string[];
  metrics: Metrics;
  flags: {
    isReply: boolean;
    isRepost: boolean;
    isQuote: boolean;
  };
};

export type ReportMaterials = {
  version: 1;
  reportKind: ReportKind;
  generatedAt: string;
  sourceLabel: string;
  timeline: TimelineKind;
  totalTweets: number;
  selectedTweets: number;
  periodStart: string;
  periodEnd: string;
  outputPath: string;
  focusAccounts: string[];
  keywords: string[];
  tweets: ReportMaterialTweet[];
  warnings: string[];
};
```

- [ ] **Step 4: Implement material builder**

Create `/Users/justonetree/wwwroot/x-follow/.agents/skills/x-follow-report/scripts/materials.ts`:

```ts
import type { NormalizedTweet, ReportKind, ReportMaterials, TimelineKind } from "./types.js";

function score(tweet: NormalizedTweet): number {
  return (tweet.metrics.likes || 0)
    + (tweet.metrics.reposts || 0) * 2
    + (tweet.metrics.quotes || 0) * 3
    + (tweet.metrics.replies || 0);
}

function isObviousNoise(tweet: NormalizedTweet): boolean {
  const text = `${tweet.text} ${tweet.authorHandle}`.toLowerCase();
  if (tweet.isReply) return true;
  return /war in ukraine|trump|taxes|katseye|wildworld tour|glp-1|insurance|football|nba|celebrity/i.test(text);
}

function isDeveloperOrAiRelevant(tweet: NormalizedTweet): boolean {
  const text = `${tweet.text} ${tweet.links.join(" ")}`.toLowerCase();
  return /ai|agent|codex|claude|chatgpt|gpt|model|llm|coding|code|developer|devbox|cli|github|huggingface|open source|benchmark|eval|paper|research|workflow|api|langchain|openai|anthropic|工具|开发|模型|开源|评测|论文|编程|代码|提示词|智能体/.test(text);
}

function extractKeywords(tweets: NormalizedTweet[]): string[] {
  const stop = new Set(["https", "http", "with", "from", "this", "that", "today", "about", "the", "and", "for", "一个", "这个", "我们", "现在"]);
  const counts = new Map<string, number>();
  for (const tweet of tweets) {
    const words = tweet.text
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .split(/[^\p{L}\p{N}_#-]+/u)
      .map((word) => word.trim())
      .filter((word) => word.length >= 2 && !stop.has(word));
    for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
    for (const hashtag of tweet.hashtags) counts.set(`#${hashtag}`, (counts.get(`#${hashtag}`) ?? 0) + 2);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([word]) => word);
}

export function selectMaterialTweets(tweets: NormalizedTweet[]): NormalizedTweet[] {
  return tweets
    .filter((tweet) => !isObviousNoise(tweet))
    .filter((tweet) => isDeveloperOrAiRelevant(tweet))
    .sort((a, b) => score(b) - score(a));
}

export function buildReportMaterials(options: {
  tweets: NormalizedTweet[];
  outputPath: string;
  timeline: TimelineKind;
  reportKind: ReportKind;
  generatedAt: string;
  sourceLabel: string;
  periodStart: string;
  periodEnd: string;
}): ReportMaterials {
  const selected = selectMaterialTweets(options.tweets);
  return {
    version: 1,
    reportKind: options.reportKind,
    generatedAt: options.generatedAt,
    sourceLabel: options.sourceLabel,
    timeline: options.timeline,
    totalTweets: options.tweets.length,
    selectedTweets: selected.length,
    periodStart: options.periodStart,
    periodEnd: options.periodEnd,
    outputPath: options.outputPath,
    focusAccounts: selected.slice(0, 5).map((tweet) => tweet.authorHandle),
    keywords: extractKeywords(selected),
    tweets: selected.map((tweet) => ({
      id: tweet.tweetId,
      url: tweet.url,
      authorName: tweet.authorName,
      authorHandle: tweet.authorHandle,
      createdAt: tweet.createdAt,
      text: tweet.text,
      language: tweet.language,
      links: tweet.links,
      hashtags: tweet.hashtags,
      metrics: tweet.metrics,
      flags: {
        isReply: tweet.isReply,
        isRepost: tweet.isRepost,
        isQuote: tweet.isQuote,
      },
    })),
    warnings: [],
  };
}
```

- [ ] **Step 5: Run test**

Run:

```bash
cd /Users/justonetree/wwwroot/x-follow/.agents/skills/x-follow-report/scripts
bun test materials.test.ts
```

Expected: PASS.

### Task 2: Add Material Export CLI Mode

**Files:**
- Modify: `/Users/justonetree/wwwroot/x-follow/.agents/skills/x-follow-report/scripts/main.ts`
- Test: `/Users/justonetree/wwwroot/x-follow/.agents/skills/x-follow-report/scripts/timeline.test.ts`

- [ ] **Step 1: Add CLI argument fields**

Extend `CliArgs` in `main.ts`:

```ts
type CliArgs = Partial<RunConfig> & {
  help: boolean;
  login: boolean;
  json: boolean;
  acceptDanger: boolean;
  materialsJson: boolean;
  materialsFile?: string;
};
```

Initialize:

```ts
const args: CliArgs = { help: false, login: false, json: false, acceptDanger: false, materialsJson: false };
```

Parse:

```ts
else if (a === "--materials-json") args.materialsJson = true;
else if (a === "--materials-file") args.materialsFile = requireValue(a, argv[++i]);
```

Update usage:

```text
  --materials-json                 输出 Codex 报告素材 JSON 到 stdout，不写 Markdown
  --materials-file <path>          输出 Codex 报告素材 JSON 到指定文件
```

- [ ] **Step 2: Export report path helper**

Change:

```ts
function reportPath(outputDir: string, now: Date): string {
```

to:

```ts
export function reportPath(outputDir: string, now: Date): string {
```

- [ ] **Step 3: Add a pure helper for material output**

Import in `main.ts`:

```ts
import { buildReportMaterials } from "./materials.js";
```

Add:

```ts
export async function writeMaterialOutputs(options: WriteRunOptions): Promise<ReportMaterials> {
  const now = options.now ?? new Date();
  const pathToReport = reportPath(options.outputDir, now);
  return buildReportMaterials({
    tweets: options.tweets,
    outputPath: pathToReport,
    timeline: options.timeline,
    reportKind: reportKind(now),
    generatedAt: formatLocalTimestamp(now),
    sourceLabel: options.timeline === "home" ? "X 主页时间线" : "X 关注时间线",
    periodStart: options.periodStart,
    periodEnd: options.periodEnd,
  });
}
```

Also import `ReportMaterials` type from `types.ts`.

- [ ] **Step 4: Wire CLI material mode**

After `collection` is built in `main()`, before `writeRunOutputs`, add:

```ts
  if (cli.materialsJson || cli.materialsFile) {
    const materials = await writeMaterialOutputs({
      tweets: collection.tweets,
      rawPages: [],
      outputDir: config.outputDir,
      timeline: config.timeline,
      periodStart,
      periodEnd,
      language: config.reportLanguage,
      skipped: collection.skipped,
      errors: collection.errors,
    });
    const materialText = JSON.stringify(materials, null, 2);
    if (cli.materialsFile) {
      await mkdir(path.dirname(cli.materialsFile), { recursive: true });
      await writeFile(cli.materialsFile, materialText, "utf8");
      console.log(cli.materialsFile);
    } else {
      console.log(materialText);
    }
    return;
  }
```

Use `rawPages: []` because material output must not expose raw X API pages.

- [ ] **Step 5: Add unit test for material helper**

Append to `timeline.test.ts`:

```ts
import { writeMaterialOutputs } from "./main.js";

test("writeMaterialOutputs returns Codex materials without writing markdown", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "x-follow-report-"));
  try {
    const { tweets } = extractTimelineTweets(fixture, { timeline: "following" });
    const materials = await writeMaterialOutputs({
      tweets,
      rawPages: [fixture],
      outputDir: tmp,
      timeline: "following",
      periodStart: "2026-05-15T00:00:00+08:00",
      periodEnd: "2026-05-15T23:59:59+08:00",
      language: "zh-CN",
      skipped: 0,
      errors: [],
      now: new Date("2026-05-15T18:05:09+08:00"),
    });

    expect(materials.reportKind).toBe("晚报");
    expect(materials.outputPath).toBe(path.join(tmp, "2026-05", "15", "180509-晚报.md"));
    expect(materials.tweets[0].url).toBe("https://x.com/alice/status/111");
    expect(JSON.stringify(materials)).not.toContain("auth_token");
    expect(JSON.stringify(materials)).not.toContain("rawPages");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
```

- [ ] **Step 6: Run tests**

Run:

```bash
cd /Users/justonetree/wwwroot/x-follow/.agents/skills/x-follow-report/scripts
bun test
```

Expected: PASS.

### Task 3: Document The Codex Execution Workflow

**Files:**
- Modify: `/Users/justonetree/wwwroot/x-follow/.agents/skills/x-follow-report/SKILL.md`

- [ ] **Step 1: Update overview**

Replace the overview paragraph with:

```markdown
使用此 skill 抓取用户的 X 关注流或主页时间线。脚本负责采集并导出结构化素材；Codex 根据素材直接撰写中文 AI 开发者早/午/晚报，并按照日期结构保存到项目根目录。
```

- [ ] **Step 2: Update workflow**

Replace the execution flow with:

```markdown
执行流程：
1. **确认授权**：检查 `consent.json`。
2. **数据采集**：分次请求 X API，直到满足时间窗口（默认 24h）或条目数限制。
3. **素材导出**：使用 `--materials-json` 或 `--materials-file` 导出结构化推文事实，不包含 Cookie、Token 或原始 API 响应。
4. **Codex 编辑**：Codex 读取素材，按中文新闻资讯逻辑生成标题、摘要、要点和关联推文。
5. **文件落盘**：Codex 将最终 Markdown 写入素材中的 `outputPath`，路径格式为 `YYYY-MM/DD/HHMMSS-早|午|晚报.md`。
6. **质量检查**：写完后扫描泛化模板话，确认没有 `开发者社区信号`、`产品发布与关键更新`、`新工具/资源` 等表达。
```

- [ ] **Step 3: Replace report rules**

Replace `### 3. 资讯模板` with:

```markdown
### 3. Codex 资讯写作规则

- 不需要 `OPENAI_API_KEY`，也不从脚本调用任何大模型 API。
- 脚本只导出素材，报告正文由当前 Codex 会话撰写。
- 所有说明性文字使用中文；产品名、账号、模型名、URL 可保留原文。
- 每条资讯标题必须包含具体主体和动作，让读者一眼看出发生了什么。
- 摘要必须说明该动态的具体内容，不允许使用“开发者社区信号”“产品发布与关键更新”“技术洞察与社区热议”等泛化表达。
- 不设置资讯条数上限；只过滤明显无关噪声。
- 不再生成独立的“新工具/资源”栏目。工具、项目、链接都按普通资讯条目处理。
```

- [ ] **Step 4: Add execution command**

Add:

```markdown
Codex 执行日报时优先使用：

```bash
cd .agents/skills/x-follow-report/scripts
bun main.ts --timeline following --max-items 100 --lookback-hours 24 --materials-file /tmp/x-follow-materials.json
```

然后读取 `/tmp/x-follow-materials.json`，将报告写入其中的 `outputPath`。
```

### Task 4: Codex Report Writing Procedure

**Files:**
- No code file required.

- [ ] **Step 1: Run material export**

Run:

```bash
cd /Users/justonetree/wwwroot/x-follow/.agents/skills/x-follow-report/scripts
bun main.ts --timeline following --max-items 100 --lookback-hours 24 --materials-file /tmp/x-follow-materials.json
```

Expected: stdout is `/tmp/x-follow-materials.json`.

- [ ] **Step 2: Inspect materials**

Run:

```bash
node -e 'const fs=require("fs"); const m=JSON.parse(fs.readFileSync("/tmp/x-follow-materials.json","utf8")); console.log({outputPath:m.outputPath,totalTweets:m.totalTweets,selectedTweets:m.selectedTweets,focusAccounts:m.focusAccounts,keywords:m.keywords});'
```

Expected: prints report path and material counts without exposing credentials.

- [ ] **Step 3: Codex writes final Markdown**

Codex should write to `materials.outputPath` using this shell:

```bash
mkdir -p "$(dirname "$REPORT_PATH")"
```

The actual Markdown content should be created by Codex from the material facts, not by TypeScript templates.

- [ ] **Step 4: Scan final Markdown**

Run:

```bash
rg '开发者社区信号|产品发布与关键更新|技术洞察与社区热议|这条英文动态|建议打开原推|建议查看原推|值得结合原推确认|分享了一条开发者相关动态|新工具/资源' "$REPORT_PATH"
```

Expected: no matches.

- [ ] **Step 5: Inspect headings**

Run:

```bash
rg '^### ' "$REPORT_PATH" | sed -n '1,30p'
```

Expected: headings contain concrete subjects and actions.

## Self-Review

Spec coverage:
- No model API key is required; the script exports JSON materials and Codex writes the report.
- Script responsibilities and Codex responsibilities are clearly separated.
- The final Markdown quality requirements match the user’s “新闻资讯逻辑，标题+摘要” preference.
- The plan preserves the project-root date path convention.
- The plan avoids separate `新工具/资源` output and avoids generic template prose.

Placeholder scan:
- This plan includes concrete files, types, commands, tests, and expected outputs.
- There are no `TBD`, `TODO`, or “implement later” placeholders.

Type consistency:
- `ReportMaterials`, `ReportMaterialTweet`, and `ReportKind` are defined before use.
- `buildReportMaterials`, `selectMaterialTweets`, and `writeMaterialOutputs` are introduced before CLI wiring references them.

