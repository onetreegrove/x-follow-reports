import { describe, expect, it } from "vitest";
import { parseReportMarkdown } from "./reportParser";

describe("parseReportMarkdown", () => {
  it("extracts metadata and excerpt from 今日要点", () => {
    const markdown = `# AI 开发者晚报 2026-05-19

生成时间：2026-05-19 14:44:37  
覆盖时间：2026-05-18 14:44 至 2026-05-19 14:44（Asia/Shanghai）  
来源：X Following 时间线，共抓取 82 条，整理 31 条相关动态。

## 今日要点

- Claude Design 将所有套餐 token limit 翻倍。
- OpenAI Developers 介绍 Codex 桌面端远程连接。

## 资讯

### Claude Design 将所有套餐 token limit 翻倍

正文。
`;

    const result = parseReportMarkdown(markdown, "2026-05/19/144437-晚报.md", 1779173077000);

    expect(result.title).toBe("AI 开发者晚报 2026-05-19");
    expect(result.kind).toBe("晚报");
    expect(result.generatedAt).toBe("2026-05-19 14:44:37");
    expect(result.period).toContain("2026-05-18 14:44");
    expect(result.source).toContain("X Following");
    expect(result.excerpt).toContain("Claude Design");
    expect(result.itemCount).toBe(1);
  });
});
