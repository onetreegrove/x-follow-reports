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
