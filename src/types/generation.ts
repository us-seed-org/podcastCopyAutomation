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
  sourceModel?: string;
  pairwiseWins?: number;
  pairwiseRank?: number;
}

export interface RejectedTitle {
  title: string;
  rejectionReason: string;
}

export type Tier = 1 | 2 | 3;

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
