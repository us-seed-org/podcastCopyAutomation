export type PipelineEventType =
  | "title_generated"
  | "title_scored"
  | "title_rejected"
  | "title_rewritten"
  | "title_selected"
  | "guardrail_violation"
  | "dedup_removed"
  | "thumbnail_refined"
  | "pairwise_result"
  | "pass_summary"
  | "pipeline_warning";

export interface PipelineTraceEntry {
  id?: string;
  timestamp: number;
  pass: string;
  event: PipelineEventType;
  title?: string;
  model?: string;
  platform?: string;
  archetype?: string;
  scoreTotal?: number;
  scoreDimensions?: Record<string, number>;
  thumbnailText?: string;
  thumbnailScoreTotal?: number;
  thumbnailScoreDimensions?: Record<string, number>;
  reason?: string;
  rewriteAttempt?: number;
  pairwiseRank?: number;
  pairwiseWins?: number;
  metadata?: Record<string, unknown>;
}

export interface ModelBreakdown {
  model: string;
  generated: number;
  selected: number;
  avgScore: number;
}

export interface PassDuration {
  pass: string;
  durationMs: number;
}

export interface PipelineSummary {
  totalGenerated: number;
  totalSelected: number;
  totalRejected: number;
  rewriteRate: number;
  weakDimensions: { dimension: string; avgScore: number; maxScore: number }[];
  modelBreakdown: ModelBreakdown[];
  passDurations: PassDuration[];
  totalDurationMs: number;
}
