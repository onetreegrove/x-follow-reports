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
  if (line.startsWith("### ")) line = `\u25cc ${line.replace(/^###\s+/, "")}`;
  else if (line.startsWith("## ")) line = `\u300c${line.replace(/^##\s+/, "")}\u300d`;
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

function markdownSections(markdown: string): { title: string; metaLines: string[]; sections: string[] } {
  const lines = markdown.split(/\r?\n/);
  const title = lines.find((line) => line.startsWith("# "))?.replace(/^#\s+/, "").trim() || "AI \u5f00\u53d1\u8005\u62a5\u544a";
  const metaEnd = lines.findIndex((line) => line.trim() === "---");
  let metaLines: string[];
  let bodyLines: string[];

  if (metaEnd >= 0) {
    metaLines = lines.slice(1, metaEnd);
    bodyLines = lines.slice(metaEnd + 1);
  } else {
    const firstSection = lines.findIndex((line, index) => index > 0 && /^##\s+/.test(line));
    metaLines = firstSection >= 0 ? lines.slice(1, firstSection) : lines.slice(1);
    bodyLines = firstSection >= 0 ? lines.slice(firstSection) : [];
  }

  const body = bodyLines.join("\n");
  const sections = body
    .replace(/\n(?=##\s+)/g, "\n---\n")
    .replace(/\n(?=###\s+)/g, "\n---\n")
    .split(/\n---\n/g)
    .map((section) => section.trim())
    .filter(Boolean);
  metaLines = metaLines.map((line) => line.trim()).filter(Boolean);
  return { title, metaLines, sections };
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
  const { title, metaLines, sections } = markdownSections(options.markdown);
  const introLines: FeishuPostElement[][] = [
    [{ tag: "text", text: title }],
    ...metaLines.map((line) => markdownLineToFeishuElements(line)),
  ];
  if (options.reportPath) introLines.push([{ tag: "text", text: `\u62a5\u544a\u8def\u5f84\uff1a${options.reportPath}` }]);
  introLines.push([{ tag: "text", text: "" }]);

  const messages: FeishuPostMessage[] = [];
  let current = [...introLines];
  let part = 1;
  const partTitle = () => `${title}\uff08${part}\uff09`;
  const pushCurrent = () => {
    if (current.length <= introLines.length) return;
    messages.push(toPayload(partTitle(), current));
    part += 1;
    current = [...introLines];
  };
  const appendLine = (line: FeishuPostElement[]) => {
    for (const chunk of splitOversizedLine(partTitle(), introLines, line, maxBytes)) {
      const candidate = [...current, chunk];
      if (payloadSize(partTitle(), candidate) > maxBytes && current.length > introLines.length) {
        pushCurrent();
      }
      current = [...current, chunk];
    }
  };

  for (const section of sections) {
    const sectionLines = section.split(/\r?\n/);
    const isHeadingSection = /^#{2,3}\s+/.test(sectionLines[0]?.trim() ?? "");
    const richLines = [
      ...(isHeadingSection ? [[{ tag: "text" as const, text: "" }]] : []),
      ...sectionLines.map(markdownLineToFeishuElements),
      ...(isHeadingSection && /^###\s+/.test(sectionLines[0]?.trim() ?? "")
        ? [[{ tag: "text" as const, text: "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500" }]]
        : []),
      [{ tag: "text" as const, text: "" }],
    ];

    for (const line of richLines) appendLine(line);
  }

  pushCurrent();
  if (messages.length === 0) messages.push(toPayload(title, introLines));
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
  let monthDirs: string[] = [];
  try {
    const entries = await readdir(projectRoot);
    monthDirs = entries
      .filter((e) => /^\d{4}-\d{2}$/.test(e))
      .map((e) => path.join(projectRoot, e));
  } catch {
    return null;
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
