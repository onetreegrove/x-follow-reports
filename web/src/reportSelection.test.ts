import { describe, expect, it } from "vitest";
import { resolveVisibleSelection } from "./reportSelection";
import type { ReportSummary } from "./types/report";

const reports: ReportSummary[] = [
  {
    id: "newest",
    title: "AI 开发者晚报",
    kind: "晚报",
    date: "2026-05/23",
    path: "2026-05/23/152731-晚报.md",
    excerpt: "",
    createdAtMs: 3
  },
  {
    id: "morning",
    title: "AI 开发者早报",
    kind: "早报",
    date: "2026-05/23",
    path: "2026-05/23/090000-早报.md",
    excerpt: "",
    createdAtMs: 2
  }
];

describe("resolveVisibleSelection", () => {
  it("keeps the selected report when it is still visible", () => {
    expect(resolveVisibleSelection(reports, "morning")).toBe("morning");
  });

  it("selects the first visible report when the current report is filtered out", () => {
    expect(resolveVisibleSelection([reports[0]], "morning")).toBe("newest");
  });

  it("clears selection when no reports are visible", () => {
    expect(resolveVisibleSelection([], "morning")).toBeUndefined();
  });
});
