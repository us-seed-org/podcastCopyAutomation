export interface ScoreBreakdown {
  curiosityGap: number;
  authoritySignal: number;
  emotionalTrigger: number;
  trendingKeyword: number;
  specificity: number;
  characterCount: number;
  wordBalance: number;
  frontLoadHook: number;
  platformFit: number;
  total: number;
}

export interface ThumbnailTextScore {
  curiosityGap: number;
  emotionalPunch: number;
  titleComplement: number;
  brevityAndClarity: number;
  total: number;
}

export interface TitleOption {
  title: string;
  score: ScoreBreakdown;
  scrollStopReason: string;
  emotionalTrigger: string;
  platformNotes: string;
  thumbnailText?: string;
  thumbnailTextScore?: ThumbnailTextScore;
  archetype?: TitleArchetype;
  thumbnailArchetype?: ThumbnailArchetype;
  sourceModel?: string;
  pairwiseWins?: number;
  pairwiseRank?: number;
  titleResultId?: string;
  rewritten?: boolean;
}

export interface RejectedTitle {
  title: string;
  rejectionReason: string;
}

export type GenerationMode = "full" | "regenerate_title" | "rescore" | "rerank" | "recontent";
export type RerunMode = Exclude<GenerationMode, "full" | "regenerate_title">;

export type TitleArchetype = "authority_shocking" | "mechanism_outcome" | "curiosity_gap" | "negative_contrarian";
export type ThumbnailArchetype = "gut_punch" | "label" | "alarm" | "confrontation";

export type Tier = 0 | 1 | 2 | 3;

export interface TierClassification {
  tier: Tier;
  appliedCorrectly: boolean;
  verification: string;
}

export interface ChapterTitle {
  timestamp: string;
  title: string;
}

export interface DescriptionScore {
  hookQuality: number;
  structuralMatch: number;
  seoIntegration: number;
  humanVoice: number;
  total: number;
}

export interface ChapterScore {
  specificityAvg: number;
  activeVoice: number;
  patternCompliance: number;
  miniHookQuality: number;
  total: number;
}

export interface GenerationOutput {
  youtubeTitles: TitleOption[];
  spotifyTitles: TitleOption[];
  rejectedTitles: RejectedTitle[];
  tierClassification?: TierClassification;
  youtubeDescription?: string;
  spotifyDescription?: string;
  chapters?: ChapterTitle[];
  descriptionSEOKeywords?: string[];
  descriptionScore?: DescriptionScore;
  chapterScore?: ChapterScore;
}

export interface GenerationRequestPayload {
  research: unknown;
  youtubeAnalysis?: unknown;
  transcript: string;
  episodeDescription: string;
  mode?: GenerationMode;
  existingGeneration?: GenerationOutput;
  targetArchetype?: TitleArchetype;
}
