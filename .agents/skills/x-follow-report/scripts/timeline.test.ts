import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { collectTimeline, parseExtendConfigText, parseExtendConfigTextWithWarnings, writeMaterialOutputs, writeRunOutputs } from "./main.js";
import { extractTimelineTweets } from "./timeline.js";
import { parseClientScriptUrls } from "./xapi.js";

const fixture = {
  data: {
    home: {
      home_timeline_urt: {
        instructions: [
          {
            type: "TimelineAddEntries",
            entries: [
              {
                entryId: "tweet-111",
                content: {
                  itemContent: {
                    tweet_results: {
                      result: {
                        __typename: "Tweet",
                        rest_id: "111",
                        core: {
                          user_results: {
                            result: {
                              legacy: {
                                name: "Alice Example",
                                screen_name: "alice",
                              },
                            },
                          },
                        },
                        legacy: {
                          created_at: "Fri May 15 08:30:00 +0000 2026",
                          full_text: "Shipping a small agent workflow today https://t.co/demo",
                          reply_count: 2,
                          retweet_count: 3,
                          favorite_count: 42,
                          quote_count: 1,
                          entities: {
                            urls: [
                              {
                                url: "https://t.co/demo",
                                expanded_url: "https://example.com/demo",
                              },
                            ],
                            hashtags: [{ text: "agents" }],
                          },
                          extended_entities: {
                            media: [
                              {
                                media_url_https: "https://pbs.twimg.com/media/demo.jpg",
                                type: "photo",
                              },
                            ],
                          },
                        },
                        views: { count: "1000" },
                      },
                    },
                  },
                },
              },
              {
                entryId: "cursor-bottom-1",
                content: {
                  operation: {
                    cursor: {
                      cursorType: "Bottom",
                      value: "CURSOR_NEXT",
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    },
  },
};

describe("x-follow-report bun scripts", () => {
  test("parseExtendConfigText reads markdown key-value settings", () => {
    const parsed = parseExtendConfigText(`
output_dir: ./custom
timeline: home
max_items: 12
lookback_hours: 6
include_replies: 1
include_reposts: 0
download_media: 1
report_language: zh-CN
`);

    expect(parsed.outputDir).toBe("./custom");
    expect(parsed.timeline).toBe("home");
    expect(parsed.maxItems).toBe(12);
    expect(parsed.lookbackHours).toBe(6);
    expect(parsed.includeReplies).toBe(true);
    expect(parsed.includeReposts).toBe(false);
    expect(parsed.downloadMedia).toBe(true);
  });

  test("parseExtendConfigTextWithWarnings reports invalid settings", () => {
    const parsed = parseExtendConfigTextWithWarnings(`
timeline: latest
max_items: many
include_replies: maybe
unknown_key: value
`);

    expect(parsed.config.timeline).toBeUndefined();
    expect(parsed.config.maxItems).toBeUndefined();
    expect(parsed.warnings.map((warning) => warning.message)).toEqual([
      "timeline 只能是 following 或 home",
      "max_items 必须是正整数",
      "include_replies 必须是布尔值",
      "未知配置项：unknown_key",
    ]);
  });

  test("extractTimelineTweets normalizes records and bottom cursor", () => {
    const { tweets, bottomCursor } = extractTimelineTweets(fixture, { timeline: "following" });

    expect(bottomCursor).toBe("CURSOR_NEXT");
    expect(tweets).toHaveLength(1);
    expect(tweets[0].tweetId).toBe("111");
    expect(tweets[0].authorHandle).toBe("alice");
    expect(tweets[0].createdAt).toBe("2026-05-15T08:30:00.000Z");
    expect(tweets[0].metrics.likes).toBe(42);
    expect(tweets[0].metrics.views).toBe(1000);
    expect(tweets[0].links).toEqual(["https://example.com/demo"]);
    expect(tweets[0].media).toEqual(["https://pbs.twimg.com/media/demo.jpg"]);
  });

  test("extractTimelineTweets reads current X user core fields", () => {
    const currentUserShape = {
      data: {
        home: {
          home_timeline_urt: {
            instructions: [
              {
                entries: [
                  {
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: {
                            __typename: "Tweet",
                            rest_id: "222",
                            core: {
                              user_results: {
                                result: {
                                  __typename: "User",
                                  core: {
                                    name: "向阳乔木",
                                    screen_name: "vista8",
                                  },
                                  legacy: {
                                    description: "喜欢摇滚乐、爱钓鱼的PM",
                                  },
                                },
                              },
                            },
                            legacy: {
                              created_at: "Fri May 15 09:30:00 +0000 2026",
                              full_text: "当前 X 用户结构把 name 和 screen_name 放在 core 字段里",
                              reply_count: 0,
                              retweet_count: 1,
                              favorite_count: 2,
                              quote_count: 0,
                              entities: {},
                            },
                          },
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    };

    const { tweets } = extractTimelineTweets(currentUserShape, { timeline: "following" });

    expect(tweets).toHaveLength(1);
    expect(tweets[0].authorName).toBe("向阳乔木");
    expect(tweets[0].authorHandle).toBe("vista8");
    expect(tweets[0].url).toBe("https://x.com/vista8/status/222");
  });

  test("parseClientScriptUrls discovers current X main bundle URLs", () => {
    const urls = parseClientScriptUrls(`
      <link rel="preload" href="https://abs.twimg.com/responsive-web/client-web/main.4a4db2da.js" />
      <script src="https://abs.twimg.com/responsive-web/client-web/vendor.1ab7cc4a.js"></script>
      <script src="https://abs.twimg.com/responsive-web/client-web/api.deadbeefa.js"></script>
    `);

    expect(urls).toEqual([
      "https://abs.twimg.com/responsive-web/client-web/main.4a4db2da.js",
      "https://abs.twimg.com/responsive-web/client-web/api.deadbeefa.js",
    ]);
  });

  test("writeRunOutputs writes a single dated AI developer daily report", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "x-follow-report-"));
    try {
      const { tweets } = extractTimelineTweets(fixture, { timeline: "following" });

      const result = await writeRunOutputs({
        tweets,
        rawPages: [fixture],
        outputDir: tmp,
        timeline: "following",
        periodStart: "2026-05-15T00:00:00+08:00",
        periodEnd: "2026-05-15T23:59:59+08:00",
        language: "zh-CN",
        skipped: 0,
        errors: [],
        now: new Date("2026-05-15T13:05:09+08:00"),
      });

      const expectedReportPath = path.join(tmp, "2026-05", "15", "130509-午报.md");
      const reportText = await readFile(expectedReportPath, "utf8");
      const monthEntries = await readdir(path.join(tmp, "2026-05"));
      const dayEntries = await readdir(path.join(tmp, "2026-05", "15"));

      expect(result.reportPath).toBe(expectedReportPath);
      expect(result.itemsAnalyzed).toBe(1);
      expect(monthEntries).toEqual(["15"]);
      expect(dayEntries).toEqual(["130509-午报.md"]);
      expect(reportText).toContain("# AI 开发者午报");
      expect(reportText).not.toContain("# X 关注流 AI 开发者午报");
      expect(reportText).toContain("**生成时间**：2026-05-15 13:05:09");
      expect(reportText).toContain("**数据源**：X 关注时间线");
      expect(reportText).toContain("**分析条目**：1 条推文");
      expect(reportText).toContain("[查看原推](https://x.com/alice/status/111)");
      expect(reportText).not.toContain("[https://example.com/demo](https://example.com/demo)");
      expect(reportText).not.toContain("### 🛠️ 【新工具/资源】");
      expect(reportText).not.toContain("auth_token");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("writeMaterialOutputs returns report materials without writing markdown", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "x-follow-report-"));
    try {
      const { tweets } = extractTimelineTweets(fixture, { timeline: "following" });

      const materials = await writeMaterialOutputs({
        tweets,
        rawPages: [fixture],
        outputDir: tmp,
        timeline: "following",
        periodStart: "2026-05-15T00:00:00+08:00",
        periodEnd: "2026-05-15T23:59:59+08:00",
        language: "zh-CN",
        skipped: 0,
        errors: ["分页失败"],
        warnings: ["配置警告"],
        now: new Date("2026-05-15T18:05:09+08:00"),
      });

      const expectedReportPath = path.join(tmp, "2026-05", "15", "180509-晚报.md");

      expect(materials.reportKind).toBe("晚报");
      expect(materials.outputPath).toBe(expectedReportPath);
      expect(materials.totalTweets).toBe(1);
      expect(materials.selectedTweets).toBe(1);
      expect(materials.tweets[0].url).toBe("https://x.com/alice/status/111");
      expect(materials.tweets[0].media).toEqual(["https://pbs.twimg.com/media/demo.jpg"]);
      expect(materials.skipped).toBe(0);
      expect(materials.errors).toEqual(["分页失败"]);
      expect(materials.warnings).toEqual(["配置警告"]);
      expect(JSON.stringify(materials)).not.toContain("auth_token");
      expect(JSON.stringify(materials)).not.toContain("rawPages");
      await expect(readFile(expectedReportPath, "utf8")).rejects.toThrow();
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("collectTimeline keeps already collected tweets when a later page is rate limited", async () => {
    let calls = 0;
    const collection = await collectTimeline(
      {
        outputDir: ".",
        timeline: "following",
        maxItems: 2,
        lookbackHours: 24 * 365,
        includeReplies: false,
        includeReposts: true,
        downloadMedia: false,
        reportLanguage: "zh-CN",
      },
      {},
      () => {},
      async () => {
        calls++;
        if (calls === 1) return fixture;
        const error = new Error("X API 返回 429");
        (error as Error & { status?: number }).status = 429;
        throw error;
      }
    );

    expect(collection.tweets).toHaveLength(1);
    expect(collection.errors.join("\n")).toContain("429");
  });



  test("collectTimeline continues after one empty page with cursor", async () => {
    let calls = 0;
    const collection = await collectTimeline(
      {
        outputDir: ".",
        timeline: "following",
        maxItems: 1,
        lookbackHours: 24 * 365,
        includeReplies: false,
        includeReposts: true,
        downloadMedia: false,
        reportLanguage: "zh-CN",
      },
      {},
      () => {},
      async () => {
        calls++;
        if (calls === 1) {
          return { data: { home: { home_timeline_urt: { instructions: [{ entries: [{ content: { operation: { cursor: { cursorType: "Bottom", value: "NEXT" } } } }] }] } } } };
        }
        return fixture;
      }
    );

    expect(calls).toBe(2);
    expect(collection.tweets).toHaveLength(1);
  });

  test("collectTimeline stops when fetched tweets are outside lookback", async () => {
    let calls = 0;
    const collection = await collectTimeline(
      {
        outputDir: ".",
        timeline: "following",
        maxItems: 10,
        lookbackHours: 1,
        includeReplies: false,
        includeReposts: true,
        downloadMedia: false,
        reportLanguage: "zh-CN",
      },
      {},
      () => {},
      async () => {
        calls++;
        return fixture;
      }
    );

    expect(calls).toBe(1);
    expect(collection.tweets).toHaveLength(0);
  });

  test("writeRunOutputs renders English tweet content as Chinese report text", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "x-follow-report-"));
    try {
      const { tweets } = extractTimelineTweets(fixture, { timeline: "following" });

      const result = await writeRunOutputs({
        tweets,
        rawPages: [fixture],
        outputDir: tmp,
        timeline: "following",
        periodStart: "2026-05-15T00:00:00+08:00",
        periodEnd: "2026-05-15T23:59:59+08:00",
        language: "zh-CN",
        skipped: 0,
        errors: [],
        now: new Date("2026-05-15T18:05:09+08:00"),
      });

      const reportText = await readFile(result.reportPath, "utf8");

      expect(reportText).toContain("### 🤖 【实战】");
      expect(reportText).toContain("**内容摘要**：");
      expect(reportText).toContain("原推写道：");
      expect(reportText).toContain("Shipping a small agent workflow today");
      expect(reportText).toContain("*   **来源账号**：");
      expect(reportText).toContain("*   **相关链接**：");
      expect(reportText).not.toContain("英文原文大意");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("writeRunOutputs renders English items from tweet facts only", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "x-follow-report-"));
    try {
      const tweets = [
        {
          tweetId: "333",
          url: "https://x.com/hyperagentapp/status/333",
          timeline: "following" as const,
          authorName: "HyperAgent",
          authorHandle: "hyperagentapp",
          createdAt: "2026-05-16T04:00:00.000Z",
          collectedAt: "2026-05-16T04:05:00.000Z",
          text: "42 agents. 216 threads. One dashboard. Every agent gets its own prompt, tools, skills, and budget. Deploy specialized agents across your company. From the team at Airtable.",
          language: "en",
          links: [],
          media: [],
          hashtags: [],
          metrics: { replies: 10, reposts: 200, likes: 9000, quotes: 20, views: 100000 },
          isReply: false,
          isRepost: false,
          isQuote: false,
        },
        {
          tweetId: "444",
          url: "https://x.com/grok/status/444",
          timeline: "following" as const,
          authorName: "Grok",
          authorHandle: "grok",
          createdAt: "2026-05-16T05:00:00.000Z",
          collectedAt: "2026-05-16T05:05:00.000Z",
          text: "Introducing Grok Voice Think Fast 1.0 — a state-of-the-art voice model built for complex, multi-step workflows with snappy responses and high accuracy. Try it for free today",
          language: "en",
          links: [],
          media: [],
          hashtags: [],
          metrics: { replies: 10, reposts: 120, likes: 8000, quotes: 10, views: 100000 },
          isReply: false,
          isRepost: false,
          isQuote: false,
        },
      ];

      const result = await writeRunOutputs({
        tweets,
        rawPages: [],
        outputDir: tmp,
        timeline: "following",
        periodStart: "2026-05-16T00:00:00+08:00",
        periodEnd: "2026-05-16T23:59:59+08:00",
        language: "zh-CN",
        skipped: 0,
        errors: [],
        now: new Date("2026-05-16T14:05:09+08:00"),
      });

      const reportText = await readFile(result.reportPath, "utf8");

      expect(reportText).toContain("@hyperagentapp: 42 agents");
      expect(reportText).toContain("Every agent gets its own prompt, tools, skills, and budget");
      expect(reportText).toContain("@grok: Introducing Grok Voice Think Fast 1");
      expect(reportText).toContain("built for complex, multi-step workflows");
      expect(reportText).not.toContain("Airtable 团队推出 HyperAgent：一个看板管理 42 个专用 Agent");
      expect(reportText).not.toContain("xAI 发布 Grok Voice Think Fast 1.0：面向复杂工作流的语音模型");
      expect(reportText).not.toContain("产品发布与关键更新");
      expect(reportText).not.toContain("技术洞察与社区热议");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("writeRunOutputs renders GitHub resources without hard-coded expansion", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "x-follow-report-"));
    try {
      const tweets = [
        {
          tweetId: "555",
          url: "https://x.com/geekbb/status/555",
          timeline: "following" as const,
          authorName: "geekbb",
          authorHandle: "geekbb",
          createdAt: "2026-05-16T06:00:00.000Z",
          collectedAt: "2026-05-16T06:05:00.000Z",
          text: "AirTranslate: real-time translation app built for macOS. Supports floating subtitles and quick keyboard control. https://t.co/demo",
          language: "en",
          links: ["https://github.com/himomohi/AirTranslate"],
          media: [],
          hashtags: [],
          metrics: { replies: 8, reposts: 80, likes: 600, quotes: 12, views: 50000 },
          isReply: false,
          isRepost: false,
          isQuote: false,
        },
      ];

      const result = await writeRunOutputs({
        tweets,
        rawPages: [],
        outputDir: tmp,
        timeline: "following",
        periodStart: "2026-05-16T00:00:00+08:00",
        periodEnd: "2026-05-16T23:59:59+08:00",
        language: "zh-CN",
        skipped: 0,
        errors: [],
        now: new Date("2026-05-16T14:15:09+08:00"),
      });

      const reportText = await readFile(result.reportPath, "utf8");

      expect(reportText).toContain("@geekbb: AirTranslate: real-time translation app built for macOS");
      expect(reportText).toContain("Supports floating subtitles and quick keyboard control");
      expect(reportText).toContain("himomohi/AirTranslate");
      expect(reportText).not.toContain("AirTranslate 开源 macOS 实时翻译工具，支持悬浮字幕和快捷键控制");
      expect(reportText).not.toContain("AirTranslate 是面向 macOS 的实时翻译工具");
      expect(reportText).not.toContain("### 🛠️ 【新工具/资源】");
      expect(reportText).not.toContain("项目更新：值得开发者关注的新资源");
      expect(reportText).not.toContain("建议优先检查项目活跃度");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("writeRunOutputs does not render a separate new tools section", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "x-follow-report-"));
    try {
      const tweets = [
        {
          tweetId: "666",
          url: "https://x.com/dotey/status/666",
          timeline: "following" as const,
          authorName: "dotey",
          authorHandle: "dotey",
          createdAt: "2026-05-16T07:00:00.000Z",
          collectedAt: "2026-05-16T07:05:00.000Z",
          text: "这是一篇关于 AI 行业观察的长文，不是工具发布。 http://x.com/i/article/2055299017211248640 https://www.weibo.com/3030737153/QFua0djaW https://www.langchain.com/blog/interrupt-2026-overview https://xiangyangqiaomu.feishu.cn/docx/E0opdrVLtoi2vrxQP0jcqrGPnlc",
          language: "zh",
          links: [
            "http://x.com/i/article/2055299017211248640",
            "https://www.weibo.com/3030737153/QFua0djaW",
            "https://www.langchain.com/blog/interrupt-2026-overview",
            "https://xiangyangqiaomu.feishu.cn/docx/E0opdrVLtoi2vrxQP0jcqrGPnlc",
          ],
          media: [],
          hashtags: [],
          metrics: { replies: 2, reposts: 10, likes: 100, quotes: 1, views: 10000 },
          isReply: false,
          isRepost: false,
          isQuote: false,
        },
        {
          tweetId: "777",
          url: "https://x.com/op7418/status/777",
          timeline: "following" as const,
          authorName: "op7418",
          authorHandle: "op7418",
          createdAt: "2026-05-16T07:10:00.000Z",
          collectedAt: "2026-05-16T07:15:00.000Z",
          text: "飞书 CLI 适合自动化办公和 Agent 工作流。 https://github.com/larksuite/cli",
          language: "zh",
          links: ["https://github.com/larksuite/cli"],
          media: [],
          hashtags: [],
          metrics: { replies: 3, reposts: 20, likes: 200, quotes: 3, views: 10000 },
          isReply: false,
          isRepost: false,
          isQuote: false,
        },
      ];

      const result = await writeRunOutputs({
        tweets,
        rawPages: [],
        outputDir: tmp,
        timeline: "following",
        periodStart: "2026-05-16T00:00:00+08:00",
        periodEnd: "2026-05-16T23:59:59+08:00",
        language: "zh-CN",
        skipped: 0,
        errors: [],
        now: new Date("2026-05-16T14:20:09+08:00"),
      });

      const reportText = await readFile(result.reportPath, "utf8");

      expect(reportText).toContain("larksuite/cli");
      expect(reportText).toContain("### 🛠️ 【工具】");
      expect(reportText).not.toContain("### 🛠️ 【新工具/资源】");
      expect(reportText).toContain("weibo.com");
      expect(reportText).toContain("x.com/i/article");
      expect(reportText).toContain("langchain.com/blog/interrupt");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("writeRunOutputs includes generic developer-relevant tweets as news items", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "x-follow-report-"));
    try {
      const tweets = Array.from({ length: 8 }, (_, index) => ({
        tweetId: String(800 + index),
        url: `https://x.com/dev/status/${800 + index}`,
        timeline: "following" as const,
        authorName: "Developer",
        authorHandle: "dev",
        createdAt: "2026-05-16T08:00:00.000Z",
        collectedAt: "2026-05-16T08:05:00.000Z",
        text: `开发者分享 AI coding workflow 第 ${index + 1} 条实践：如何拆分任务、验证代码并减少人工返工。`,
        language: "zh",
        links: [],
        media: [],
        hashtags: [],
        metrics: { replies: index, reposts: index, likes: 100 - index, quotes: 0, views: 1000 },
        isReply: false,
        isRepost: false,
        isQuote: false,
      }));

      const result = await writeRunOutputs({
        tweets,
        rawPages: [],
        outputDir: tmp,
        timeline: "following",
        periodStart: "2026-05-16T00:00:00+08:00",
        periodEnd: "2026-05-16T23:59:59+08:00",
        language: "zh-CN",
        skipped: 0,
        errors: [],
        now: new Date("2026-05-16T14:35:09+08:00"),
      });

      const reportText = await readFile(result.reportPath, "utf8");
      const newsCount = [...reportText.matchAll(/^### /gm)].filter((match) => !match.input.slice(match.index).startsWith("### 🧭") && !match.input.slice(match.index).startsWith("### ⚠️")).length;

      expect(newsCount).toBe(8);
      expect(reportText).toContain("开发者分享 AI coding workflow 第 8 条实践");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
