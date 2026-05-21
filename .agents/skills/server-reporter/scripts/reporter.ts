import { existsSync, readFileSync } from "node:fs";
import { appendFile, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

const DEFAULT_SERVER_URL = "http://127.0.0.1:8787";

// ---------------------------------------------------------------------------
// Latest Report Scanner
// ---------------------------------------------------------------------------

/**
 * Scans both .x-follow-report/report-outputs and projectRoot for the newest report.
 */
export async function findLatestReport(projectRoot: string): Promise<string | null> {
  const searchPaths = [
    path.join(projectRoot, ".x-follow-report", "report-outputs"),
    projectRoot
  ];

  const reports: { filePath: string; mtime: number }[] = [];

  for (const baseDir of searchPaths) {
    let monthDirs: string[] = [];
    try {
      const entries = await readdir(baseDir);
      monthDirs = entries
        .filter((e) => /^\d{4}-\d{2}$/.test(e))
        .map((e) => path.join(baseDir, e));
    } catch {
      continue;
    }

    for (const monthDir of monthDirs) {
      let dayDirs: string[] = [];
      try {
        dayDirs = (await readdir(monthDir))
          .filter((e) => /^\d{2}$/.test(e))
          .map((e) => path.join(monthDir, e));
      } catch {
        continue;
      }

      for (const dayDir of dayDirs) {
        let files: string[] = [];
        try {
          files = (await readdir(dayDir))
            .filter((e) => e.endsWith(".md"))
            .map((e) => path.join(dayDir, e));
        } catch {
          continue;
        }

        for (const filePath of files) {
          try {
            const s = await stat(filePath);
            reports.push({ filePath, mtime: s.mtimeMs });
          } catch {
            // skip
          }
        }
      }
    }
  }

  if (reports.length === 0) return null;
  reports.sort((a, b) => b.mtime - a.mtime);
  return reports[0]!.filePath;
}

// ---------------------------------------------------------------------------
// Environment & Credentials Resolution
// ---------------------------------------------------------------------------

function readEnvFile(envPath: string): Record<string, string> {
  if (!existsSync(envPath)) return {};
  try {
    const text = readFileSync(envPath, "utf8");
    const result: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (key) result[key] = val;
    }
    return result;
  } catch {
    return {};
  }
}

async function appendEnvVar(envPath: string, key: string, value: string): Promise<void> {
  const line = `\n${key}=${value}\n`;
  await appendFile(envPath, line, "utf8");
}

function promptInput(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function resolveServerUrl(cliServerUrl: string, envVars: Record<string, string>): Promise<string> {
  if (cliServerUrl) return cliServerUrl;
  if (process.env.REPORT_SERVER_URL) return process.env.REPORT_SERVER_URL;
  if (envVars.REPORT_SERVER_URL) return envVars.REPORT_SERVER_URL;
  return DEFAULT_SERVER_URL;
}

export async function resolveToken(
  cliToken: string,
  envFilePath: string,
  envVars: Record<string, string>,
  dryRun: boolean
): Promise<string> {
  if (cliToken) return cliToken;
  if (process.env.REPORT_UPLOAD_TOKEN) return process.env.REPORT_UPLOAD_TOKEN;
  if (envVars.REPORT_UPLOAD_TOKEN) return envVars.REPORT_UPLOAD_TOKEN;

  if (dryRun) {
    return "dry-run-token-placeholder";
  }

  console.error(`[server-reporter] 未找到上报授权 Token。`);
  console.error(`  请提供在 server 中配置的 REPORT_UPLOAD_TOKEN。`);
  const token = await promptInput("请输入上报授权 Token：");
  if (!token) {
    throw new Error("Token 不能为空。");
  }
  await appendEnvVar(envFilePath, "REPORT_UPLOAD_TOKEN", token);
  console.error(`[server-reporter] Token 已保存至 ${envFilePath}。`);
  return token;
}

// ---------------------------------------------------------------------------
// CLI Execution
// ---------------------------------------------------------------------------

function printUsage(exitCode: number): never {
  const command = process.argv[1] ? `bun ${path.basename(process.argv[1])}` : "bun reporter.ts";
  console.log(`用法: ${command} [参数]

参数说明:
  --report <path>         要上报的 Markdown 报告（省略时自动选最新报告）
  --server-url <url>      上报服务器 URL（默认自 .env 或 ${DEFAULT_SERVER_URL}）
  --token <token>         上报授权 Token（也可用 REPORT_UPLOAD_TOKEN 或 .env）
  --overwrite             若报告在服务器上已存在，强制覆盖（默认不覆盖报错）
  --dry-run               只打印信息，不发起实际请求
  --project-root <dir>    项目根目录，默认自动推断
  --help, -h              显示帮助
`);
  process.exit(exitCode);
}

function requireValue(arg: string, value: string | undefined): string {
  if (value === undefined || value.startsWith("-")) {
    throw new Error(`参数 ${arg} 需要指定一个值。`);
  }
  return value;
}

async function main() {
  // Prevent executing when imported during testing
  if (process.env.NODE_ENV === "test") return;

  try {
    let reportPath = "";
    let cliServerUrl = "";
    let cliToken = "";
    let overwrite = false;
    let dryRun = false;
    let projectRoot = "";

    const argv = process.argv.slice(2);
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i]!;
      if (arg === "--help" || arg === "-h") {
        printUsage(0);
      } else if (arg === "--report") {
        reportPath = requireValue(arg, argv[++i]);
      } else if (arg === "--server-url") {
        cliServerUrl = requireValue(arg, argv[++i]);
      } else if (arg === "--token") {
        cliToken = requireValue(arg, argv[++i]);
      } else if (arg === "--overwrite") {
        overwrite = true;
      } else if (arg === "--dry-run") {
        dryRun = true;
      } else if (arg === "--project-root") {
        projectRoot = requireValue(arg, argv[++i]);
      } else {
        console.error(`未知参数：${arg}`);
        printUsage(1);
      }
    }

    // Infer project root
    if (!projectRoot) {
      const scriptDir = path.dirname(path.resolve(process.argv[1] ?? "."));
      projectRoot = path.resolve(scriptDir, "../../../../");
    }

    // Resolve report path
    if (!reportPath) {
      const latest = await findLatestReport(projectRoot);
      if (!latest) {
        throw new Error("未在项目根目录或 .x-follow-report/report-outputs 下找到任何报告。请使用 --report 指定路径。");
      }
      reportPath = latest;
      console.error(`[server-reporter] 自动选择最新报告：${reportPath}`);
    }

    if (!existsSync(reportPath)) {
      throw new Error(`报告文件不存在：${reportPath}`);
    }

    // Parse relative path matching YYYY-MM/DD/HHMMSS-*.md
    const relativePathMatch = reportPath.match(/(\d{4}-\d{2})\/(\d{2})\/([^/]+\.md)$/);
    if (!relativePathMatch) {
      throw new Error(`报告文件路径必须以 YYYY-MM/DD/HHMMSS-*.md 结构结尾。当前路径：${reportPath}`);
    }
    const relativePath = relativePathMatch[0];

    // Determine report kind
    let kind: "早报" | "午报" | "晚报" | undefined;
    if (relativePath.includes("早报")) kind = "早报";
    else if (relativePath.includes("午报")) kind = "午报";
    else if (relativePath.includes("晚报")) kind = "晚报";

    // Read content
    const content = await readFile(reportPath, "utf8");

    // Load environments & credentials
    const envFilePath = path.join(projectRoot, ".env");
    const envVars = readEnvFile(envFilePath);
    const serverUrl = await resolveServerUrl(cliServerUrl, envVars);
    const token = await resolveToken(cliToken, envFilePath, envVars, dryRun);

    console.error(`[server-reporter] 上报配置信息:`);
    console.error(`  服务器 URL: ${serverUrl}`);
    console.error(`  报告路径: ${relativePath}`);
    console.error(`  报告类型: ${kind ?? "未知"}`);
    console.error(`  大小: ${Buffer.byteLength(content, "utf8")} 字节`);
    console.error(`  模式: ${overwrite ? "覆盖" : "非覆盖"}`);

    if (dryRun) {
      console.error(`[server-reporter] (Dry-run) 预检通过，跳过实际发送。`);
      return;
    }

    console.error(`[server-reporter] 正在上报至服务器...`);
    const apiUrl = `${serverUrl.replace(/\/$/, "")}/api/reports`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-report-token": token
      },
      body: JSON.stringify({
        content,
        path: relativePath,
        kind,
        overwrite
      })
    });

    if (response.status === 201) {
      const resBody = (await response.json()) as { report: { id: string }; url: string };
      const viewUrl = `${serverUrl.replace(/\/$/, "")}${resBody.url}`;
      console.error(`[server-reporter] 上报成功！`);
      console.log(viewUrl);
    } else {
      let errorMessage = `HTTP 错误 ${response.status}`;
      try {
        const errJson = (await response.json()) as { error?: { code?: string; message?: string } };
        if (errJson.error?.message) {
          errorMessage = errJson.error.message;
        }
      } catch {
        // ignore
      }
      throw new Error(`上报失败：${errorMessage}`);
    }
  } catch (error) {
    console.error(`[server-reporter] 错误: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

main();
