# AI 开发者早/午/晚报结构

本文件描述当前 `x-follow-report` 的目标报告形态。脚本只导出结构化素材，最终 Markdown 正文由当前执行环境基于素材撰写。

## 标题

根据生成时刻决定：

- `# AI 开发者早报`
- `# AI 开发者午报`
- `# AI 开发者晚报`

## 文件路径

报告写入项目根目录下的日期结构：

```text
YYYY-MM/DD/HHMMSS-早报.md
YYYY-MM/DD/HHMMSS-午报.md
YYYY-MM/DD/HHMMSS-晚报.md
```

不要写入 skill 的 `scripts/` 目录，也不要生成 `x-follow-reports/` 目录或逐条推文 Markdown。

## 正文要求

- 使用中文写作。
- 每条资讯标题必须包含具体主体和动作。
- 摘要说明推文本身的具体内容，不使用“开发者社区信号”“产品发布与关键更新”“技术洞察与社区热议”等泛化模板话。
- 工具、论文、项目、链接都作为普通资讯条目处理，不单独创建“新工具/资源”栏目。
- 关联推文保留 X URL；外部链接可按上下文作为补充链接。

## 推荐结构

```markdown
# AI 开发者晚报

**生成时间**：2026-05-19 18:30:00
**数据源**：X 关注时间线
**分析条目**：42 条推文

---

### 🧭【概览】
重点账号：...

高频关键词：...

---

### 🤖【实战】具体主体做了什么
**内容摘要**：
...

*   **来源账号**：...
*   **相关链接**：...

**关联推文**：[查看原推](...)

---

### ⚠️【运行统计】
- 跳过/噪声条目：...
- 错误：...
```

## 素材 JSON

脚本默认向 stdout 打印素材 JSON；传入 `--materials-file` 时写入指定文件。核心字段：

- `reportKind`
- `generatedAt`
- `sourceLabel`
- `timeline`
- `totalTweets`
- `selectedTweets`
- `periodStart`
- `periodEnd`
- `outputPath`
- `focusAccounts`
- `keywords`
- `tweets`：每条素材包含 `id`、`url`、作者、正文、`links`、`media`、`hashtags`、互动数据和 flags
- `skipped`
- `errors`
- `warnings`

素材不得包含 Cookie、Token 或原始 API 响应。
