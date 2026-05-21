/**
 * seen-cache.ts
 *
 * 管理"当天已采集的推文 ID"缓存，实现早/午/晚报之间的跨次去重。
 * 缓存文件按日期存储在 data dir：<dataDir>/seen-cache/<YYYY-MM-DD>.json
 * 文件结构：{ date: string; ids: string[] }
 *
 * 规则：
 *  - 早报采集完毕后，将其 ID 写入缓存。
 *  - 午报采集前读取缓存，过滤掉早报已采集的 ID。
 *  - 晚报采集前读取缓存，过滤掉早报+午报已采集的 ID。
 *  - 缓存仅保留当天（本地时区 Asia/Shanghai）的数据，跨天自动作废。
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveDataDir } from "./paths.js";

const TIMEZONE = "Asia/Shanghai";

/** 获取当天本地日期字符串（YYYY-MM-DD，Asia/Shanghai 时区） */
export function todayDateString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function cacheFilePath(date: string): string {
  return path.join(resolveDataDir(), "seen-cache", `${date}.json`);
}

type SeenCacheFile = {
  date: string;
  ids: string[];
};

/**
 * 读取当天的已采集 ID 集合。
 * 若文件不存在或日期不符，返回空集合。
 */
export async function loadSeenIds(now: Date = new Date()): Promise<Set<string>> {
  const today = todayDateString(now);
  const filePath = cacheFilePath(today);
  if (!existsSync(filePath)) return new Set<string>();
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as SeenCacheFile;
    if (parsed.date !== today || !Array.isArray(parsed.ids)) return new Set<string>();
    return new Set<string>(parsed.ids);
  } catch {
    return new Set<string>();
  }
}

/**
 * 将新采集到的 ID 合并追加到当天缓存文件。
 * 自动去重，幂等。
 */
export async function saveSeenIds(newIds: Iterable<string>, now: Date = new Date()): Promise<void> {
  const today = todayDateString(now);
  const filePath = cacheFilePath(today);
  const existing = await loadSeenIds(now);
  for (const id of newIds) existing.add(id);
  const payload: SeenCacheFile = { date: today, ids: Array.from(existing) };
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}
