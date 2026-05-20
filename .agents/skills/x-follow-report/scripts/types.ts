export type TimelineKind = "following" | "home";

export type RunConfig = {
  outputDir: string;
  timeline: TimelineKind;
  maxItems: number;
  lookbackHours: number;
  includeReplies: boolean;
  includeReposts: boolean;
};

export type Metrics = {
  replies: number;
  reposts: number;
  likes: number;
  quotes: number;
  views: number;
};

export type NormalizedTweet = {
  tweetId: string;
  url: string;
  timeline: TimelineKind;
  authorName: string;
  authorHandle: string;
  createdAt: string;
  collectedAt: string;
  text: string;
  language: string;
  links: string[];
  media: string[];
  hashtags: string[];
  metrics: Metrics;
  isReply: boolean;
  isRepost: boolean;
  isQuote: boolean;
  context?: string;
};

export type TimelineExtractionResult = {
  tweets: NormalizedTweet[];
  bottomCursor?: string;
  topCursor?: string;
  skipped: number;
};

export type WriteMaterialOptions = {
  tweets: NormalizedTweet[];
  outputDir: string;
  timeline: TimelineKind;
  periodStart: string;
  periodEnd: string;
  skipped: number;
  errors: string[];
  warnings?: string[];
  now?: Date;
};

export type ReportKind = "早报" | "午报" | "晚报";

export type ReportMaterialTweet = {
  id: string;
  url: string;
  authorName: string;
  authorHandle: string;
  createdAt: string;
  text: string;
  language: string;
  links: string[];
  media: string[];
  hashtags: string[];
  metrics: Metrics;
  flags: {
    isReply: boolean;
    isRepost: boolean;
    isQuote: boolean;
  };
};

export type ReportMaterials = {
  version: 1;
  reportKind: ReportKind;
  generatedAt: string;
  sourceLabel: string;
  timeline: TimelineKind;
  totalTweets: number;
  selectedTweets: number;
  periodStart: string;
  periodEnd: string;
  outputPath: string;
  focusAccounts: string[];
  keywords: string[];
  tweets: ReportMaterialTweet[];
  skipped: number;
  errors: string[];
  warnings: string[];
};
