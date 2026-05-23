---
name: feishu-sender
description: 将 Markdown 报告的“今日要点”提取为简洁美观的飞书自定义机器人富文本消息，并在报告包含远端地址时附带完整报告链接。支持自动查找最新报告、读取 .env webhook、dry-run 预检，适合把 x-follow-report 早报、午报、晚报摘要推送到飞书群。
---

# 飞书今日要点推送

## 目标

这个技能只把报告里的 `## 今日要点` 发送到飞书，不发送整份报告正文。若报告元信息或末尾包含 `远端地址`、`报告地址`、`完整报告`、`查看全文` 等远端链接，消息底部附带“点击查看完整报告”。

发送效果应保持短、清晰、适合群消息阅读：

- 标题：`<报告标题>｜今日要点`
- 顶部：生成时间、来源
- 主体：编号要点列表
- 底部：可选“点击查看完整报告”链接

## 使用方式

```bash
cd .agents/skills/feishu-sender/scripts
bun install
bun feishu.ts
```

默认行为：

- 自动从项目报告目录中选择最新 Markdown 报告。
- 自动读取 webhook：`--webhook` 参数 > `FEISHU_WEBHOOK` 环境变量 > 项目根 `.env`。
- 若未配置 webhook，交互式提示输入并写入 `.env`。

## 常用命令

```bash
bun feishu.ts --dry-run
bun feishu.ts --report /path/to/report.md --dry-run
bun feishu.ts --report /path/to/report.md --webhook "https://open.feishu.cn/open-apis/bot/v2/hook/..."
FEISHU_WEBHOOK="https://..." bun feishu.ts
```

## 参数

```text
--report <path>         要发送的 Markdown 报告；省略时自动选最新报告
--webhook <url>         飞书自定义机器人 webhook
--max-bytes <n>         单条富文本 payload 字节上限，默认 13000
--dry-run               只打印消息数量和 payload 大小，不发送
--project-root <dir>    项目根目录，默认从脚本位置自动推断
--help, -h              显示帮助
```

## 内容提取规则

- 优先提取一级标题 `# ...` 作为报告标题。
- 从 `生成时间`、`来源` 或 `数据源` 元信息中提取顶部说明。
- 只读取 `## 今日要点`、`## 核心要点`、`## 要点` 或 `## 摘要` 章节，到下一个一级或二级标题前停止。
- 要点会去掉 Markdown 粗体、行内代码、列表符号，并重新编号。
- 远端链接会从元信息和报告末尾若干行中识别，匹配 `远端地址`、`报告地址`、`在线地址`、`查看全文`、`完整报告` 等提示词。
- 若找不到要点章节，发送一条提示用户打开完整报告查看；有远端地址时仍附带链接。

## 飞书富文本约束

- 使用自定义机器人 `msg_type: "post"`。
- 只使用 `text` 和 `a` 元素。
- 不要添加 `style` 字段；飞书 webhook 会返回 `unknown content value`。
- 发送成功必须确认接口返回 `code: 0`。

## 验证

修改脚本后运行：

```bash
cd .agents/skills/feishu-sender/scripts
bun test
bun feishu.ts --dry-run
```
