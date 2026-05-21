import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import type { RunConfig, TimelineKind } from "./types.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "../../../..");

export const DEFAULT_CONFIG: RunConfig = {
  outputDir: path.join(PROJECT_ROOT, ".x-follow-report", "report-outputs"),
  timeline: "following",
  maxItems: 100,
  lookbackHours: 24,
  includeReplies: false,
  includeReposts: true,
};

type PartialConfig = Partial<RunConfig>;

export type ConfigWarning = {
  line: number;
  message: string;
};

export type ParsedConfig = {
  config: PartialConfig;
  warnings: ConfigWarning[];
};

function parseBoolean(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return undefined;
}

function parseTimeline(value: string): TimelineKind | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === "following" || normalized === "home") return normalized;
  return undefined;
}

function parsePositiveInteger(value: string): number | undefined {
  if (!/^\d+$/.test(value.trim())) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : undefined;
}

export function parseExtendConfigTextWithWarnings(text: string): ParsedConfig {
  const config: PartialConfig = {};
  const warnings: ConfigWarning[] = [];

  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes(":")) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim();
    const value = rest.join(":").trim().replace(/^["']|["']$/g, "");

    if (key === "output_dir") {
      if (value) config.outputDir = value;
      else warnings.push({ line: lineNumber, message: "output_dir 不能为空" });
    } else if (key === "timeline") {
      const parsed = parseTimeline(value);
      if (parsed) config.timeline = parsed;
      else warnings.push({ line: lineNumber, message: "timeline 只能是 following 或 home" });
    } else if (key === "max_items") {
      const parsed = parsePositiveInteger(value);
      if (parsed !== undefined) config.maxItems = parsed;
      else warnings.push({ line: lineNumber, message: "max_items 必须是正整数" });
    } else if (key === "lookback_hours") {
      const parsed = parsePositiveInteger(value);
      if (parsed !== undefined) config.lookbackHours = parsed;
      else warnings.push({ line: lineNumber, message: "lookback_hours 必须是正整数" });
    } else if (key === "include_replies") {
      const parsed = parseBoolean(value);
      if (parsed !== undefined) config.includeReplies = parsed;
      else warnings.push({ line: lineNumber, message: "include_replies 必须是布尔值" });
    } else if (key === "include_reposts") {
      const parsed = parseBoolean(value);
      if (parsed !== undefined) config.includeReposts = parsed;
      else warnings.push({ line: lineNumber, message: "include_reposts 必须是布尔值" });
    } else {
      warnings.push({ line: lineNumber, message: `未知配置项：${key}` });
    }
  }

  return { config, warnings };
}

export function parseExtendConfigText(text: string): PartialConfig {
  return parseExtendConfigTextWithWarnings(text).config;
}

export function resolveConfigPaths(cwd = process.cwd()): string[] {
  const xdg = process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), ".config");
  return [
    path.join(cwd, ".x-follow-report", "EXTEND.md"),
    path.join(xdg, "x-follow-report", "EXTEND.md"),
    path.join(os.homedir(), ".x-follow-report", "EXTEND.md"),
  ];
}

export async function loadExtendConfigWithWarnings(cwd = process.cwd()): Promise<ParsedConfig & { path?: string }> {
  for (const candidate of resolveConfigPaths(cwd)) {
    if (!existsSync(candidate)) continue;
    return { ...parseExtendConfigTextWithWarnings(await readFile(candidate, "utf8")), path: candidate };
  }
  return { config: {}, warnings: [] };
}

export async function loadExtendConfig(cwd = process.cwd()): Promise<PartialConfig> {
  return (await loadExtendConfigWithWarnings(cwd)).config;
}

export function mergeConfig(...parts: PartialConfig[]): RunConfig {
  const merged = Object.assign({}, DEFAULT_CONFIG, ...parts) as RunConfig;
  if (!Number.isFinite(merged.maxItems) || merged.maxItems < 1) merged.maxItems = DEFAULT_CONFIG.maxItems;
  if (!Number.isFinite(merged.lookbackHours) || merged.lookbackHours < 1) {
    merged.lookbackHours = DEFAULT_CONFIG.lookbackHours;
  }
  return merged;
}
