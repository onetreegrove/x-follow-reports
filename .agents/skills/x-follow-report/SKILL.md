---
name: x-follow-report
description: 抓取用户的 X/Twitter 关注流或主页时间线，使用非官方 X Web/API 凭据采集内容，并导出 AI 开发者早/午/晚报素材。当用户要求抓取、总结、分析、监控或报告 X 关注列表消息流、Following feed、Home timeline 时使用。
---

# X 关注流报告

## 概览

使用此 skill 抓取用户的 X 关注流或主页时间线。脚本只采集并导出结构化素材：默认向 stdout 打印素材 JSON；传入 `--materials-file` 时写入指定文件。当前执行环境根据素材直接撰写中文 AI 开发者早/午/晚报，并按照日期结构保存到项目根目录。脚本不生成兜底 Markdown 报告。

此 skill 必须保持独立。不要调用、依赖、导入或委托给其他 X-to-Markdown 类 skill。

## 必须确认同意

抓取 X 数据前，必须确认用户同意使用非官方 X Web/API 行为。

同意文件位置：
- macOS: `~/Library/Application Support/x-follow-report/consent.json`
- Linux: `~/.local/share/x-follow-report/consent.json`

如果文件存在且包含 `accepted: true`，打印简短风险提示后继续。否则，展示免责声明并请求用户授权。

## 配置

按以下顺序查找配置：
1. `.x-follow-report/EXTEND.md`
2. `${XDG_CONFIG_HOME:-$HOME/.config}/x-follow-report/EXTEND.md`
3. `$HOME/.x-follow-report/EXTEND.md`

`EXTEND.md` 只支持简单 `key: value` 行，不是完整 Markdown/YAML 解析器。支持键：

- `output_dir`
- `timeline`
- `max_items`
- `lookback_hours`
- `include_replies`
- `include_reposts`

## 认证

按以下顺序使用凭据：
1. 环境变量：`X_AUTH_TOKEN`、`X_CT0`
2. 用户明确提供的项目本地认证文件
3. 从浏览器提取（需批准）

不要打印 Token 或 Cookie。不要提交凭据。

## 工作流

优先使用内置 Bun TypeScript 脚本执行抓取：

```bash
cd .agents/skills/x-follow-report/scripts
bun install
bun main.ts --timeline following --max-items 100 --lookback-hours 24 --materials-file /tmp/x-follow-materials.json
```

执行流程：
1. **确认授权**：检查 `consent.json`。
2. **数据采集**：分次请求 X API，直到满足时间窗口（默认 24h）或条目数限制。
3. **素材导出**：默认向 stdout 打印结构化推文事实；如传入 `--materials-file` 则写入指定文件。不包含 Cookie、Token 或原始 API 响应。
4. **报告撰写**：当前执行环境读取素材，按中文新闻资讯逻辑生成标题、摘要、要点和关联推文。
5. **文件落盘**：将最终 Markdown 写入素材中的 `outputPath`，路径格式为 `YYYY-MM/DD/HHMMSS-早|午|晚报.md`。
6. **质量检查**：写完后扫描泛化模板话，确认没有 `开发者社区信号`、`产品发布与关键更新`、`新工具/资源` 等表达。
7. **可选发送**：如果用户要求发到飞书群，使用 `feishu.ts` 将 Markdown 转换为飞书 webhook 富文本 `post` 消息并分片发送。

## AI 开发者早/午/晚报生成规则

### 1. 标题与时间判定
根据生成时刻的本地时间决定标题及文件名后缀：
- **00:00 - 12:00**：AI 开发者早报
- **12:00 - 14:00**：AI 开发者午报
- **14:00 之后**：AI 开发者晚报

### 2. 存储规范 (重要)
- **存储位置**：项目根目录。
- **目录结构**：`YYYY-MM/DD/HHMMSS-早|午|晚报.md`
- **写入方式**：使用 `write_file` 写入。**严禁**生成 `x-follow-reports/` 目录或逐条推文的 `.md` 文件。

### 3. 资讯写作规则

- 不需要 `OPENAI_API_KEY`，也不从脚本调用任何大模型 API。
- 脚本只导出素材，报告正文由当前执行环境撰写；没有兜底 Markdown 输出。
- 所有说明性文字使用中文；产品名、账号、模型名、URL 可保留原文。
- 每条资讯标题必须包含具体主体和动作，让读者一眼看出发生了什么。
- 摘要必须说明该动态的具体内容，不允许使用“开发者社区信号”“产品发布与关键更新”“技术洞察与社区热议”等泛化表达。
- 不设置资讯条数上限；只过滤明显无关噪声。
- 不再生成独立的“新工具/资源”栏目。工具、项目、链接都按普通资讯条目处理。

执行日报时优先使用：

```bash
cd .agents/skills/x-follow-report/scripts
bun main.ts --timeline following --max-items 100 --lookback-hours 24 --materials-file /tmp/x-follow-materials.json
```

然后读取 `/tmp/x-follow-materials.json`，将报告写入其中的 `outputPath`。

### 4. 飞书 webhook 富文本发送

当用户要求通过飞书 webhook 发送报告时，必须以富文本 `post` 消息发送，不要把 Markdown 原文当纯文本发送。

使用内置脚本：

```bash
cd .agents/skills/x-follow-report/scripts
FEISHU_WEBHOOK="https://open.feishu.cn/open-apis/bot/v2/hook/..." bun feishu.ts --report /path/to/report.md
```

也可以直接传参：

```bash
bun feishu.ts --report /path/to/report.md --webhook "https://open.feishu.cn/open-apis/bot/v2/hook/..."
```

发送前可 dry-run 检查分片数量和 payload 大小：

```bash
bun feishu.ts --report /path/to/report.md --dry-run
```

规则：
- `feishu.ts` 会把 Markdown 标题、段落、列表和 `[文本](URL)` 链接转换成飞书 `msg_type: "post"` 富文本结构。
- 单条内容过长时自动拆成多条富文本消息。
- 不要在脚本中硬编码 webhook 地址；使用 `--webhook` 或 `FEISHU_WEBHOOK`。
- 不要给飞书富文本元素添加 `style` 字段；自定义机器人 webhook 会返回 `unknown content value`。
- 发送成功必须确认飞书接口返回 `code: 0`。

## 失败处理
- `401`：提示刷新 Token。
- `429` 或后续分页抓取失败：停止继续抓取；如果已有推文，导出已有素材并在 `errors` 中记录失败原因；如果没有任何推文则报错。
- 响应结构变化：说明解析失败，不编造数据。
- 飞书 webhook 返回非 `code: 0`：报告发送失败，保留本地 Markdown 文件并展示接口错误。
