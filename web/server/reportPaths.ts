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
