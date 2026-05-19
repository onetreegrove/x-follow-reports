import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createReportIndex } from "./reportIndex";
import type { PublishReportInput } from "./types";

const port = Number(process.env.PORT || 8787);
const root = process.env.REPORT_ROOT ? path.resolve(process.env.REPORT_ROOT) : process.cwd();
const uploadToken = process.env.REPORT_UPLOAD_TOKEN;
const index = createReportIndex(root);

const server = createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: { code: "internal_error", message: "服务内部错误" } });
  }
});

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/api/reports") {
    sendJson(res, 200, { reports: await index.listReports() });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/reports/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/reports/".length));
    const report = await index.getReportById(id);
    if (!report) {
      sendJson(res, 404, { error: { code: "not_found", message: "报告不存在" } });
      return;
    }
    sendJson(res, 200, { report });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/reports") {
    if (!uploadToken) {
      sendJson(res, 503, { error: { code: "publishing_disabled", message: "未配置 REPORT_UPLOAD_TOKEN" } });
      return;
    }
    if (req.headers["x-report-token"] !== uploadToken) {
      sendJson(res, 401, { error: { code: "unauthorized", message: "上传 Token 无效" } });
      return;
    }

    try {
      const body = (await readJson(req)) as PublishReportInput;
      const report = await index.publishReport(body);
      sendJson(res, 201, { report, url: `/?report=${encodeURIComponent(report.id)}` });
    } catch (error) {
      sendJson(res, 400, {
        error: {
          code: "bad_request",
          message: error instanceof Error ? error.message : "请求无效"
        }
      });
    }
    return;
  }

  if (req.method === "GET" && !url.pathname.startsWith("/api")) {
    await serveStatic(url.pathname, res);
    return;
  }

  sendJson(res, 404, { error: { code: "not_found", message: "接口不存在" } });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(urlPath: string, res: ServerResponse) {
  const requested = urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "");
  const filePath = path.join(process.cwd(), "dist", requested);
  try {
    const body = await readFile(filePath);
    res.writeHead(200);
    res.end(body);
  } catch {
    try {
      const body = await readFile(path.join(process.cwd(), "dist", "index.html"));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(body);
    } catch {
      sendJson(res, 404, { error: { code: "not_found", message: "静态文件不存在" } });
    }
  }
}

server.listen(port, "127.0.0.1", () => {
  console.log(`Report API listening on http://127.0.0.1:${port}`);
});
