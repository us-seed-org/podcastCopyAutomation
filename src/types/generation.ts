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
  archetype: string;
  emotionalTrigger: string;
  platformNotes: string;
}

export interface ChapterTitle {
  timestamp: string;
  title: string;
}

export interface GenerationOutput {
  youtubeTitles: TitleOption[];
  spotifyTitles: TitleOption[];
  youtubeDescription: string;
  spotifyDescription: string;
  chapters: ChapterTitle[];
}
