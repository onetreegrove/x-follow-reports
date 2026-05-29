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
          mobile: false,
          themePreference: "system" satisfies ThemePreference,
          activeTheme: "dark",
          ...overrides
        })
    })
  );
}

describe("ReportToolbar", () => {
  it("does not render the duplicate mobile sidebar toggle", async () => {
    const html = await renderToolbar(false);

    expect(html).not.toContain("mobileSidebarButton");
  });

  it("shows the collapsed sidebar toggle on desktop and mobile", async () => {
    const desktopHtml = await renderToolbar(true);
    const mobileHtml = await renderToolbar(true, { mobile: true });

    expect(desktopHtml).toContain("sidebarToggleIconBtn");
    expect(mobileHtml).toContain("sidebarToggleIconBtn");
  });

  it("does not render the duplicate mobile toggle on mobile", async () => {
    const collapsedHtml = await renderToolbar(true, { mobile: true });
    const expandedHtml = await renderToolbar(false, { mobile: true });

    expect(collapsedHtml).not.toContain("mobileSidebarButton");
    expect(expandedHtml).not.toContain("mobileSidebarButton");
  });

  it("omits search, result count, and report kind filters", async () => {
    const html = await renderToolbar(true);

    expect(html).not.toContain('aria-label="搜索报告"');
    expect(html).not.toContain("显示");
    expect(html).not.toContain("早报");
    expect(html).not.toContain("午报");
    expect(html).not.toContain("晚报");
  });

  it("renders segmented theme settings", async () => {
    const html = await renderToolbar(true);

    expect(html).toContain("themeControlGroup");
    expect(html).toContain('title="亮色"');
    expect(html).toContain('title="暗色"');
    expect(html).toContain('title="系统"');
  });

  it("marks the selected theme preference active", async () => {
    const html = await renderToolbar(true, { themePreference: "dark", activeTheme: "dark" });

    // The dark button should have 'active themeBtn' or 'themeBtn active'
    // Let's assert it contains 'active themeBtn' or 'active' and 'title="暗色"'
    expect(html).toContain('title="暗色"');
    // Dark option is active
    expect(html).toMatch(/class="[^"]*active[^"]*themeBtn[^"]*"[^>]*title="暗色"/);
  });
});
