import {
  CdpConnection,
  findChromeExecutable as findChromeExecutableBase,
  findExistingChromeDebugPort,
  gracefulKillChrome,
  getFreePort,
  launchChrome as launchChromeBase,
  openPageSession,
  sleep,
  waitForChromeDebugPort,
  type PlatformCandidates,
} from "baoyu-chrome-cdp";

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { resolveChromeProfileDir, resolveCookiePath } from "./paths.js";

type CookieLike = {
  name?: string;
  value?: string;
  domain?: string;
  path?: string;
  url?: string;
};

const X_COOKIE_NAMES = ["auth_token", "ct0", "gt", "twid"] as const;
const REQUIRED = ["auth_token", "ct0"] as const;

const CHROME_CANDIDATES: PlatformCandidates = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ],
  default: ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge"],
};

function resolveCookieDomain(cookie: CookieLike): string {
  const domain = cookie.domain?.trim();
  if (domain) return domain.startsWith(".") ? domain.slice(1) : domain;
  if (cookie.url) {
    try {
      return new URL(cookie.url).hostname;
    } catch {
      return "";
    }
  }
  return "";
}

function pickCookieValue(cookies: CookieLike[], name: string): string | undefined {
  const matches = cookies.filter((cookie) => cookie.name === name && typeof cookie.value === "string");
  const preferred = matches.find((cookie) => resolveCookieDomain(cookie) === "x.com" && (cookie.path ?? "/") === "/");
  const xDomain = matches.find((cookie) => resolveCookieDomain(cookie).endsWith("x.com"));
  const twitterDomain = matches.find((cookie) => resolveCookieDomain(cookie).endsWith("twitter.com"));
  return (preferred ?? xDomain ?? twitterDomain ?? matches[0])?.value;
}

function buildCookieMap(cookies: CookieLike[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const name of X_COOKIE_NAMES) {
    const value = pickCookieValue(cookies, name);
    if (value) map[name] = value;
  }
  return map;
}

function filterCookieMap(input: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of X_COOKIE_NAMES) {
    if (input[name]) out[name] = input[name];
  }
  return out;
}

export function hasRequiredCookies(cookieMap: Record<string, string>): boolean {
  return REQUIRED.every((name) => Boolean(cookieMap[name]));
}

export function buildCookieHeader(cookieMap: Record<string, string>): string {
  return Object.entries(cookieMap)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

function loadCookiesFromEnv(): Record<string, string> {
  return filterCookieMap({
    auth_token: process.env.X_AUTH_TOKEN?.trim() ?? "",
    ct0: process.env.X_CT0?.trim() ?? "",
    gt: process.env.X_GUEST_TOKEN?.trim() ?? "",
    twid: process.env.X_TWID?.trim() ?? "",
  });
}

async function loadCookiesFromFile(): Promise<Record<string, string>> {
  const cookiePath = resolveCookiePath();
  if (!existsSync(cookiePath)) return {};
  const parsed = JSON.parse(await readFile(cookiePath, "utf8"));
  if (Array.isArray(parsed)) return buildCookieMap(parsed);
  if (parsed && typeof parsed === "object") return filterCookieMap(parsed as Record<string, string>);
  return {};
}

export async function saveCookies(cookieMap: Record<string, string>): Promise<string> {
  const cookiePath = resolveCookiePath();
  await mkdir(path.dirname(cookiePath), { recursive: true });
  await writeFile(cookiePath, JSON.stringify(filterCookieMap(cookieMap), null, 2), "utf8");
  return cookiePath;
}

function findChromeExecutable(): string | null {
  return findChromeExecutableBase({ candidates: CHROME_CANDIDATES, envNames: ["X_CHROME_PATH"] }) ?? null;
}

async function fetchCookiesViaCdp(log: (message: string) => void): Promise<Record<string, string>> {
  const profileDir = resolveChromeProfileDir();
  const existingPort = await findExistingChromeDebugPort({ profileDir });
  const reusing = existingPort !== null;
  const port = existingPort ?? await getFreePort("X_DEBUG_PORT");
  const chromePath = findChromeExecutable();
  if (!chromePath) throw new Error("找不到 Chrome/Chromium 可执行文件。");

  const chrome = reusing
    ? null
    : await launchChromeBase({
        chromePath,
        profileDir,
        port,
        url: "https://x.com/home",
        extraArgs: ["--disable-popup-blocking"],
      });

  let cdp: CdpConnection | null = null;
  let targetId: string | null = null;
  try {
    const wsUrl = await waitForChromeDebugPort(port, 30_000, { includeLastError: true });
    cdp = await CdpConnection.connect(wsUrl, 15_000);
    const page = await openPageSession({
      cdp,
      reusing,
      url: "https://x.com/home",
      matchTarget: (target) => target.type === "page" && (target.url.includes("x.com") || target.url.includes("twitter.com")),
      enableNetwork: true,
    });
    targetId = page.targetId;
    log(reusing ? `[x-follow-report] 复用 Chrome 调试端口 ${port}` : "[x-follow-report] 已打开 Chrome，请完成 X 登录。");

    const start = Date.now();
    while (Date.now() - start < 5 * 60 * 1000) {
      const { cookies } = await cdp.send<{ cookies: CookieLike[] }>(
        "Network.getCookies",
        { urls: ["https://x.com/", "https://twitter.com/"] },
        { sessionId: page.sessionId, timeoutMs: 10_000 }
      );
      const map = buildCookieMap(cookies ?? []);
      if (hasRequiredCookies(map)) return map;
      await sleep(1000);
    }
    throw new Error("等待 X cookie 超时。");
  } finally {
    if (cdp) {
      if (reusing && targetId) {
        try {
          await cdp.send("Target.closeTarget", { targetId }, { timeoutMs: 5_000 });
        } catch {}
      }
      cdp.close();
    }
    if (chrome) await gracefulKillChrome(chrome, port);
  }
}

export async function loadCookies(options: { login?: boolean; log: (message: string) => void }): Promise<Record<string, string>> {
  if (options.login) {
    const cdpCookies = await fetchCookiesViaCdp(options.log);
    await saveCookies(cdpCookies);
    return cdpCookies;
  }

  const envCookies = loadCookiesFromEnv();
  if (Object.keys(envCookies).length > 0) return envCookies;

  const fileCookies = await loadCookiesFromFile();
  if (Object.keys(fileCookies).length > 0) return fileCookies;

  return {};
}
