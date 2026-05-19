import type { NormalizedTweet, WriteRunOptions } from "./types.js";

function extractKeywords(tweets: NormalizedTweet[]): Array<[string, number]> {
  const stop = new Set([
    "https", "http", "with", "from", "this", "that", "today", "about", "the", "and", "for", "you", "are", "was", "were", "have", "has", "had",
    "rt", "to", "in", "is", "on", "of", "it", "as", "at", "by", "be", "or", "an", "a", "so", "like", "one", "every", "gets",
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
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15);
}

function formatLocalTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: process.env.TZ || "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

function reportKind(now: Date): "早报" | "午报" | "晚报" {
  const hour = Number(formatLocalTimestamp(now).slice(11, 13));
  if (hour < 12) return "早报";
  if (hour < 14) return "午报";
  return "晚报";
}

function sourceLabel(timeline: string): string {
  return timeline === "home" ? "X 主页时间线" : "X 关注时间线";
}

function truncateText(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}...`;
}

function stripUrls(text: string): string {
  return text.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
}

function hasCjk(text: string): boolean {
  return /[\p{Script=Han}]/u.test(text);
}

function resourceName(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "github.com") {
      const parts = parsed.pathname.split("/").filter(Boolean);
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : "GitHub";
    }
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "外部链接";
  }
}

type TopicKind = "launch" | "agent" | "opinion" | "research" | "tool";

type NewsItem = {
  kind: TopicKind;
  icon: string;
  label: string;
  title: string;
  summary: string;
  bullets: string[];
  tweets: NormalizedTweet[];
};

function score(tweet: NormalizedTweet): number {
  return (tweet.metrics.likes || 0) + (tweet.metrics.reposts || 0) * 2 + (tweet.metrics.quotes || 0) * 3 + (tweet.metrics.replies || 0);
}

function classifyTweet(tweet: NormalizedTweet): TopicKind {
  const text = `${tweet.text} ${tweet.links.join(" ")}`.toLowerCase();
  if (tweet.links.some((link) => /github\.com|huggingface\.co|npmjs\.com|pypi\.org|docs\./i.test(link))) return "tool";
  if (/paper|arxiv|research|benchmark|eval|论文|研究|评测|bench/.test(text)) return "research";
  if (/agent|codex|claude code|vibe|workflow|devbox|cli|coding|agentic/.test(text)) return "agent";
  if (/launch|release|ship|preview|发布|上线|开源|open source|推出/.test(text)) return "launch";
  return "opinion";
}

function topicLabel(kind: TopicKind): string {
  if (kind === "agent") return "实战";
  if (kind === "launch") return "发布";
  if (kind === "research") return "研究";
  if (kind === "tool") return "工具";
  return "观点";
}

function topicIcon(kind: TopicKind): string {
  if (kind === "agent") return "🤖";
  if (kind === "launch") return "🚀";
  if (kind === "research") return "📚";
  if (kind === "tool") return "🛠️";
  return "🧠";
}

function isDeveloperRelevant(tweet: NormalizedTweet): boolean {
  const text = `${tweet.text} ${tweet.links.join(" ")}`.toLowerCase();
  return /ai|agent|codex|claude|gpt|model|llm|coding|code|developer|devbox|cli|github|open|benchmark|eval|paper|research|workflow|api|工具|开发|模型|开源|评测|论文|编程|代码/.test(text);
}

function isNoiseTweet(tweet: NormalizedTweet): boolean {
  const text = `${tweet.text} ${tweet.authorHandle}`.toLowerCase();
  if (tweet.isReply) return true;
  if (/war in ukraine|trump|taxes|katseye|wildworld tour|glp-1|insurance/i.test(text)) return true;
  return false;
}

function firstSentence(text: string): string {
  return text.split(/[\n。！？.!?]/).map((part) => part.trim()).find(Boolean) ?? "";
}

function tweetTitle(tweet: NormalizedTweet): string {
  const cleanText = stripUrls(tweet.text.replace(/RT @\w+:\s*/g, ""));
  const sentence = firstSentence(cleanText);
  if (!sentence) return `@${tweet.authorHandle} 分享一条动态`;
  if (hasCjk(sentence)) return truncateText(sentence, 56);
  return `@${tweet.authorHandle}: ${truncateText(sentence, 72)}`;
}

function tweetSummary(tweet: NormalizedTweet): string {
  const cleanText = stripUrls(tweet.text.replace(/RT @\w+:\s*/g, ""));
  if (!cleanText) return `@${tweet.authorHandle} 发布了一条包含链接或媒体的动态。`;
  if (hasCjk(cleanText)) return truncateText(cleanText, 180);
  return `原推写道：“${truncateText(cleanText, 180)}”`;
}

function tweetBullets(tweet: NormalizedTweet): string[] {
  const bullets = [
    `**来源账号**：${tweet.authorName}（@${tweet.authorHandle}），发布时间 ${tweet.createdAt}。`,
  ];

  if (tweet.links.length > 0) {
    bullets.push(`**相关链接**：${tweet.links.slice(0, 3).map((link) => `[${resourceName(link)}](${link})`).join("、")}。`);
  } else {
    bullets.push(`**互动数据**：${tweet.metrics.likes} 赞、${tweet.metrics.reposts} 转发、${tweet.metrics.quotes} 引用、${tweet.metrics.replies} 回复。`);
  }

  if (tweet.hashtags.length > 0) {
    bullets.push(`**标签**：${tweet.hashtags.slice(0, 5).map((tag) => `#${tag}`).join(" ")}。`);
  }

  return bullets;
}

function buildNewsItems(tweets: NormalizedTweet[]): NewsItem[] {
  const seenTweetIds = new Set<string>();
  const seenTitles = new Set<string>();
  const items: NewsItem[] = [];
  const candidates = tweets
    .filter((tweet) => !isNoiseTweet(tweet))
    .filter((tweet) => isDeveloperRelevant(tweet))
    .sort((a, b) => score(b) - score(a));

  for (const tweet of candidates) {
    if (seenTweetIds.has(tweet.tweetId)) continue;
    const title = tweetTitle(tweet);
    if (seenTitles.has(title)) continue;
    const kind = classifyTweet(tweet);
    items.push({
      kind,
      icon: topicIcon(kind),
      label: topicLabel(kind),
      title,
      summary: tweetSummary(tweet),
      bullets: tweetBullets(tweet),
      tweets: [tweet],
    });
    seenTweetIds.add(tweet.tweetId);
    seenTitles.add(title);
  }

  return items;
}

export async function formatReport(options: WriteRunOptions): Promise<string> {
  const { tweets, timeline, skipped, errors } = options;
  const now = options.now ?? new Date();
  const kind = reportKind(now);
  const keywords = extractKeywords(tweets);
  const important = tweets.filter((tweet) => isDeveloperRelevant(tweet) && !isNoiseTweet(tweet)).sort((a, b) => score(b) - score(a));
  const newsItems = buildNewsItems(tweets);

  const lines = [
    `# AI 开发者${kind}`,
    "",
    `**生成时间**：${formatLocalTimestamp(now)}`,
    `**数据源**：${sourceLabel(timeline)}`,
    `**分析条目**：${tweets.length} 条推文`,
    "",
    "---",
  ];

  if (tweets.length === 0) {
    lines.push("", "### 🧭 【暂无可分析动态】", "本次时间窗口内没有采集到推文。");
  } else {
    const focus = important.slice(0, 3).map((tweet) => `@${tweet.authorHandle}`).join("、") || "暂无明确重点账号";
    const keywordText = keywords.slice(0, 10).map(([word]) => word).join(" / ") || "暂无高频关键词";
    lines.push("", "### 🧭 【概览】", `重点账号：${focus}。`, "", `高频关键词：${keywordText}`);
  }

  if (tweets.length > 0 && newsItems.length === 0) {
    lines.push("", "### 🧭 【暂无开发者相关动态】", "本次采集到的内容未匹配到 AI、模型、代码、工具、研究或开发工作流相关关键词。");
  }

  for (const item of newsItems) {
    lines.push(
      "",
      "---",
      "",
      `### ${item.icon} 【${item.label}】${item.title}`,
      "**内容摘要**：",
      item.summary,
      ...item.bullets.map((bullet) => `*   ${bullet}`),
      "",
      `**关联推文**：${item.tweets.map((t, index) => index === 0 ? `[查看原推](${t.url})` : `[相关推文](${t.url})`).join(" | ")}`
    );
  }

  lines.push("", "---", "", "### ⚠️ 【运行统计】");
  lines.push(`- 跳过/噪声条目：${skipped}`);
  if (errors.length > 0) {
    for (const error of errors) lines.push(`- 错误：${error}`);
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export { reportKind, formatLocalTimestamp };
