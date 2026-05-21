import { renderToString } from "@vue/server-renderer";
import { createSSRApp, h } from "vue";
import { describe, expect, it } from "vitest";
import ReportToolbar from "./ReportToolbar.vue";
import type { ReportKind } from "../types/report";

function renderToolbar(sidebarCollapsed: boolean) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(ReportToolbar, {
          query: "",
          selectedKinds: new Set<ReportKind>(),
          loading: false,
          sidebarCollapsed
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
});
