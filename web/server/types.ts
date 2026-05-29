export * from "../shared/types/report";

export type PublishReportInput = {
  title?: string;
  kind?: Exclude<import("../shared/types/report").ReportKind, "未知">;
  generatedAt?: string;
  path?: string;
  content: string;
  overwrite?: boolean;
};

export type ApiError = {
  error: {
    code: string;
    message: string;
  };
};
