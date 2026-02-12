export interface GuestResearch {
  name: string;
  bio: string;
  credentials: string[];
  socialPresence: string;
  controversies: string;
  authorityLabel: string;
}

export interface BrandAnalysis {
  podcastName: string;
  titleFormat: string;
  voiceDescription: string;
  audienceProfile: string;
}

export interface TranscriptAnalysis {
  topClaims: string[];
  specificNumbers: string[];
  emotionalMoments: string[];
  clickableMoment: string;
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
