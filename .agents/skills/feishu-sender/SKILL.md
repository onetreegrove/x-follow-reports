---
name: feishu-sender
description: 将 Markdown 报告通过飞书自定义机器人 webhook 以富文本 post 消息发送。支持自动查找最新报告、从 .env 读取 webhook、dry-run 预检、链接转换。适用于任何需要把 Markdown 文件推送到飞书群的场景。
---

# 飞书富文本发送

## 概览

将本地 Markdown 报告转换为飞书 `msg_type: "post"` 富文本结构，并通过飞书自定义机器人 webhook 分片发送。脚本不依赖任何外部大模型 API。

## 使用方式

### 最简调用（自动选最新报告 + 自动读取 webhook）

```bash
cd .agents/skills/feishu-sender/scripts
bun install
bun feishu.ts
```

- **报告**：自动从项目根目录扫描 `YYYY-MM/DD/*.md` 结构，选取修改时间最新的文件。
- **webhook**：按优先级依次查找：
  1. `--webhook` 参数
  2. `FEISHU_WEBHOOK` 环境变量
  3. 项目根 `.env` 文件中的 `FEISHU_WEBHOOK=...`
  4. 以上都未找到时，交互式引导用户输入，并自动追加到 `.env`（已在 `.gitignore` 中忽略，不会提交到 git）。

### 指定报告或 webhook

```bash
bun feishu.ts --report /path/to/report.md
bun feishu.ts --report /path/to/report.md --webhook "https://open.feishu.cn/open-apis/bot/v2/hook/..."
FEISHU_WEBHOOK="https://..." bun feishu.ts
```

### Dry-run 预检

发送前检查分片数量和 payload 大小，不实际请求 webhook（无需 webhook 地址）：

```bash
bun feishu.ts --dry-run
bun feishu.ts --report /path/to/report.md --dry-run
```

### 完整参数

```
--report <path>         要发送的 Markdown 报告（省略时自动选最新报告）
--webhook <url>         飞书自定义机器人 webhook（也可用 FEISHU_WEBHOOK 或 .env）
--max-bytes <n>         单条富文本 payload 字节上限，默认 13000
--dry-run               只打印分片信息，不实际发送
--project-root <dir>    项目根目录（用于查找最新报告和 .env），默认自动推断
--help, -h              显示帮助
```

## Webhook 配置说明

webhook 地址读取优先级（高 → 低）：

1. `--webhook` 命令行参数
2. `FEISHU_WEBHOOK` 环境变量
3. 项目根 `.env` 文件（`FEISHU_WEBHOOK=https://...`）
4. 交互引导：若以上均未配置，脚本会提示用户输入，并自动写入 `.env`

`.env` 已在项目 `.gitignore` 中配置忽略，不会被提交到 git 仓库。

## 规则

- 将 Markdown 标题、段落、列表、`[文本](URL)` 链接转换为飞书 `post` 富文本结构。
- 单条消息超过字节上限时自动拆成多条，每条均携带报告标题和元信息。
- **不要**给飞书富文本元素添加 `style` 字段；自定义机器人 webhook 会返回 `unknown content value`。
- 发送成功必须确认飞书接口返回 `code: 0`；否则报告发送失败并保留本地文件。

## 失败处理

- 飞书 webhook 返回非 `code: 0`：打印接口错误，退出码非零，**不删除**本地 Markdown 文件。
- 网络超时或连接失败：同上处理。
- `--report` 文件不存在：立即报错退出。
- 项目中无任何 `YYYY-MM/DD/*.md` 报告文件时，报错并提示使用 `--report` 指定路径。
