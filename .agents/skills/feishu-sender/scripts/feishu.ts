import { readFile, appendFile, readdir, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import * as readline from "node:readline";

type FeishuTextElement = {
  tag: "text";
  text: string;
};

type FeishuLinkElement = {
  tag: "a";
  text: string;
  href: string;
};

type FeishuPostElement = FeishuTextElement | FeishuLinkElement;

type ReportSummary = {
  title: string;
  generatedAt?: string;
  source?: string;
  remoteUrl?: string;
  highlights: string[];
};

export type FeishuPostMessage = {
  msg_type: "post";
  content: {
    post: {
      zh_cn: {
        title: string;
        content: FeishuPostElement[][];
      };
    };
  };
};

export function markdownLineToFeishuElements(raw: string): FeishuPostElement[] {
  let line = raw.trimEnd();
  if (!line.trim()) return [{ tag: "text", text: "" }];
  if (line.startsWith("### ")) line = line.replace(/^###\s+/, "");
  else if (line.startsWith("## ")) line = line.replace(/^##\s+/, "");
  else if (line.startsWith("# ")) line = line.replace(/^#\s+/, "");
  if (line.startsWith("*   ")) line = `\u2022 ${line.slice(4)}`;
  if (line.startsWith("- ")) line = `\u2022 ${line.slice(2)}`;
  line = line.replace(/\*\*/g, "");

  const out: FeishuPostElement[] = [];
  let rest = line;
  let match: RegExpMatchArray | null;
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/;
  while ((match = rest.match(linkRe))) {
    const before = rest.slice(0, match.index);
    if (before) out.push({ tag: "text", text: before });
    out.push({ tag: "a", text: match[1]!, href: match[2]! });
    rest = rest.slice((match.index ?? 0) + match[0].length);
  }
  if (rest) out.push({ tag: "text", text: rest });
  return out.length ? out : [{ tag: "text", text: "" }];
}

function stripMarkdownInline(raw: string): string {
  return raw
    .trim()
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1 $2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/^[-*]\s+/, "")
    .replace(/^#{1,6}\s+/, "")
    .trim();
}

function parseMetaLine(line: string): { key: string; value: string } | null {
  const cleaned = line.replace(/\*\*/g, "").trim();
  const match = cleaned.match(/^([^:：]{2,12})[:：]\s*(.+)$/);
  if (!match) return null;
  return { key: match[1]!.trim(), value: match[2]!.trim() };
}

function extractRemoteUrl(markdown: string, metaLines: string[]): string | undefined {
  const candidates = [...metaLines, ...markdown.split(/\r?\n/).slice(-30)];
  for (const line of candidates) {
    if (!/(远端地址|报告地址|在线地址|查看全文|完整报告|全文链接|remote|url)/i.test(line)) continue;
    const match = line.match(/https?:\/\/\S+/);
    if (match) return match[0]!.replace(/[)\]，。；;,.]+$/, "");
  }
  return undefined;
}

function extractSection(markdown: string, headingPattern: RegExp): string[] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => headingPattern.test(line.trim()));
  if (start < 0) return [];

  const sectionLines: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^#{1,2}\s+/.test(line.trim())) break;
    sectionLines.push(line);
  }
  return sectionLines;
}

export function extractReportSummary(markdown: string): ReportSummary {
  const lines = markdown.split(/\r?\n/);
  const title = lines.find((line) => line.startsWith("# "))?.replace(/^#\s+/, "").trim() || "AI 开发者报告";
  const firstSection = lines.findIndex((line, index) => index > 0 && /^##\s+/.test(line.trim()));
  const metaLines = (firstSection >= 0 ? lines.slice(1, firstSection) : lines.slice(1))
    .map((line) => line.trim())
    .filter((line) => line && line !== "---");

  let generatedAt: string | undefined;
  let source: string | undefined;
  for (const line of metaLines) {
    const meta = parseMetaLine(line);
    if (!meta) continue;
    if (/生成时间|时间|日期/.test(meta.key)) generatedAt = meta.value;
    if (/来源|数据源/.test(meta.key)) source = meta.value;
  }

  const highlightLines = extractSection(markdown, /^##\s*(今日要点|核心要点|要点|摘要)\s*$/);
  const highlights = highlightLines
    .map(stripMarkdownInline)
    .filter((line) => line && line !== "---")
    .filter((line) => !/^#{1,6}\s+/.test(line));

  return {
    title,
    generatedAt,
    source,
    remoteUrl: extractRemoteUrl(markdown, metaLines),
    highlights,
  };
}

function payloadSize(title: string, content: FeishuPostElement[][]): number {
  return Buffer.byteLength(JSON.stringify(toPayload(title, content)), "utf8");
}

function toPayload(title: string, content: FeishuPostElement[][]): FeishuPostMessage {
  return {
    msg_type: "post",
    content: {
      post: {
        zh_cn: {
          title,
          content,
        },
      },
    },
  };
}

function elementText(element: FeishuPostElement): string {
  return element.tag === "a" ? `${element.text} ${element.href}` : element.text;
}

function splitOversizedLine(title: string, introLines: FeishuPostElement[][], line: FeishuPostElement[], maxBytes: number): FeishuPostElement[][] {
  if (payloadSize(title, [...introLines, line]) <= maxBytes) return [line];

  const text = line.map(elementText).join("");
  const chunks: FeishuPostElement[][] = [];
  let remaining = text;
  while (remaining.length > 0) {
    let size = Math.min(remaining.length, 1000);
    let chunk = remaining.slice(0, size);
    while (size > 1 && payloadSize(title, [...introLines, [{ tag: "text", text: chunk }]]) > maxBytes) {
      size = Math.max(1, Math.floor(size * 0.8));
      chunk = remaining.slice(0, size);
    }
    chunks.push([{ tag: "text", text: chunk }]);
    remaining = remaining.slice(size);
  }
  return chunks;
}

export function buildFeishuPostMessages(options: {
  markdown: string;
  reportPath?: string;
  maxBytes?: number;
}): FeishuPostMessage[] {
  const maxBytes = options.maxBytes ?? 13_000;
  const summary = extractReportSummary(options.markdown);
  const messageTitle = `${summary.title}｜今日要点`;
  const introLines: FeishuPostElement[][] = [];
  if (summary.generatedAt || summary.source) {
    introLines.push([
      {
        tag: "text",
        text: [summary.generatedAt ? `生成时间：${summary.generatedAt}` : "", summary.source ? `来源：${summary.source}` : ""]
          .filter(Boolean)
          .join("  |  "),
      },
    ]);
  }
  introLines.push([{ tag: "text", text: "" }], [{ tag: "text", text: "────────────────" }]);

  const highlights = summary.highlights.length > 0 ? summary.highlights : ["这份报告没有找到“今日要点”章节，请打开完整报告查看。"];
  const bodyLines = highlights.map((line, index) => markdownLineToFeishuElements(`${index + 1}. ${line}`));
  const outroLines: FeishuPostElement[][] = [];
  if (summary.remoteUrl) {
    outroLines.push(
      [{ tag: "text", text: "" }],
      [{ tag: "a", text: "点击查看完整报告", href: summary.remoteUrl }],
    );
  }

  const baseLines = [...introLines, ...bodyLines, ...outroLines];
  const messages: FeishuPostMessage[] = [];
  let current: FeishuPostElement[][] = [];
  let part = 1;
  const partTitle = () => (part === 1 ? messageTitle : `${messageTitle}（${part}）`);
  const pushCurrent = () => {
    if (current.length === 0) return;
    messages.push(toPayload(partTitle(), current));
    part += 1;
    current = [];
  };
  const appendLine = (line: FeishuPostElement[]) => {
    for (const chunk of splitOversizedLine(partTitle(), [], line, maxBytes)) {
      const candidate = [...current, chunk];
      if (payloadSize(partTitle(), candidate) > maxBytes && current.length > 0) {
        pushCurrent();
      }
      current = [...current, chunk];
    }
  };

  for (const line of baseLines) appendLine(line);

  pushCurrent();
  if (messages.length === 0) messages.push(toPayload(messageTitle, baseLines));
  return messages;
}

export async function sendFeishuWebhook(webhook: string, messages: FeishuPostMessage[]): Promise<void> {
  for (const [index, message] of messages.entries()) {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(message),
    });
    const text = await response.text();
    let parsed: { code?: number; msg?: string; StatusCode?: number; StatusMessage?: string } | undefined;
    try {
      parsed = JSON.parse(text);
    } catch {
      // fall through to response check
    }
    if (!response.ok || parsed?.code !== 0) {
      throw new Error(`\u98de\u4e66 webhook \u53d1\u9001\u5931\u8d25\uff0c\u7b2c ${index + 1} \u6761\uff1aHTTP ${response.status} ${text}`);
    }
    console.error(`[feishu-sender] \u98de\u4e66\u5bcc\u6587\u672c\u6d88\u606f ${index + 1}/${messages.length} \u53d1\u9001\u6210\u529f\u3002`);
  }
}

// ---------------------------------------------------------------------------
// \u81ea\u52a8\u67e5\u627e\u6700\u65b0\u62a5\u544a
// ---------------------------------------------------------------------------

/**
 * \u4ece\u9879\u76ee\u6839\u76ee\u5f55\u626b\u63cf YYYY-MM/DD/HHMMSS-*.md \u7ed3\u6784\uff0c\u8fd4\u56de\u6700\u65b0\u7684\u62a5\u544a\u8def\u5f84\u3002
 * projectRoot \u9ed8\u8ba4\u4e3a\u811a\u672c\u6240\u5728\u76ee\u5f55\u5411\u4e0a\u56db\u7ea7\uff08scripts/ \u2192 feishu-sender/ \u2192 skills/ \u2192 .agents/ \u2192 \u9879\u76ee\u6839\uff09
 */
export async function findLatestReport(projectRoot: string): Promise<string | null> {
  const candidateRoots = [
    projectRoot,
    path.join(projectRoot, ".x-follow-report", "report-outputs"),
    path.join(projectRoot, "report-outputs"),
  ];
  const monthDirs: string[] = [];

  for (const root of candidateRoots) {
    let entries: string[] = [];
    try {
      entries = await readdir(root);
    } catch {
      continue;
    }
    monthDirs.push(
      ...entries
        .filter((e) => /^\d{4}-\d{2}$/.test(e))
        .map((e) => path.join(root, e)),
    );
  }
  if (monthDirs.length === 0) return null;

  const reports: { filePath: string; mtime: number }[] = [];
  for (const monthDir of monthDirs) {
    let dayDirs: string[] = [];
    try {
      dayDirs = (await readdir(monthDir))
        .filter((e) => /^\d{2}$/.test(e))
        .map((e) => path.join(monthDir, e));
    } catch {
      continue;
    }
    for (const dayDir of dayDirs) {
      let files: string[] = [];
      try {
        files = (await readdir(dayDir))
        .filter((e) => e.endsWith(".md"))
        .filter((e) => !/(预览|preview|template)/i.test(e))
        .map((e) => path.join(dayDir, e));
      } catch {
        continue;
      }
      for (const filePath of files) {
        try {
          const s = await stat(filePath);
          reports.push({ filePath, mtime: s.mtimeMs });
        } catch {
          // skip
        }
      }
    }
  }

  if (reports.length === 0) return null;
  reports.sort((a, b) => b.mtime - a.mtime);
  return reports[0]!.filePath;
}

// ---------------------------------------------------------------------------
// .env \u8bfb\u53d6\u4e0e\u5f15\u5bfc\u5199\u5165
// ---------------------------------------------------------------------------

/**
 * \u4ece .env \u6587\u4ef6\u4e2d\u8bfb\u53d6\u6307\u5b9a key \u7684\u503c\uff08\u53ea\u652f\u6301\u7b80\u5355 KEY=VALUE \u884c\uff09\u3002
 */
function readEnvFile(envPath: string): Record<string, string> {
  if (!existsSync(envPath)) return {};
  try {
    const text = readFileSync(envPath, "utf8");
    const result: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (key) result[key] = val;
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * \u5411 .env \u6587\u4ef6\u8ffd\u52a0\u4e00\u884c KEY=VALUE\u3002
 */
async function appendEnvVar(envPath: string, key: string, value: string): Promise<void> {
  const line = `\n${key}=${value}\n`;
  await appendFile(envPath, line, "utf8");
}

/**
 * \u4ece\u7ec8\u7aef\u8bfb\u53d6\u4e00\u884c\u7528\u6237\u8f93\u5165\u3002
 */
function promptInput(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * \u89e3\u6790 webhook\uff1a\u4f18\u5148\u7ea7 --webhook \u53c2\u6570 > FEISHU_WEBHOOK \u73af\u5883\u53d8\u91cf > .env \u6587\u4ef6 > \u4ea4\u4e92\u5f15\u5bfc\u5199\u5165 .env\u3002
 */
async function resolveWebhook(cliWebhook: string, envFilePath: string, dryRun: boolean): Promise<string> {
  if (cliWebhook) return cliWebhook;
  if (process.env.FEISHU_WEBHOOK) return process.env.FEISHU_WEBHOOK;

  const envVars = readEnvFile(envFilePath);
  if (envVars.FEISHU_WEBHOOK) {
    console.error(`[feishu-sender] \u5df2\u4ece .env \u8bfb\u53d6 FEISHU_WEBHOOK\u3002`);
    return envVars.FEISHU_WEBHOOK;
  }

  if (dryRun) {
    return "https://dry-run-placeholder";
  }

  console.error(`[feishu-sender] \u672a\u627e\u5230\u98de\u4e66 webhook \u5730\u5740\u3002`);
  console.error(`  \u8bf7\u524d\u5f80\u98de\u4e66\u7fa4 \u2192 \u673a\u5668\u4eba \u2192 \u81ea\u5b9a\u4e49\u673a\u5668\u4eba \u2192 \u590d\u5236 webhook URL\u3002`);
  const url = await promptInput("\u8bf7\u8f93\u5165\u98de\u4e66 webhook URL\uff1a");
  if (!url.startsWith("https://")) {
    throw new Error("webhook \u5730\u5740\u683c\u5f0f\u4e0d\u6b63\u786e\uff0c\u5e94\u4ee5 https:// \u5f00\u5934\u3002");
  }
  await appendEnvVar(envFilePath, "FEISHU_WEBHOOK", url);
  console.error(`[feishu-sender] webhook \u5df2\u4fdd\u5b58\u5230 ${envFilePath}\uff08\u5df2\u5728 .gitignore \u4e2d\u5ffd\u7565\uff09\u3002`);
  return url;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printUsage(exitCode: number): never {
  const command = process.argv[1] ? `bun ${path.basename(process.argv[1])}` : "bun feishu.ts";
  console.log(`\u98de\u4e66 webhook \u5bcc\u6587\u672c\u53d1\u9001

\u7528\u6cd5\uff1a
  ${command} [--report <report.md>] [--webhook <url>]
  FEISHU_WEBHOOK=<url> ${command}

\u9009\u9879\uff1a
  --report <path>         \u8981\u53d1\u9001\u7684 Markdown \u62a5\u544a\uff08\u7701\u7565\u65f6\u81ea\u52a8\u9009\u6700\u65b0\u62a5\u544a\uff09
  --webhook <url>         \u98de\u4e66\u81ea\u5b9a\u4e49\u673a\u5668\u4eba webhook\uff08\u4e5f\u53ef\u7528 FEISHU_WEBHOOK \u6216 .env\uff09
  --max-bytes <n>         \u5355\u6761\u5bcc\u6587\u672c payload \u5b57\u8282\u4e0a\u9650\uff0c\u9ed8\u8ba4 13000
  --dry-run               \u53ea\u6253\u5370\u5206\u7247\u4fe1\u606f\uff0c\u4e0d\u5b9e\u9645\u53d1\u9001
  --project-root <dir>    \u9879\u76ee\u6839\u76ee\u5f55\uff08\u7528\u4e8e\u67e5\u627e\u6700\u65b0\u62a5\u544a\u548c .env\uff09\uff0c\u9ed8\u8ba4\u81ea\u52a8\u63a8\u65ad
  --help, -h              \u663e\u793a\u5e2e\u52a9
`);
  process.exit(exitCode);
}

function requireValue(option: string, value: string | undefined): string {
  if (!value) throw new Error(`${option} \u7f3a\u5c11\u503c`);
  return value;
}

async function main(): Promise<void> {
  let reportPath = "";
  let cliWebhook = "";
  let maxBytes = 13_000;
  let dryRun = false;
  let projectRoot = "";

  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") printUsage(0);
    else if (arg === "--report") reportPath = requireValue(arg, argv[++i]);
    else if (arg === "--webhook") cliWebhook = requireValue(arg, argv[++i]);
    else if (arg === "--max-bytes") maxBytes = Number.parseInt(requireValue(arg, argv[++i]), 10);
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--project-root") projectRoot = requireValue(arg, argv[++i]);
    else throw new Error(`\u672a\u77e5\u53c2\u6570\uff1a${arg}`);
  }

  if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error("--max-bytes \u5fc5\u987b\u662f\u6b63\u6574\u6570");

  // \u63a8\u65ad\u9879\u76ee\u6839\u76ee\u5f55\uff1ascripts/ \u2192 feishu-sender/ \u2192 skills/ \u2192 .agents/ \u2192 \u9879\u76ee\u6839
  if (!projectRoot) {
    const scriptDir = path.dirname(path.resolve(process.argv[1] ?? "."));
    projectRoot = path.resolve(scriptDir, "../../../../");
  }

  // \u81ea\u52a8\u67e5\u627e\u6700\u65b0\u62a5\u544a
  if (!reportPath) {
    const latest = await findLatestReport(projectRoot);
    if (!latest) throw new Error("\u672a\u627e\u5230\u4efb\u4f55\u62a5\u544a\u6587\u4ef6\uff0c\u8bf7\u7528 --report \u6307\u5b9a\u8def\u5f84\u3002");
    reportPath = latest;
    console.error(`[feishu-sender] \u81ea\u52a8\u9009\u62e9\u6700\u65b0\u62a5\u544a\uff1a${reportPath}`);
  }

  // \u89e3\u6790 webhook
  const envFilePath = path.join(projectRoot, ".env");
  const webhook = await resolveWebhook(cliWebhook, envFilePath, dryRun);

  const markdown = await readFile(reportPath, "utf8");
  const messages = buildFeishuPostMessages({ markdown, reportPath, maxBytes });
  console.error(`[feishu-sender] \u51c6\u5907\u53d1\u9001 ${messages.length} \u6761\u98de\u4e66\u5bcc\u6587\u672c\u6d88\u606f\u3002`);

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          report: reportPath,
          messages: messages.length,
          bytes: messages.map((message) => Buffer.byteLength(JSON.stringify(message), "utf8")),
        },
        null,
        2,
      ),
    );
    return;
  }

  await sendFeishuWebhook(webhook, messages);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`[feishu-sender] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
