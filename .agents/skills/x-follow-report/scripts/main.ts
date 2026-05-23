import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";

import { DEFAULT_CONFIG, loadExtendConfigWithWarnings, mergeConfig, parseExtendConfigText, parseExtendConfigTextWithWarnings } from "./config.js";
import { hasRequiredCookies, loadCookies, saveCookies } from "./cookies.js";
import { buildReportMaterials } from "./materials.js";
import { resolveConsentPath } from "./paths.js";
import { extractTimelineTweets } from "./timeline.js";
import type { NormalizedTweet, ReportKind, ReportMaterials, RunConfig, TimelineKind, WriteMaterialOptions } from "./types.js";
import { fetchTimelinePage } from "./xapi.js";

export { parseExtendConfigText, parseExtendConfigTextWithWarnings };

const DISCLAIMER_VERSION = "1.0";

type CliArgs = Partial<RunConfig> & {
  help: boolean;
  login: boolean;
  json: boolean;
  acceptDanger: boolean;
  materialsFile?: string;
};

function commandName(): string {
  const script = process.argv[1] ? path.relative(process.cwd(), process.argv[1]) : "main.ts";
  return `bun ${script}`;
}

function printUsage(exitCode: number): never {
  const cmd = commandName();
  console.log(`X 关注流报告

用法：
  ${cmd}
  ${cmd} --timeline following --max-items 200 --lookback-hours 24
  ${cmd} --login

选项：
  --timeline <following|home>     时间线类型，默认 following
  --max-items <n>                 最多采集条目数，默认 200
  --lookback-hours <n>            回看小时数，默认 24
  --output-dir <path>             输出根目录，默认当前项目根目录
  --include-replies               包含回复
  --no-reposts                    排除转发
  --accept-danger                 非交互环境中接受非官方接口免责声明
  --json                          输出 JSON 摘要
  --materials-file <path>          输出报告素材 JSON 到指定文件
  --login                         通过 Chrome 登录/刷新 cookie
  --help, -h                      显示帮助

环境变量：
  X_AUTH_TOKEN / X_CT0            优先使用的 X cookie
  X_FOLLOWING_TIMELINE_QUERY_ID   手动指定 Following 时间线 queryId
  X_HOME_TIMELINE_QUERY_ID        手动指定 Home 时间线 queryId
`);
  process.exit(exitCode);
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { help: false, login: false, json: false, acceptDanger: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--login") args.login = true;
    else if (a === "--json") args.json = true;
    else if (a === "--materials-file") args.materialsFile = requireValue(a, argv[++i]);
    else if (a === "--accept-danger") args.acceptDanger = true;
    else if (a === "--include-replies") args.includeReplies = true;
    else if (a === "--no-reposts") args.includeReposts = false;
    else if (a === "--timeline") args.timeline = parseTimelineValue(argv[++i]);
    else if (a === "--max-items") args.maxItems = parseIntValue(a, argv[++i]);
    else if (a === "--lookback-hours") args.lookbackHours = parseIntValue(a, argv[++i]);
    else if (a === "--output-dir") args.outputDir = requireValue(a, argv[++i]);
    else throw new Error(`未知参数：${a}`);
  }
  return args;
}

function requireValue(option: string, value: string | undefined): string {
  if (!value) throw new Error(`${option} 缺少值`);
  return value;
}

function parseIntValue(option: string, value: string | undefined): number {
  const parsed = Number.parseInt(requireValue(option, value), 10);
  if (!Number.isFinite(parsed)) throw new Error(`${option} 必须是整数`);
  return parsed;
}

function parseTimelineValue(value: string | undefined): TimelineKind {
  const raw = requireValue("--timeline", value);
  if (raw !== "following" && raw !== "home") throw new Error("--timeline 只能是 following 或 home");
  return raw;
}

export function formatLocalTimestamp(date: Date): string {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return formatter.format(date).replace(" ", "T");
}

function reportKind(now: Date): ReportKind {
  const hour = Number(formatLocalTimestamp(now).slice(11, 13));
  if (hour < 12) return "早报";
  if (hour < 14) return "午报";
  return "晚报";
}

async function promptYesNo(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
    return ["y", "yes", "是", "同意"].includes(answer.trim().toLowerCase());
  } finally {
    rl.close();
  }
}

async function ensureConsent(acceptDanger: boolean, log: (message: string) => void): Promise<void> {
  const consentPath = resolveConsentPath();
  try {
    if (existsSync(consentPath)) {
      const parsed = JSON.parse(await readFile(consentPath, "utf8"));
      if (parsed?.accepted === true && parsed?.disclaimerVersion === DISCLAIMER_VERSION) {
        log(`[x-follow-report] 警告：正在使用非官方 X Web/API 行为。已接受时间：${parsed.acceptedAt}`);
        return;
      }
    }
  } catch {
    // fall through to prompt
  }

  log(`免责声明

此脚本会使用以你的账号身份认证的非官方 X Web/API 行为。

风险：
- X 可能随时改变接口或响应结构。
- 请求可能失败、被限流，或要求重新登录。
- 过度抓取可能影响你的 X 账号。
- 结果可能不完整，因为时间线具有个性化和不稳定性。
`);

  const accepted = acceptDanger || await promptYesNo("接受这些风险并继续？(y/N): ");
  if (!accepted) throw new Error("用户未接受免责声明，已停止。");

  await mkdir(path.dirname(consentPath), { recursive: true });
  await writeFile(
    consentPath,
    JSON.stringify({ version: 1, accepted: true, acceptedAt: new Date().toISOString(), disclaimerVersion: DISCLAIMER_VERSION }, null, 2),
    "utf8"
  );
  log(`[x-follow-report] 同意记录已保存：${consentPath}`);
}

function isWithinLookback(tweet: NormalizedTweet, lookbackHours: number): boolean {
  const created = Date.parse(tweet.createdAt);
  if (Number.isNaN(created)) return true;
  return Date.now() - created <= lookbackHours * 60 * 60 * 1000;
}

export function reportPath(outputDir: string, now: Date): string {
  const stamp = formatLocalTimestamp(now);
  const month = stamp.slice(0, 7);
  const day = stamp.slice(8, 10);
  const time = stamp.slice(11).replace(/:/g, "");
  return path.resolve(outputDir, month, day, `${time}-${reportKind(now)}.md`);
}

function sourceLabel(timeline: TimelineKind): string {
  return timeline === "home" ? "X 主页时间线" : "X 关注时间线";
}

export async function writeMaterialOutputs(options: WriteMaterialOptions): Promise<ReportMaterials> {
  const now = options.now ?? new Date();
  const pathToReport = reportPath(options.outputDir, now);
  return buildReportMaterials({
    tweets: options.tweets,
    outputPath: pathToReport,
    timeline: options.timeline,
    reportKind: reportKind(now),
    generatedAt: formatLocalTimestamp(now),
    sourceLabel: sourceLabel(options.timeline),
    periodStart: options.periodStart,
    periodEnd: options.periodEnd,
    skipped: options.skipped,
    errors: options.errors,
    warnings: options.warnings,
  });
}

export function formatMaterialsJson(materials: ReportMaterials, options: { rawTweets?: NormalizedTweet[] } = {}): string {
  const payload = options.rawTweets ? { ...materials, rawTweets: options.rawTweets } : materials;
  return JSON.stringify(payload, null, 2);
}

type FetchTimelinePage = typeof fetchTimelinePage;

export async function collectTimeline(
  config: RunConfig,
  cookieMap: Record<string, string>,
  log: (message: string) => void,
  fetchPage: FetchTimelinePage = fetchTimelinePage
) {
  let pageCount = 0;
  const tweets: NormalizedTweet[] = [];
  const seen = new Set<string>();
  const errors: string[] = [];
  let cursor: string | undefined;
  let skipped = 0;
  let emptyPages = 0;

  while (tweets.length < config.maxItems) {
    let page: unknown;
    try {
      page = await fetchPage({
        timeline: config.timeline,
        cookieMap,
        count: Math.min(40, Math.max(1, config.maxItems - tweets.length)),
        cursor,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      if (tweets.length > 0) {
        log(`[x-follow-report] 抓取中断，保留已采集 ${tweets.length} 条：${message}`);
        break;
      }
      throw error;
    }
    pageCount++;

    const extracted = extractTimelineTweets(page, {
      timeline: config.timeline,
      includeReplies: config.includeReplies,
      includeReposts: config.includeReposts,
    });
    skipped += extracted.skipped;

    let added = 0;
    let withinLookback = 0;
    for (const tweet of extracted.tweets) {
      if (!isWithinLookback(tweet, config.lookbackHours)) continue;
      withinLookback++;
      if (seen.has(tweet.tweetId)) continue;
      seen.add(tweet.tweetId);
      tweets.push(tweet);
      added++;
      if (tweets.length >= config.maxItems) break;
    }
    emptyPages = added === 0 ? emptyPages + 1 : 0;
    log(`[x-follow-report] 页面 ${pageCount}: 新增 ${added} 条，累计 ${tweets.length} 条。`);

    cursor = extracted.bottomCursor;
    const allExtractedTweetsAreOld = extracted.tweets.length > 0 && withinLookback === 0;
    if (!cursor || allExtractedTweetsAreOld || emptyPages >= 2) break;
  }

  return { tweets, skipped, errors };
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help) printUsage(0);

  const log = (message: string) => console.error(message);
  await ensureConsent(cli.acceptDanger, log);

  const cookieMap = await loadCookies({ login: cli.login, log });
  if (cli.login) {
    if (!hasRequiredCookies(cookieMap)) throw new Error("登录后仍缺少 auth_token 或 ct0。");
    const cookiePath = await saveCookies(cookieMap);
    log(`[x-follow-report] cookie 已刷新：${cookiePath}`);
    return;
  }
  if (!hasRequiredCookies(cookieMap)) {
    throw new Error("缺少 X 凭据。请设置 X_AUTH_TOKEN/X_CT0，或运行 --login 刷新 cookie。");
  }

  const extendConfig = await loadExtendConfigWithWarnings();
  const configWarnings = extendConfig.warnings.map((warning) => `${extendConfig.path ?? "EXTEND.md"}:${warning.line} ${warning.message}`);
  for (const warning of configWarnings) log(`[x-follow-report] 配置警告：${warning}`);

  const config = mergeConfig(DEFAULT_CONFIG, extendConfig.config, cli);
  const periodEnd = new Date().toISOString();
  const periodStart = new Date(Date.now() - config.lookbackHours * 60 * 60 * 1000).toISOString();
  const collection = await collectTimeline(config, cookieMap, log);

  const materials = await writeMaterialOutputs({
    tweets: collection.tweets,
    outputDir: config.outputDir,
    timeline: config.timeline,
    periodStart,
    periodEnd,
    skipped: collection.skipped,
    errors: collection.errors,
    warnings: configWarnings,
  });
  if (cli.materialsFile) {
    await mkdir(path.dirname(cli.materialsFile), { recursive: true });
    await writeFile(cli.materialsFile, formatMaterialsJson(materials), "utf8");
    console.log(cli.materialsFile);
  } else {
    console.log(formatMaterialsJson(materials, { rawTweets: cli.json ? collection.tweets : undefined }));
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`[x-follow-report] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
