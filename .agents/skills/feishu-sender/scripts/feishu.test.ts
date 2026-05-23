import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { buildFeishuPostMessages, extractReportSummary, findLatestReport, markdownLineToFeishuElements } from "./feishu.js";

const sampleMarkdown = `# AI 开发者早报

**生成时间**：2026-05-18 09:20:38
**数据源**：X 关注时间线
远端地址：https://x-ai.example.com/report/2026-05-18

---

## 今日要点

- OpenAI 将 Codex 引入移动端，用户可以远程查看任务进度。
- netviz 提供浏览器拖拽式网络架构图，适合快速解释网络拓扑。

## 资讯

### OpenAI 推出 Codex 移动端预览
**内容摘要**：
OpenAI 将 Codex 引入移动端，用户可以远程查看任务进度。

**关联推文**：[查看原推](https://x.com/example/status/1)

### netviz 提供浏览器拖拽式网络架构图
**内容摘要**：
netviz 可以在浏览器里拖拽绘制服务器、代理和数据库之间的数据流向。
`;

describe("feishu webhook highlight digest", () => {
  test("markdownLineToFeishuElements converts markdown links to Feishu rich text links", () => {
    const elements = markdownLineToFeishuElements("**关联推文**：[查看原推](https://x.com/example/status/1)");

    expect(elements).toEqual([
      { tag: "text", text: "关联推文：" },
      { tag: "a", text: "查看原推", href: "https://x.com/example/status/1" },
    ]);
  });

  test("extractReportSummary keeps only highlights and remote report URL", () => {
    const summary = extractReportSummary(sampleMarkdown);

    expect(summary.title).toBe("AI 开发者早报");
    expect(summary.generatedAt).toBe("2026-05-18 09:20:38");
    expect(summary.source).toBe("X 关注时间线");
    expect(summary.remoteUrl).toBe("https://x-ai.example.com/report/2026-05-18");
    expect(summary.highlights).toEqual([
      "OpenAI 将 Codex 引入移动端，用户可以远程查看任务进度。",
      "netviz 提供浏览器拖拽式网络架构图，适合快速解释网络拓扑。",
    ]);
  });

  test("buildFeishuPostMessages sends a compact highlight digest instead of the full report", () => {
    const messages = buildFeishuPostMessages({
      markdown: sampleMarkdown,
      reportPath: "/tmp/report.md",
      maxBytes: 13_000,
    });

    expect(messages).toHaveLength(1);
    for (const message of messages) {
      expect(message.msg_type).toBe("post");
      expect(message.content.post.zh_cn.title).toBe("AI 开发者早报｜今日要点");
      expect(JSON.stringify(message)).not.toContain('"style"');
      expect(JSON.stringify(message)).toContain('"tag":"a"');
      expect(JSON.stringify(message)).toContain("https://x-ai.example.com/report/2026-05-18");
      expect(JSON.stringify(message)).toContain("点击查看完整报告");
      expect(JSON.stringify(message)).not.toContain("点击查看远端报告");
      expect(JSON.stringify(message)).not.toContain("关联推文");
      expect(JSON.stringify(message)).not.toContain("内容摘要");
    }
  });

  test("buildFeishuPostMessages formats highlights for Feishu readability", () => {
    const markdown = `# AI 开发者午报 2026-05-18

生成时间：2026-05-18 13:21:14
来源：X Following 时间线

## 今日要点

- Codex 团队修复使用限制错乱问题。

## 资讯

### Codex 团队修复订阅用户使用限制错乱问题

团队确认异常已恢复。

关联推文：[恢复正常](https://x.com/example/status/1)
`;

    const messages = buildFeishuPostMessages({ markdown, maxBytes: 13_000 });
    const content = messages[0]!.content.post.zh_cn.content;
    const flatText = content.flat().map((element) => element.text).join("\n");

    expect(messages[0]!.content.post.zh_cn.title).toBe("AI 开发者午报 2026-05-18｜今日要点");
    expect(flatText).toContain("生成时间：2026-05-18 13:21:14  |  来源：X Following 时间线");
    expect(flatText).toContain("────────────────");
    expect(flatText).toContain("1. Codex 团队修复使用限制错乱问题。");
    expect(flatText).not.toContain("📌 AI 开发者午报");
    expect(flatText).not.toContain("今日要点");
    expect(flatText).not.toContain("团队确认异常已恢复");
    expect(JSON.stringify(messages)).not.toContain("## ");
    expect(JSON.stringify(messages)).not.toContain("### ");
  });

  test("buildFeishuPostMessages splits oversized highlight lines", () => {
    const markdown = `# AI 开发者晚报

生成时间：2026-05-18 20:00:00

---

## 今日要点

- ${"A".repeat(5000)}

## 资讯

### 超长动态
这段正文不应发送。
`;

    const messages = buildFeishuPostMessages({ markdown, maxBytes: 1200 });

    expect(messages.length).toBeGreaterThan(1);
    for (const message of messages) {
      expect(Buffer.byteLength(JSON.stringify(message), "utf8")).toBeLessThanOrEqual(1200);
      expect(JSON.stringify(message)).not.toContain("这段正文不应发送");
    }
  });

  test("findLatestReport scans x-follow report output directory", async () => {
    const root = path.join(tmpdir(), `feishu-sender-${Date.now()}`);
    const reportDir = path.join(root, ".x-follow-report", "report-outputs", "2026-05", "23");
    const reportPath = path.join(reportDir, "142232-晚报.md");
    const previewPath = path.join(reportDir, "142233-飞书预览.md");
    await mkdir(reportDir, { recursive: true });
    await writeFile(reportPath, sampleMarkdown, "utf8");
    await writeFile(previewPath, sampleMarkdown, "utf8");

    await expect(findLatestReport(root)).resolves.toBe(reportPath);
  });
});
