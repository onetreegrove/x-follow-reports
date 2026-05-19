import { describe, expect, test } from "bun:test";

import { buildReportMaterials, selectMaterialTweets } from "./materials.js";
import type { NormalizedTweet } from "./types.js";

function tweet(overrides: Partial<NormalizedTweet> = {}): NormalizedTweet {
  return {
    tweetId: "1",
    url: "https://x.com/alice/status/1",
    timeline: "following",
    authorName: "Alice",
    authorHandle: "alice",
    createdAt: "2026-05-16T06:00:00.000Z",
    collectedAt: "2026-05-16T06:01:00.000Z",
    text: "OpenAI 推出 ChatGPT 手机版 Codex 预览，支持 iOS 与安卓远程查看任务进度。",
    language: "zh",
    links: [],
    media: ["https://pbs.twimg.com/media/demo.jpg"],
    hashtags: [],
    metrics: { replies: 1, reposts: 2, likes: 3, quotes: 4, views: 100 },
    isReply: false,
    isRepost: false,
    isQuote: false,
    ...overrides,
  };
}

describe("report materials", () => {
  test("buildReportMaterials exports safe tweet facts and output path", () => {
    const materials = buildReportMaterials({
      tweets: [tweet()],
      outputPath: "/tmp/2026-05/16/140000-晚报.md",
      timeline: "following",
      reportKind: "晚报",
      generatedAt: "2026-05-16 14:00:00",
      sourceLabel: "X 关注时间线",
      periodStart: "2026-05-16T00:00:00+08:00",
      periodEnd: "2026-05-16T23:59:59+08:00",
      skipped: 2,
      errors: ["X API 错误 (429): rate limited"],
      warnings: ["EXTEND.md:2 timeline 只能是 following 或 home"],
    });

    expect(materials.version).toBe(1);
    expect(materials.outputPath).toBe("/tmp/2026-05/16/140000-晚报.md");
    expect(materials.totalTweets).toBe(1);
    expect(materials.selectedTweets).toBe(1);
    expect(materials.skipped).toBe(2);
    expect(materials.errors).toEqual(["X API 错误 (429): rate limited"]);
    expect(materials.warnings).toEqual(["EXTEND.md:2 timeline 只能是 following 或 home"]);
    expect(materials.tweets[0]).toEqual({
      id: "1",
      url: "https://x.com/alice/status/1",
      authorName: "Alice",
      authorHandle: "alice",
      createdAt: "2026-05-16T06:00:00.000Z",
      text: "OpenAI 推出 ChatGPT 手机版 Codex 预览，支持 iOS 与安卓远程查看任务进度。",
      language: "zh",
      links: [],
      media: ["https://pbs.twimg.com/media/demo.jpg"],
      hashtags: [],
      metrics: { replies: 1, reposts: 2, likes: 3, quotes: 4, views: 100 },
      flags: { isReply: false, isRepost: false, isQuote: false },
    });
    expect(JSON.stringify(materials)).not.toContain("auth_token");
    expect(JSON.stringify(materials)).not.toContain("ct0");
  });

  test("selectMaterialTweets removes obvious noise but keeps all relevant items without a cap", () => {
    const tweets = [
      ...Array.from({ length: 12 }, (_, index) =>
        tweet({
          tweetId: String(index + 1),
          url: `https://x.com/dev/status/${index + 1}`,
          authorHandle: "dev",
          text: `开发者分享 AI coding workflow 第 ${index + 1} 条实践：如何拆分任务、验证代码并减少人工返工。`,
          metrics: { replies: 0, reposts: index, likes: 100 - index, quotes: 0, views: 1000 },
        })
      ),
      tweet({
        tweetId: "politics",
        url: "https://x.com/news/status/politics",
        authorHandle: "news",
        text: "Trump taxes election politics update with no AI or developer content.",
        language: "en",
        metrics: { replies: 0, reposts: 999, likes: 9999, quotes: 0, views: 99999 },
      }),
    ];

    const selected = selectMaterialTweets(tweets);

    expect(selected.map((item) => item.tweetId)).toHaveLength(12);
    expect(selected.map((item) => item.tweetId)).not.toContain("politics");
  });
});
