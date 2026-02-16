export interface ScoreBreakdown {
  curiosityGap: number;
  authoritySignal: number;
  emotionalTrigger: number;
  trendingKeyword: number;
  specificity: number;
  characterCount: number;
  wordBalance: number;
  frontLoadHook: number;
  thumbnailComplement: number;
  total: number;
}

export interface TitleOption {
  title: string;
  score: ScoreBreakdown;
  scrollStopReason: string;
  emotionalTrigger: string;
  platformNotes: string;
}

export interface RejectedTitle {
  title: string;
  rejectionReason: string;
}

export interface ChapterTitle {
  timestamp: string;
  title: string;
}

export type Tier = 1 | 2 | 3;

export interface TierClassification {
  tier: Tier;
  appliedCorrectly: boolean;
  verification: string;
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
  noBannedPatterns: number;
  miniHookQuality: number;
  total: number;
}

export interface GenerationOutput {
  youtubeTitles: TitleOption[];
  spotifyTitles: TitleOption[];
  rejectedTitles: RejectedTitle[];
  youtubeDescription?: string;
  spotifyDescription?: string;
  chapters?: ChapterTitle[];
  tierClassification?: TierClassification;
  descriptionScore?: DescriptionScore;
  chapterScore?: ChapterScore;
}
