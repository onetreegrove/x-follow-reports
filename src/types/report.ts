export type ReportKind = "早报" | "午报" | "晚报" | "未知";

export type ReportSummary = {
  id: string;
  title: string;
  kind: ReportKind;
  date: string;
  generatedAt?: string;
  period?: string;
  source?: string;
  path: string;
  excerpt: string;
  itemCount?: number;
  createdAtMs: number;
};

export type ReportDetail = ReportSummary & {
  markdown: string;
};
