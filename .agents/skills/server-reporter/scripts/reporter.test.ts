import { describe, expect, test, afterAll, beforeAll } from "bun:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { findLatestReport, resolveServerUrl, resolveToken } from "./reporter.js";

const TEST_DIR = path.join(import.meta.dirname, "test-sandbox");

describe("server-reporter configuration resolution", () => {
  test("resolveServerUrl prioritizes CLI argument over environment variables", async () => {
    const url = await resolveServerUrl("http://cli.example.com", {
      REPORT_SERVER_URL: "http://envfile.example.com"
    });
    expect(url).toBe("http://cli.example.com");
  });

  test("resolveServerUrl falls back to env variables", async () => {
    const url = await resolveServerUrl("", {
      REPORT_SERVER_URL: "http://envfile.example.com"
    });
    expect(url).toBe("http://envfile.example.com");
  });

  test("resolveServerUrl falls back to default URL", async () => {
    const url = await resolveServerUrl("", {});
    expect(url).toBe("http://127.0.0.1:8787");
  });

  test("resolveToken prioritizes CLI token", async () => {
    const token = await resolveToken("cli-token", "non-existent-path", {
      REPORT_UPLOAD_TOKEN: "env-file-token"
    }, false);
    expect(token).toBe("cli-token");
  });

  test("resolveToken falls back to env file token", async () => {
    const token = await resolveToken("", "non-existent-path", {
      REPORT_UPLOAD_TOKEN: "env-file-token"
    }, false);
    expect(token).toBe("env-file-token");
  });

  test("resolveToken returns placeholder in dry-run mode when no token is configured", async () => {
    const token = await resolveToken("", "non-existent-path", {}, true);
    expect(token).toBe("dry-run-token-placeholder");
  });
});

describe("server-reporter latest report scanner", () => {
  beforeAll(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test("findLatestReport returns null if no report files exist", async () => {
    const latest = await findLatestReport(TEST_DIR);
    expect(latest).toBeNull();
  });

  test("findLatestReport discovers the latest report under YYYY-MM/DD format", async () => {
    const outputDir = path.join(TEST_DIR, ".x-follow-report", "report-outputs");
    const day1Dir = path.join(outputDir, "2026-05", "20");
    const day2Dir = path.join(outputDir, "2026-05", "21");

    await mkdir(day1Dir, { recursive: true });
    await mkdir(day2Dir, { recursive: true });

    const file1 = path.join(day1Dir, "120000-午报.md");
    const file2 = path.join(day2Dir, "090000-早报.md");

    // Write file 1 (older)
    await writeFile(file1, "# Older Report");
    // Ensure file 2 is written slightly later or modified later
    await new Promise((r) => setTimeout(r, 100));
    await writeFile(file2, "# Newer Report");

    const latest = await findLatestReport(TEST_DIR);
    expect(latest).not.toBeNull();
    expect(latest).toContain("090000-早报.md");
  });
});
