import type { NormalizedTweet, TimelineExtractionResult, TimelineKind } from "./types.js";

function unwrapTweetResult(result: any): any {
  if (!result) return null;
  if (result.__typename === "TweetWithVisibilityResults" && result.tweet) return result.tweet;
  if (result.__typename === "TweetTombstone") return null;
  return result;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.replace(/,/g, ""), 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function toIsoDate(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  return value || new Date().toISOString();
}

function extractCursor(content: any): { type?: string; value?: string } | null {
  const candidates = [
    content?.operation?.cursor,
    content?.itemContent,
    content,
  ];
  for (const candidate of candidates) {
    const type = firstString(candidate?.cursorType);
    const value = firstString(candidate?.value);
    if (type && value) return { type, value };
  }
  return null;
}

function extractTweetFromContent(content: any): any | null {
  const result =
    content?.itemContent?.tweet_results?.result ??
    content?.item?.itemContent?.tweet_results?.result ??
    content?.tweet_results?.result;
  return unwrapTweetResult(result?.tweet ?? result);
}

function collectEntryContents(payload: any): any[] {
  const contents: any[] = [];
  const visitInstruction = (instruction: any) => {
    for (const entry of instruction?.entries ?? []) {
      if (entry?.content) contents.push(entry.content);
      for (const item of entry?.content?.items ?? []) {
        if (item?.item) contents.push(item.item);
        if (item?.item?.itemContent) contents.push({ itemContent: item.item.itemContent });
      }
    }
    for (const item of instruction?.moduleItems ?? []) {
      if (item?.item) contents.push(item.item);
      if (item?.item?.itemContent) contents.push({ itemContent: item.item.itemContent });
    }
  };

  const stack: any[] = [payload];
  while (stack.length) {
    const value = stack.pop();
    if (!value || typeof value !== "object") continue;
    if (Array.isArray(value)) {
      stack.push(...value);
      continue;
    }
    if (Array.isArray(value.instructions)) {
      for (const instruction of value.instructions) visitInstruction(instruction);
    }
    for (const child of Object.values(value)) {
      if (child && typeof child === "object") stack.push(child);
    }
  }
  return contents;
}

function normalizeTweet(tweet: any, timeline: TimelineKind): NormalizedTweet | null {
  const legacy = tweet?.legacy ?? {};
  const userResult = tweet?.core?.user_results?.result?.result ?? tweet?.core?.user_results?.result ?? {};
  const userLegacy = userResult?.legacy ?? {};
  const userCore = userResult?.core ?? {};
  const id = firstString(tweet?.rest_id, legacy?.id_str, legacy?.id);
  if (!id) return null;

  const handle = firstString(userCore?.screen_name, userLegacy?.screen_name, userResult?.screen_name, "unknown");
  const text = firstString(legacy?.full_text, legacy?.text, tweet?.note_tweet?.note_tweet_results?.result?.text);
  const links = [
    ...(legacy?.entities?.urls ?? []),
    ...(legacy?.entities?.description?.urls ?? []),
  ]
    .map((item: any) => firstString(item?.expanded_url, item?.url))
    .filter(Boolean);
  const media = [
    ...(legacy?.extended_entities?.media ?? []),
    ...(legacy?.entities?.media ?? []),
  ]
    .map((item: any) => firstString(item?.media_url_https, item?.media_url, item?.url))
    .filter(Boolean);
  const hashtags = (legacy?.entities?.hashtags ?? [])
    .map((item: any) => firstString(item?.text))
    .filter(Boolean);

  return {
    tweetId: id,
    url: `https://x.com/${handle}/status/${id}`,
    timeline,
    authorName: firstString(userCore?.name, userLegacy?.name, userResult?.name, handle),
    authorHandle: handle,
    createdAt: toIsoDate(firstString(legacy?.created_at)),
    collectedAt: new Date().toISOString(),
    text,
    language: firstString(legacy?.lang, "und"),
    links: Array.from(new Set(links)),
    media: Array.from(new Set(media)),
    hashtags,
    metrics: {
      replies: toNumber(legacy?.reply_count),
      reposts: toNumber(legacy?.retweet_count),
      likes: toNumber(legacy?.favorite_count),
      quotes: toNumber(legacy?.quote_count),
      views: toNumber(tweet?.views?.count),
    },
    isReply: Boolean(legacy?.in_reply_to_status_id_str || legacy?.in_reply_to_user_id_str),
    isRepost: Boolean(legacy?.retweeted_status_result),
    isQuote: Boolean(legacy?.quoted_status_id_str || tweet?.quoted_status_result),
  };
}

export function extractTimelineTweets(
  payload: unknown,
  options: { timeline: TimelineKind; includeReplies?: boolean; includeReposts?: boolean } = { timeline: "following" }
): TimelineExtractionResult {
  const seen = new Set<string>();
  const tweets: NormalizedTweet[] = [];
  let skipped = 0;
  let bottomCursor: string | undefined;
  let topCursor: string | undefined;

  for (const content of collectEntryContents(payload)) {
    const cursor = extractCursor(content);
    if (cursor?.type === "Bottom") bottomCursor = cursor.value;
    if (cursor?.type === "Top") topCursor = cursor.value;

    const tweet = normalizeTweet(extractTweetFromContent(content), options.timeline);
    if (!tweet) continue;
    if (!options.includeReplies && tweet.isReply) {
      skipped++;
      continue;
    }
    if (options.includeReposts === false && tweet.isRepost) {
      skipped++;
      continue;
    }
    if (seen.has(tweet.tweetId)) continue;
    seen.add(tweet.tweetId);
    tweets.push(tweet);
  }

  return { tweets, bottomCursor, topCursor, skipped };
}
