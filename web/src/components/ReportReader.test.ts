import { renderToString } from "@vue/server-renderer";
import { createSSRApp, h } from "vue";
import { describe, expect, it } from "vitest";
import type { ReportDetail } from "../types/report";
import ReportReader from "./ReportReader.vue";

function reportWithMarkdown(markdown: string): ReportDetail {
  return {
    id: "daily",
    title: "AI 开发者晚报",
    kind: "晚报",
    date: "2026-07/07",
    path: "2026-07/07/daily.md",
    excerpt: "",
    createdAtMs: 1783420800000,
    markdown
  };
}

function renderReader(markdown: string) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(ReportReader, {
          loading: false,
          report: reportWithMarkdown(markdown)
        })
    })
  );
}

describe("ReportReader", () => {
  it("uses readable text for tweet source links instead of the raw URL", async () => {
    const tweetUrl = "https://x.com/example/status/123456789";
    const html = await renderReader(`# 报告\n\n推文源地址：[${tweetUrl}](${tweetUrl})`);

    expect(html).toContain(`href="${tweetUrl}"`);
    expect(html).toContain('class="tweetSourceLink"');
    expect(html).toContain(">查看原文</a>");
    expect(html).not.toContain(`>${tweetUrl}</a>`);
  });
});
