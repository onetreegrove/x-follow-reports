---
name: server-reporter
description: 将 x-follow-report 生成的报告通过 HTTP POST 上报至本地或远程的 reports server。支持自动查找最新报告、自动读取配置与 Token、dry-run 预检和覆盖模式。
---

# 报告服务器上报

## 概览

将本地生成的 AI 开发者早/午/晚报 Markdown 报告上报到 `@[server]`。脚本会自动识别报告所属的日期与时段（早/午/晚报），通过 `POST /api/reports` 接口写入服务器。脚本不依赖任何外部大模型 API。

## 使用方式

### 最简调用（自动选最新报告 + 自动读取配置）

```bash
cd .agents/skills/server-reporter/scripts
bun install
bun reporter.ts
```

- **报告**：自动从本地 `.x-follow-report/report-outputs/` 或项目根目录下扫描最新的 `YYYY-MM/DD/*.md` 格式文件。
- **配置与 Token**：按优先级依次查找：
  1. `--server-url` 和 `--token` 参数
  2. `REPORT_SERVER_URL` 和 `REPORT_UPLOAD_TOKEN` 环境变量
  3. 项目根 `.env` 文件中的 `REPORT_SERVER_URL=...` 和 `REPORT_UPLOAD_TOKEN=...`
  4. 以上均未配置时，若处于非 `--dry-run` 模式，脚本会自动引导输入，并保存至 `.env`。

### 指定报告或自定义参数

```bash
# 指定特定报告并设置覆盖模式
bun reporter.ts --report ../../../.x-follow-report/report-outputs/2026-05/21/094908-早报.md --overwrite

# 指定上报服务器 URL 与 Token
bun reporter.ts --server-url "http://127.0.0.1:8787" --token "your-secret-token"
```

### Dry-run 预检

预检报告路径、内容大小与服务器配置，不实际发起网络请求：

```bash
bun reporter.ts --dry-run
bun reporter.ts --report /path/to/report.md --dry-run
```

### 完整参数

```
--report <path>         要上报的 Markdown 报告（省略时自动选最新报告）
--server-url <url>      上报服务器 URL（默认自 .env 或 http://127.0.0.1:8787）
--token <token>         上报授权 Token（也可用 REPORT_UPLOAD_TOKEN 或 .env）
--overwrite             若报告在服务器上已存在，强制覆盖（默认不覆盖报错）
--dry-run               只打印信息，不发起实际请求
--project-root <dir>    项目根目录，默认自动推断
--help, -h              显示帮助
```

## 配置说明

上报接口需要配置 `x-report-token` 鉴权头。读取授权 Token 的优先级（高 → 低）：

1. `--token` 命令行参数
2. `REPORT_UPLOAD_TOKEN` 环境变量
3. 项目根 `.env` 文件（`REPORT_UPLOAD_TOKEN=...`）
4. 交互引导：若以上均未配置，脚本会提示用户输入，并自动追加写入 `.env`。

`.env` 已在项目 `.gitignore` 中忽略，不会提交至 Git。

## 失败处理

- **服务器鉴权失败 (401)**：打印无效 Token，退出码非零。
- **报告已存在且未指定 `--overwrite`**：提示报告已存在，退出码非零。
- **网络连接失败**：提示连接服务器错误，保留本地文件，退出码非零。
- **路径格式不符**：如果报告文件路径不包含 `YYYY-MM/DD/HHMMSS-*.md` 结构，则报错拒绝上报。
