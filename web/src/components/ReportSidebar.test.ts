import { renderToString } from "@vue/server-renderer";
import { createSSRApp, h } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReportSidebar from "./ReportSidebar.vue";
import type { ReportSummary } from "../types/report";

const reports: ReportSummary[] = [
  {
    id: "late",
    title: "AI 开发者晚报",
    kind: "晚报",
    date: "2026-05-19",
    path: "2026-05/19/144437-晚报.md",
    excerpt: "",
    itemCount: 16,
    createdAtMs: 2
  },
  {
    id: "morning",
    title: "AI 开发者早报",
    kind: "早报",
    date: "2026-05-18",
    path: "2026-05/18/094355-早报.md",
    excerpt: "",
    createdAtMs: 1
  }
];

function renderSidebar(collapsed: boolean, overrides: Partial<InstanceType<typeof ReportSidebar>["$props"]> = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(ReportSidebar, {
          reports,
          selectedId: "morning",
          collapsed,
          loading: false,
          error: undefined,
          ...overrides
        })
    })
  );
}

describe("ReportSidebar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-19T12:00:00+08:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("collapses the whole sidebar container and hides the report tree", async () => {
    const html = await renderSidebar(true);

    expect(html).toContain("sidebar collapsed");
    expect(html).not.toContain("2026-05");
    expect(html).not.toContain("09:43:55");
  });

  it("shows a collapse control when expanded", async () => {
    const html = await renderSidebar(false);

    expect(html).toContain('aria-label="收起侧边栏"');
    expect(html).toContain("X Reports");
    expect(html).toContain("2026-05");
  });

  it("renders month, day, and kind groups as collapsible menu levels", async () => {
    const html = await renderSidebar(false);

    expect(html).toContain('<details class="monthGroup" open>');
    expect(html).toContain('<summary class="monthLabel">2026-05</summary>');
    expect(html).toContain('<details class="dayGroup" open>');
    expect(html).toContain("19日 (周二)");
    expect(html).toContain('<details class="kindGroup" open>');
    expect(html).toContain('<summary class="kindLabel">晚报</summary>');
  });

  it("only opens today's report branch by default", async () => {
    const html = await renderSidebar(false);

    expect(html).toContain("19日 (周二)");
    expect(html).toContain("18日 (周一)");
    expect(html).toContain('<details class="kindGroup"><summary class="kindLabel">早报</summary>');
  });

  it("shows a sidebar error when the report list fails", async () => {
    const html = await renderSidebar(false, { error: "报告列表加载失败" });

    expect(html).toContain("报告列表加载失败");
    expect(html).toContain("sidebarState error");
  });

  it("shows an empty sidebar state when no reports match", async () => {
    const html = await renderSidebar(false, { reports: [] });

    expect(html).toContain("没有匹配报告");
    expect(html).toContain("sidebarState");
  });

  it("renders item count, title attribute, and current state in each report item", async () => {
    const html = await renderSidebar(false, { selectedId: "late" });

    expect(html).toContain('title="AI 开发者晚报"');
    expect(html).toContain("16 条");
    expect(html).toContain('aria-current="true"');
  });
});
