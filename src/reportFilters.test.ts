import { describe, expect, it } from "vitest";
import { filterReports } from "./reportFilters";
import type { ReportSummary } from "./types/report";

const reports: ReportSummary[] = [
  {
    id: "1",
    title: "AI 开发者晚报",
    kind: "晚报",
    date: "2026-05/19",
    path: "2026-05/19/a.md",
    excerpt: "Claude",
    createdAtMs: 2
  },
  {
    id: "2",
    title: "AI 开发者早报",
    kind: "早报",
    date: "2026-05/18",
    path: "2026-05/18/a.md",
    excerpt: "OpenAI",
    createdAtMs: 1
  }
];

describe("filterReports", () => {
  it("filters by kind and query", () => {
    expect(filterReports(reports, "claude", new Set(["晚报"]))).toHaveLength(1);
    expect(filterReports(reports, "claude", new Set(["早报"]))).toHaveLength(0);
  });
});
