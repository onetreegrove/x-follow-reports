import process from "node:process";

import { buildCookieHeader } from "./cookies.js";
import type { TimelineKind } from "./types.js";

export const DEFAULT_BEARER_TOKEN =
  "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

type QueryInfo = {
  queryId: string;
  operationName: string;
  features: Record<string, boolean>;
  fieldToggles: Record<string, boolean>;
};

const DEFAULT_FEATURES: Record<string, boolean> = {
  rweb_video_screen_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  responsive_web_jetfuel_frame: false,
  responsive_web_grok_share_attachment_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  responsive_web_graphql_exclude_directive_enabled: true,
};

const DEFAULT_FIELD_TOGGLES: Record<string, boolean> = {
  withArticleRichContentState: true,
  withArticlePlainText: false,
  withGrokAnalyze: false,
  withDisallowedReplyControls: false,
};

function headers(cookieMap: Record<string, string>): Record<string, string> {
  const userAgent = process.env.X_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
  const bearer = process.env.X_BEARER_TOKEN?.trim() || DEFAULT_BEARER_TOKEN;
  const h: Record<string, string> = {
    authorization: bearer,
    "user-agent": userAgent,
    accept: "application/json",
    "accept-language": "en",
    "x-twitter-active-user": "yes",
    "x-twitter-client-language": "en",
  };
  const cookie = buildCookieHeader(cookieMap);
  if (cookie) h.cookie = cookie;
  if (cookieMap.auth_token) h["x-twitter-auth-type"] = "OAuth2Session";
  if (cookieMap.ct0) h["x-csrf-token"] = cookieMap.ct0;
  if (process.env.X_CLIENT_TRANSACTION_ID?.trim()) h["x-client-transaction-id"] = process.env.X_CLIENT_TRANSACTION_ID.trim();
  return h;
}

function safeUrlLabel(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "请求地址不可解析";
  }
}

function apiErrorSummary(text: string): string {
  try {
    const parsed = JSON.parse(text) as { errors?: Array<{ code?: number | string; message?: string }>; error?: string; message?: string };
    const first = parsed.errors?.[0];
    if (first) return [first.code ? `code ${first.code}` : "", first.message].filter(Boolean).join(": ");
    if (parsed.error) return parsed.error;
    if (parsed.message) return parsed.message;
  } catch {}
  return "未返回可解析错误摘要";
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`请求失败 ${res.status}: ${safeUrlLabel(url)} (${apiErrorSummary(text)})`);
  return text;
}

function parseApiChunkHash(html: string): string | null {
  return html.match(/api:\"([a-zA-Z0-9_-]+)\"/)?.[1] ?? html.match(/api\.([a-zA-Z0-9_-]+)\.js/)?.[1] ?? null;
}

export function parseClientScriptUrls(html: string): string[] {
  const urls = new Set<string>();
  for (const match of html.matchAll(/https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/(?:api|main)\.[^"'<>\s]+\.js/g)) {
    urls.add(match[0]);
  }
  return Array.from(urls);
}

function parseOperationQueryId(source: string, operationName: string): string | null {
  const patterns = [
    new RegExp(`queryId:\\\"([^\\\"]+)\\\",operationName:\\\"${operationName}\\\"`),
    new RegExp(`operationName:\\\"${operationName}\\\"[\\s\\S]{0,600}?queryId:\\\"([^\\\"]+)\\\"`),
    new RegExp(`queryId:"([^"]+)",operationName:"${operationName}"`),
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

async function discoverQueryInfo(timeline: TimelineKind): Promise<QueryInfo> {
  const operationName = timeline === "following" ? "HomeLatestTimeline" : "HomeTimeline";
  const envName = timeline === "following" ? "X_FOLLOWING_TIMELINE_QUERY_ID" : "X_HOME_TIMELINE_QUERY_ID";
  const envQueryId = process.env[envName]?.trim();
  if (envQueryId) {
    return { queryId: envQueryId, operationName, features: DEFAULT_FEATURES, fieldToggles: DEFAULT_FIELD_TOGGLES };
  }

  const userAgent = process.env.X_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
  const html = await fetchText("https://x.com", { headers: { "user-agent": userAgent } });
  const scriptUrls = parseClientScriptUrls(html);
  const apiHash = parseApiChunkHash(html);
  if (apiHash) scriptUrls.unshift(`https://abs.twimg.com/responsive-web/client-web/api.${apiHash}a.js`);
  if (scriptUrls.length === 0) {
    throw new Error(`无法从 X 首页发现 client script。可设置 ${envName} 后重试。`);
  }

  for (const scriptUrl of Array.from(new Set(scriptUrls))) {
    const chunk = await fetchText(scriptUrl, { headers: { "user-agent": userAgent } });
    const queryId = parseOperationQueryId(chunk, operationName);
    if (queryId) {
      return { queryId, operationName, features: DEFAULT_FEATURES, fieldToggles: DEFAULT_FIELD_TOGGLES };
    }
  }
  throw new Error(`无法发现 ${operationName} queryId。可设置 ${envName} 后重试。`);
}

function buildVariables(timeline: TimelineKind, count: number, cursor?: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    count,
    cursor,
    includePromotedContent: timeline === "home",
    latestControlAvailable: true,
    requestContext: cursor ? "loadMore" : "launch",
    withCommunity: true,
    seenTweetIds: [],
  };
  return Object.fromEntries(Object.entries(base).filter(([, value]) => value !== undefined));
}

export async function fetchTimelinePage(options: {
  timeline: TimelineKind;
  cookieMap: Record<string, string>;
  count: number;
  cursor?: string;
}): Promise<unknown> {
  const query = await discoverQueryInfo(options.timeline);
  const url = new URL(`https://x.com/i/api/graphql/${query.queryId}/${query.operationName}`);
  url.searchParams.set("variables", JSON.stringify(buildVariables(options.timeline, options.count, options.cursor)));
  url.searchParams.set("features", JSON.stringify(query.features));
  url.searchParams.set("fieldToggles", JSON.stringify(query.fieldToggles));

  const res = await fetch(url.toString(), { headers: headers(options.cookieMap) });
  const text = await res.text();
  if (!res.ok) throw new Error(`X API 错误 (${res.status}, ${query.operationName}): ${apiErrorSummary(text)}`);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`X API 返回不是合法 JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}
