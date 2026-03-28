import type { ResearchOutput } from "./research";
import type { GenerationOutput, GenerationMode } from "./generation";
import type { YouTubeAnalysis } from "./youtube";
import type { PipelineTraceEntry, PipelineSummary } from "./pipeline-trace";

export type PipelineStep = "idle" | "research" | "youtube" | "generation" | "complete" | "error";

export interface PipelineState {
  step: PipelineStep;
  activeMode: GenerationMode | null;
  researchStatus: string;
  youtubeStatus: string;
  generationStatus: string;
  research: ResearchOutput | null;
  youtube: YouTubeAnalysis | null;
  generation: GenerationOutput | null;
  error: string | null;
  isRegenerating: boolean;
  traceEntries: PipelineTraceEntry[];
  pipelineSummary: PipelineSummary | null;
  channelConfigId?: string;
}

export interface FormInput {
  transcript: string;
  transcriptTimestamps: boolean;
  guestName?: string;
  podcastName: string;
  episodeDescription: string;
  coHosts?: string;
  youtubeChannelUrl?: string;
  targetAudience?: string;
  channelConfigId?: string;
}

export type PipelineAction =
  | { type: "START" }
  | { type: "RESEARCH_STATUS"; status: string }
  | { type: "RESEARCH_COMPLETE"; data: ResearchOutput }
  | { type: "RESEARCH_ERROR"; error: string }
  | { type: "YOUTUBE_STATUS"; status: string }
  | { type: "YOUTUBE_COMPLETE"; data: YouTubeAnalysis }
  | { type: "YOUTUBE_ERROR"; error: string }
  | { type: "GENERATION_STATUS"; status: string }
  | { type: "GENERATION_COMPLETE"; data: GenerationOutput }
  | { type: "GENERATION_ERROR"; error: string; preserveResults?: boolean }
  | { type: "RESET" }
  | { type: "REGENERATE"; mode: GenerationMode; status: string }
  | { type: "CANCEL" }
  | { type: "PIPELINE_TRACE"; entry: PipelineTraceEntry }
  | { type: "PIPELINE_SUMMARY"; summary: PipelineSummary };
