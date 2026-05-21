import { inferKindFromPath, relativePathToId } from "./reportPaths";
import type { ReportKind, ReportSummary } from "./types";

export function parseReportMarkdown(markdown: string, relativePath: string, createdAtMs: number): ReportSummary {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || relativePath.split("/").at(-1) || "未命名报告";
  const generatedAt = markdown.match(/^生成时间：(.+?)(?:\s{2,})?$/m)?.[1]?.trim();
  const period = markdown.match(/^覆盖时间：(.+?)(?:\s{2,})?$/m)?.[1]?.trim();
  const source = markdown.match(/^来源：(.+?)(?:\s{2,})?$/m)?.[1]?.trim();
  const kindFromPath = inferKindFromPath(relativePath);
  const kind = kindFromPath === "未知" ? inferKindFromTitle(title) : kindFromPath;

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

function inferKindFromTitle(title: string): ReportKind {
  if (title.includes("早报")) return "早报";
  if (title.includes("午报")) return "午报";
  if (title.includes("晚报")) return "晚报";
  return "未知";
}

function extractExcerpt(markdown: string): string {
  const keyPoints = markdown.match(/## 今日要点\s+([\s\S]*?)(?:\n##\s+|$)/);
  if (keyPoints?.[1]) {
    return keyPoints[1].replace(/\s+/g, " ").trim().slice(0, 240);
  }

  const paragraph = markdown
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .find(
      (part) =>
        part &&
        !part.startsWith("#") &&
        !part.startsWith("生成时间：") &&
        !part.startsWith("覆盖时间：") &&
        !part.startsWith("来源：")
    );
  return (paragraph || "").replace(/\s+/g, " ").slice(0, 240);
}

function countItems(markdown: string): number | undefined {
  const section = markdown.match(/## 资讯\s+([\s\S]*)/);
  const body = section?.[1] || markdown;
  const count = (body.match(/^###\s+/gm) || []).length || (body.match(/^##\s+(?!今日要点|资讯)/gm) || []).length;
  return count || undefined;
}
