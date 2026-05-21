import type { ReportKind, ReportSummary } from "./types/report";

export function filterReports(reports: ReportSummary[], query: string, kinds: Set<ReportKind>): ReportSummary[] {
  const normalized = query.trim().toLowerCase();
  return reports.filter((report) => {
    const kindMatches = kinds.size === 0 || kinds.has(report.kind);
    const haystack = [report.title, report.excerpt, report.kind, report.path, report.source, report.period]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return kindMatches && (!normalized || haystack.includes(normalized));
  });
}
