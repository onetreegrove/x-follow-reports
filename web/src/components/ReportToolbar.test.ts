import { renderToString } from "@vue/server-renderer";
import { createSSRApp, h } from "vue";
import { describe, expect, it } from "vitest";
import ReportToolbar from "./ReportToolbar.vue";
import type { ReportKind } from "../types/report";
import type { ThemePreference } from "../theme";

function renderToolbar(sidebarCollapsed: boolean, overrides: Record<string, unknown> = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(ReportToolbar, {
          query: "",
          selectedKinds: new Set<ReportKind>(),
          loading: false,
          sidebarCollapsed,
          themePreference: "system" satisfies ThemePreference,
          activeTheme: "dark",
          totalCount: 12,
          visibleCount: 4,
          ...overrides
        })
    })
  );
}

describe("ReportToolbar", () => {
  it("renders a mobile sidebar toggle with the current drawer action", async () => {
    const collapsedHtml = await renderToolbar(true);
    const expandedHtml = await renderToolbar(false);

    expect(collapsedHtml).toContain("mobileSidebarButton");
    expect(collapsedHtml).toContain('aria-label="打开侧边栏"');
    expect(expandedHtml).toContain('aria-label="关闭侧边栏"');
  });

  it("renders result counts", async () => {
    const html = await renderToolbar(true);

    expect(html).toContain("显示 4 / 12");
  });

  it("renders a clear search button only when query is present", async () => {
    const emptyHtml = await renderToolbar(true, { query: "" });
    const queryHtml = await renderToolbar(true, { query: "claude" });

    expect(emptyHtml).not.toContain('aria-label="清空搜索"');
    expect(queryHtml).toContain('aria-label="清空搜索"');
  });

  it("marks active kind filters with aria-pressed", async () => {
    const html = await renderToolbar(true, { selectedKinds: new Set<ReportKind>(["晚报"]) });

    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });

  it("renders a theme setting that shows the active system theme", async () => {
    const html = await renderToolbar(true);

    expect(html).toContain('aria-label="主题设置"');
    expect(html).toContain("跟随系统（暗色）");
    expect(html).toContain("亮色");
    expect(html).toContain("暗色");
  });

  it("marks the selected theme preference", async () => {
    const html = await renderToolbar(true, { themePreference: "dark", activeTheme: "dark" });

    expect(html).toContain('<select class="themeSelect" value="dark"');
  });
});
