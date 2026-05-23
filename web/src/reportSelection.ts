import type { ReportSummary } from "./types/report";

export function resolveVisibleSelection(reports: ReportSummary[], selectedId?: string): string | undefined {
  if (selectedId && reports.some((report) => report.id === selectedId)) return selectedId;
  return reports[0]?.id;
}
