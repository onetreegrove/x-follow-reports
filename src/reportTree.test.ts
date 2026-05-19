import { describe, expect, it } from "vitest";
import { buildReportTree } from "./reportTree";
import type { ReportSummary } from "./types/report";

const reports: ReportSummary[] = [
  {
    id: "late",
    title: "AI 开发者晚报",
    kind: "晚报",
    date: "2026-05/19",
    path: "2026-05/19/144437-晚报.md",
    excerpt: "",
    createdAtMs: 3
  },
  {
    id: "noon",
    title: "AI 开发者午报",
    kind: "午报",
    date: "2026-05/18",
    path: "2026-05/18/132114-午报.md",
    excerpt: "",
    createdAtMs: 2
  },
  {
    id: "morning",
    title: "AI 开发者早报",
    kind: "早报",
    date: "2026-05/18",
    path: "2026-05/18/092038-早报.md",
    excerpt: "",
    createdAtMs: 1
  }
];

describe("buildReportTree", () => {
  it("groups reports by month, day, kind, and time", () => {
    const tree = buildReportTree(reports);

    expect(tree).toHaveLength(1);
    expect(tree[0].month).toBe("2026-05");
    expect(tree[0].days.map((day) => day.day)).toEqual(["19", "18"]);
    expect(tree[0].days[0].kinds[0].kind).toBe("晚报");
    expect(tree[0].days[0].kinds[0].reports[0].time).toBe("14:44:37");
    expect(tree[0].days[1].kinds.map((kind) => kind.kind)).toEqual(["早报", "午报"]);
  });
});
