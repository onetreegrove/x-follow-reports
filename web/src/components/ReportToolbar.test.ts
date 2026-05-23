import { renderToString } from "@vue/server-renderer";
import { createSSRApp, h } from "vue";
import { describe, expect, it } from "vitest";
import ReportToolbar from "./ReportToolbar.vue";
import type { ThemePreference } from "../theme";

function renderToolbar(sidebarCollapsed: boolean, overrides: Record<string, unknown> = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(ReportToolbar, {
          loading: false,
          sidebarCollapsed,
          themePreference: "system" satisfies ThemePreference,
          activeTheme: "dark",
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

  it("omits search, result count, and report kind filters", async () => {
    const html = await renderToolbar(true);

    expect(html).not.toContain('aria-label="搜索报告"');
    expect(html).not.toContain("显示");
    expect(html).not.toContain("早报");
    expect(html).not.toContain("午报");
    expect(html).not.toContain("晚报");
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
