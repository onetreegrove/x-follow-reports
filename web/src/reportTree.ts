import type { ReportKind, ReportSummary } from "./types/report";

export type ReportTreeItem = ReportSummary & {
  time: string;
};

export type ReportKindGroup = {
  kind: ReportKind;
  reports: ReportTreeItem[];
};

export type ReportDayGroup = {
  day: string;
  kinds: ReportKindGroup[];
};

export type ReportMonthGroup = {
  month: string;
  days: ReportDayGroup[];
};

const KIND_ORDER: ReportKind[] = ["早报", "午报", "晚报", "未知"];

export function buildReportTree(reports: ReportSummary[]): ReportMonthGroup[] {
  const months = new Map<string, Map<string, Map<ReportKind, ReportTreeItem[]>>>();

  for (const report of reports) {
    const match = report.path.match(/^(\d{4}-\d{2})\/(\d{2})\/(\d{2})(\d{2})(\d{2})/);
    const month = match?.[1] || report.path.slice(0, 7);
    const day = match?.[2] || report.path.slice(8, 10);
    const time = match ? `${match[3]}:${match[4]}:${match[5]}` : "--:--:--";

    if (!months.has(month)) months.set(month, new Map());
    const days = months.get(month)!;
    if (!days.has(day)) days.set(day, new Map());
    const kinds = days.get(day)!;
    if (!kinds.has(report.kind)) kinds.set(report.kind, []);
    kinds.get(report.kind)!.push({ ...report, time });
  }

  return [...months.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, days]) => ({
      month,
      days: [...days.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([day, kinds]) => ({
          day,
          kinds: [...kinds.entries()]
            .sort(([a], [b]) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b))
            .map(([kind, items]) => ({
              kind,
              reports: items.sort((a, b) => b.createdAtMs - a.createdAtMs)
            }))
        }))
    }));
}
