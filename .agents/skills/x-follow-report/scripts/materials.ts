import type { NormalizedTweet, ReportKind, ReportMaterials, TimelineKind } from "./types.js";

function score(tweet: NormalizedTweet): number {
  return (tweet.metrics.likes || 0)
    + (tweet.metrics.reposts || 0) * 2
    + (tweet.metrics.quotes || 0) * 3
    + (tweet.metrics.replies || 0);
}

function isObviousNoise(tweet: NormalizedTweet): boolean {
  const text = `${tweet.text} ${tweet.authorHandle}`.toLowerCase();
  if (tweet.isReply) return true;
  return /war in ukraine|trump|taxes|katseye|wildworld tour|glp-1|insurance|football|nba|celebrity/i.test(text);
}

function isDeveloperOrAiRelevant(tweet: NormalizedTweet): boolean {
  const text = `${tweet.text} ${tweet.links.join(" ")}`.toLowerCase();
  return /ai|agent|codex|claude|chatgpt|gpt|model|llm|coding|code|developer|devbox|cli|github|huggingface|open source|benchmark|eval|paper|research|workflow|api|langchain|openai|anthropic|工具|开发|模型|开源|评测|论文|编程|代码|提示词|智能体/.test(text);
}

function extractKeywords(tweets: NormalizedTweet[]): string[] {
  const stop = new Set([
    "https", "http", "with", "from", "this", "that", "today", "about", "the", "and", "for", "you", "are", "was", "were", "have", "has", "had",
    "rt", "to", "in", "is", "on", "of", "it", "as", "at", "by", "be", "or", "an", "a",
    "一个", "这个", "我们", "进行", "已经", "真的", "非常", "发现", "还是", "甚至", "其实", "结果", "终于", "现在",
  ]);
  const counts = new Map<string, number>();
  for (const tweet of tweets) {
    const words = tweet.text
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .split(/[^\p{L}\p{N}_#-]+/u)
      .map((word) => word.trim())
      .filter((word) => word.length >= 2 && !stop.has(word));
    for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
    for (const hashtag of tweet.hashtags) counts.set(`#${hashtag}`, (counts.get(`#${hashtag}`) ?? 0) + 2);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([word]) => word);
}

export function selectMaterialTweets(tweets: NormalizedTweet[]): NormalizedTweet[] {
  return tweets
    .filter((tweet) => !isObviousNoise(tweet))
    .filter((tweet) => isDeveloperOrAiRelevant(tweet))
    .sort((a, b) => score(b) - score(a));
}

export function buildReportMaterials(options: {
  tweets: NormalizedTweet[];
  outputPath: string;
  timeline: TimelineKind;
  reportKind: ReportKind;
  generatedAt: string;
  sourceLabel: string;
  periodStart: string;
  periodEnd: string;
  skipped?: number;
  errors?: string[];
  warnings?: string[];
}): ReportMaterials {
  const selected = selectMaterialTweets(options.tweets);
  return {
    version: 1,
    reportKind: options.reportKind,
    generatedAt: options.generatedAt,
    sourceLabel: options.sourceLabel,
    timeline: options.timeline,
    totalTweets: options.tweets.length,
    selectedTweets: selected.length,
    periodStart: options.periodStart,
    periodEnd: options.periodEnd,
    outputPath: options.outputPath,
    focusAccounts: selected.slice(0, 5).map((tweet) => tweet.authorHandle),
    keywords: extractKeywords(selected),
    tweets: selected.map((tweet) => ({
      id: tweet.tweetId,
      url: tweet.url,
      authorName: tweet.authorName,
      authorHandle: tweet.authorHandle,
      createdAt: tweet.createdAt,
      text: tweet.text,
      language: tweet.language,
      links: tweet.links,
      media: tweet.media,
      hashtags: tweet.hashtags,
      metrics: tweet.metrics,
      flags: {
        isReply: tweet.isReply,
        isRepost: tweet.isRepost,
        isQuote: tweet.isQuote,
      },
    })),
    skipped: options.skipped ?? 0,
    errors: options.errors ?? [],
    warnings: options.warnings ?? [],
  };
}
