import { describe, expect, test } from "bun:test";

import { buildFeishuPostMessages, markdownLineToFeishuElements } from "./feishu.js";

const sampleMarkdown = `# AI 开发者早报

**生成时间**：2026-05-18 09:20:38
**数据源**：X 关注时间线

---

### 🚀 【发布】OpenAI 推出 Codex 移动端预览
**内容摘要**：
OpenAI 将 Codex 引入移动端，用户可以远程查看任务进度。
*   **核心功能**：移动端承担远程查看和轻量交互角色。

**关联推文**：[查看原推](https://x.com/example/status/1)

---

### 🛠️ 【工具】netviz 提供浏览器拖拽式网络架构图
**内容摘要**：
netviz 可以在浏览器里拖拽绘制服务器、代理和数据库之间的数据流向。
*   **适用场景**：适合快速解释网络拓扑。

**关联推文**：[查看原推](https://x.com/example/status/2)
`;

describe("feishu webhook rich text", () => {
  test("markdownLineToFeishuElements converts markdown links to Feishu rich text links", () => {
    const elements = markdownLineToFeishuElements("**关联推文**：[查看原推](https://x.com/example/status/1)");

    expect(elements).toEqual([
      { tag: "text", text: "关联推文：" },
      { tag: "a", text: "查看原推", href: "https://x.com/example/status/1" },
    ]);
  });

  test("buildFeishuPostMessages creates valid post payloads without unsupported style fields", () => {
    const messages = buildFeishuPostMessages({
      markdown: sampleMarkdown,
      reportPath: "/tmp/report.md",
      maxBytes: 1200,
    });

    expect(messages.length).toBeGreaterThan(1);
    for (const message of messages) {
      expect(message.msg_type).toBe("post");
      expect(message.content.post.zh_cn.title).toStartWith("AI 开发者早报");
      expect(message.content.post.zh_cn.title).not.toContain("X 关注流");
      expect(JSON.stringify(message)).not.toContain('"style"');
      expect(JSON.stringify(message)).toContain('"tag":"a"');
      expect(Buffer.byteLength(JSON.stringify(message), "utf8")).toBeLessThanOrEqual(1200);
    }
  });

  test("buildFeishuPostMessages formats regular report headings and bullets for readability", () => {
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

    expect(flatText).toContain("【今日要点】");
    expect(flatText).toContain("• Codex 团队修复使用限制错乱问题。");
    expect(flatText).toContain("▌ Codex 团队修复订阅用户使用限制错乱问题");
    expect(flatText).toContain("────────────────");
    expect(JSON.stringify(messages)).not.toContain("## ");
    expect(JSON.stringify(messages)).not.toContain("### ");
  });

  test("buildFeishuPostMessages splits oversized sections by line", () => {
    const markdown = `# AI 开发者晚报

生成时间：2026-05-18 20:00:00

---

### 超长动态
${"A".repeat(5000)}
`;

    const messages = buildFeishuPostMessages({ markdown, maxBytes: 1200 });

    expect(messages.length).toBeGreaterThan(1);
    for (const message of messages) {
      expect(Buffer.byteLength(JSON.stringify(message), "utf8")).toBeLessThanOrEqual(1200);
    }
  });
});
