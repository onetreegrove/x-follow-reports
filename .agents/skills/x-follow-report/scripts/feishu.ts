import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

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
  if (line.startsWith("### ")) line = `▌ ${line.replace(/^###\s+/, "")}`;
  else if (line.startsWith("## ")) line = `【${line.replace(/^##\s+/, "")}】`;
  else if (line.startsWith("# ")) line = line.replace(/^#\s+/, "");
  if (line.startsWith("*   ")) line = `• ${line.slice(4)}`;
  if (line.startsWith("- ")) line = `• ${line.slice(2)}`;
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
  const title = lines.find((line) => line.startsWith("# "))?.replace(/^#\s+/, "").trim() || "AI 开发者报告";
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
  if (options.reportPath) introLines.push([{ tag: "text", text: `报告路径：${options.reportPath}` }]);
  introLines.push([{ tag: "text", text: "" }]);

  const messages: FeishuPostMessage[] = [];
  let current = [...introLines];
  let part = 1;
  const partTitle = () => `${title}（${part}）`;
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
        ? [[{ tag: "text" as const, text: "────────────────" }]]
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
      throw new Error(`飞书 webhook 发送失败，第 ${index + 1} 条：HTTP ${response.status} ${text}`);
    }
    console.error(`[x-follow-report] 飞书富文本消息 ${index + 1}/${messages.length} 发送成功。`);
  }
}

function printUsage(exitCode: number): never {
  const command = process.argv[1] ? `bun ${path.basename(process.argv[1])}` : "bun feishu.ts";
  console.log(`飞书 webhook 富文本发送

用法：
  ${command} --report <report.md> --webhook <url>
  FEISHU_WEBHOOK=<url> ${command} --report <report.md>

选项：
  --report <path>       要发送的 Markdown 报告
  --webhook <url>       飞书自定义机器人 webhook，也可用 FEISHU_WEBHOOK
  --max-bytes <n>       单条富文本 payload 字节上限，默认 13000
  --dry-run             只打印将发送的消息数量，不实际发送
  --help, -h            显示帮助
`);
  process.exit(exitCode);
}

function requireValue(option: string, value: string | undefined): string {
  if (!value) throw new Error(`${option} 缺少值`);
  return value;
}

async function main(): Promise<void> {
  let reportPath = "";
  let webhook = process.env.FEISHU_WEBHOOK || "";
  let maxBytes = 13_000;
  let dryRun = false;

  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") printUsage(0);
    else if (arg === "--report") reportPath = requireValue(arg, argv[++i]);
    else if (arg === "--webhook") webhook = requireValue(arg, argv[++i]);
    else if (arg === "--max-bytes") maxBytes = Number.parseInt(requireValue(arg, argv[++i]), 10);
    else if (arg === "--dry-run") dryRun = true;
    else throw new Error(`未知参数：${arg}`);
  }

  if (!reportPath) throw new Error("缺少 --report <path>");
  if (!dryRun && !webhook) throw new Error("缺少 --webhook <url> 或 FEISHU_WEBHOOK");
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error("--max-bytes 必须是正整数");

  const markdown = await readFile(reportPath, "utf8");
  const messages = buildFeishuPostMessages({ markdown, reportPath, maxBytes });
  console.error(`[x-follow-report] 准备发送 ${messages.length} 条飞书富文本消息。`);
  if (dryRun) {
    console.log(JSON.stringify({ messages: messages.length, bytes: messages.map((message) => Buffer.byteLength(JSON.stringify(message), "utf8")) }, null, 2));
    return;
  }
  await sendFeishuWebhook(webhook, messages);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`[x-follow-report] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
