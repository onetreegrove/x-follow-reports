import { describe, expect, it, vi } from "vitest";
import { fetchReports } from "./reports";

describe("fetchReports", () => {
  it("loads report summaries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          reports: [
            {
              id: "a",
              title: "报告",
              kind: "晚报",
              date: "2026-05/19",
              path: "2026-05/19/a.md",
              excerpt: "",
              createdAtMs: 1
            }
          ]
        })
      })
    );

    await expect(fetchReports()).resolves.toHaveLength(1);
  });
});
