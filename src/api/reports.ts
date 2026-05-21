import type { ReportDetail, ReportSummary } from "../types/report";

export async function fetchReports(): Promise<ReportSummary[]> {
  const response = await fetch("/api/reports");
  if (!response.ok) throw new Error("报告列表加载失败");
  const data = await response.json();
  return data.reports;
}

export async function fetchReport(id: string): Promise<ReportDetail> {
  const response = await fetch(`/api/reports/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error("报告详情加载失败");
  const data = await response.json();
  return data.report;
}
