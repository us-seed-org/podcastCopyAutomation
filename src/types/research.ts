export interface GuestTier {
  tier: 0 | 1 | 2 | 3;
  reasoning: string;
  youtubeRecommendation: string;
}

export interface GuestResearch {
  name: string;
  bio: string;
  credentials: string[];
  socialPresence: string;
  controversies: string;
  authorityLabel: string;
  guestTier: GuestTier;
}

export interface BrandAnalysis {
  podcastName: string;
  titleFormat: string;
  voiceDescription: string;
  audienceProfile: string;
}

export interface HotTake {
  quote: string;
  topic: string;
  whyClickable: string;
  type: "contrarian" | "shocking_stat" | "bold_prediction" | "debunking" | "provocative_opinion";
  heatScore: number;
  viewerStakes: string;
  sharpenedVersion: string;
}

export interface TranscriptAnalysis {
  hotTakes: HotTake[];
  hotTakeTemperature: "hot" | "warm" | "cold";
  conceptualReframe: string | null;
  topClaims: string[];
  specificNumbers: string[];
  emotionalMoments: string[];
  clickableMoment: string;
  competitiveLandscape?: string;
  topicSegments: TopicSegment[];
  trendingKeywords: string[];
}

export interface TopicSegment {
  timestamp: string;
  topic: string;
  summary: string;
}

export interface ResearchOutput {
  guest: GuestResearch;
  brand: BrandAnalysis;
  transcript: TranscriptAnalysis;
  trendingTopics: string[];
  searchQueriesUsed: string[];
}
