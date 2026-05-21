import { describe, expect, it } from "vitest";
import {
  deriveReportPath,
  idToRelativePath,
  isValidReportPath,
  relativePathToId
} from "./reportPaths";

describe("reportPaths", () => {
  it("accepts only report markdown paths", () => {
    expect(isValidReportPath("2026-05/19/144437-晚报.md")).toBe(true);
    expect(isValidReportPath("2026-05/19/report.md")).toBe(true);
    expect(isValidReportPath("../secret.md")).toBe(false);
    expect(isValidReportPath("/tmp/secret.md")).toBe(false);
    expect(isValidReportPath("2026/05/19.md")).toBe(false);
    expect(isValidReportPath("2026-05/19/report.txt")).toBe(false);
  });

  it("round-trips ids and relative paths", () => {
    const path = "2026-05/19/144437-晚报.md";
    const id = relativePathToId(path);

    expect(idToRelativePath(id)).toBe(path);
  });

  it("derives a report path from generatedAt and kind", () => {
    expect(deriveReportPath("2026-05-19T06:44:37.000Z", "晚报")).toBe(
      "2026-05/19/144437-晚报.md"
    );
  });
});
