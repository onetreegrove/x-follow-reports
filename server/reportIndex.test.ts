import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createReportIndex } from "./reportIndex";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "x-follow-reports-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("createReportIndex", () => {
  it("indexes markdown reports under date directories", async () => {
    await mkdir(path.join(root, "2026-05/19"), { recursive: true });
    await writeFile(
      path.join(root, "2026-05/19/144437-晚报.md"),
      "# AI 开发者晚报 2026-05-19\n\n生成时间：2026-05-19 14:44:37\n\n## 今日要点\n\n- 一条重点。",
      "utf8"
    );

    const index = createReportIndex(root);
    const reports = await index.listReports();

    expect(reports).toHaveLength(1);
    expect(reports[0].title).toBe("AI 开发者晚报 2026-05-19");
    expect(reports[0].kind).toBe("晚报");
  });

  it("writes a new report and rejects overwrite by default", async () => {
    const index = createReportIndex(root);
    const result = await index.publishReport({
      kind: "晚报",
      generatedAt: "2026-05-19T06:44:37.000Z",
      content: "# AI 开发者晚报 2026-05-19\n\n正文"
    });

    expect(result.path).toBe("2026-05/19/144437-晚报.md");
    await expect(index.publishReport({ path: result.path, content: "# duplicate" })).rejects.toThrow(
      "Report already exists"
    );

    const content = await readFile(path.join(root, result.path), "utf8");
    expect(content).toContain("AI 开发者晚报");
  });
});
