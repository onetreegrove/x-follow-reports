import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { collectTimeline, formatMaterialsJson, parseExtendConfigText, parseExtendConfigTextWithWarnings, writeMaterialOutputs } from "./main.js";
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
`);

    expect(parsed.outputDir).toBe("./custom");
    expect(parsed.timeline).toBe("home");
    expect(parsed.maxItems).toBe(12);
    expect(parsed.lookbackHours).toBe(6);
    expect(parsed.includeReplies).toBe(true);
    expect(parsed.includeReposts).toBe(false);
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

  test("writeMaterialOutputs returns report materials without writing markdown", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "x-follow-report-"));
    try {
      const { tweets } = extractTimelineTweets(fixture, { timeline: "following" });

      const materials = await writeMaterialOutputs({
        tweets,
        outputDir: tmp,
        timeline: "following",
        periodStart: "2026-05-15T00:00:00+08:00",
        periodEnd: "2026-05-15T23:59:59+08:00",
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
      await expect(readFile(expectedReportPath, "utf8")).rejects.toThrow();
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("formatMaterialsJson keeps standard materials schema separate from raw debug tweets", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "x-follow-report-"));
    try {
      const { tweets } = extractTimelineTweets(fixture, { timeline: "following" });

      const materials = await writeMaterialOutputs({
        tweets,
        outputDir: tmp,
        timeline: "following",
        periodStart: "2026-05-15T00:00:00+08:00",
        periodEnd: "2026-05-15T23:59:59+08:00",
        skipped: 0,
        errors: [],
        now: new Date("2026-05-15T18:05:09+08:00"),
      });

      const standard = JSON.parse(formatMaterialsJson(materials));
      const debug = JSON.parse(formatMaterialsJson(materials, { rawTweets: tweets }));

      expect(standard.rawTweets).toBeUndefined();
      expect(standard.tweets[0].id).toBe("111");
      expect(standard.tweets[0].tweetId).toBeUndefined();
      expect(debug.tweets[0].id).toBe("111");
      expect(debug.rawTweets[0].tweetId).toBe("111");
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

});
