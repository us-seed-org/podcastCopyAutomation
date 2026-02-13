export interface YouTubeVideoStats {
  title: string;
  description: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string;
}

export interface DescriptionPattern {
  openingStyle: string;
  subscribeBlock?: string;
  socialLinksFormat?: string;
  ctaBlock?: string;
  hashtagPattern?: string;
  newsletterPlug?: string;
  avgWordCount: number;
  structuralSkeleton: string[];
  consistentPhrases: string[];
  chapterFormat?: {
    usesEmDash: boolean;
    avgLength: number;
    style: string;
  };
  rawExamples: string[];
}

export interface YouTubeChannelInfo {
  channelId: string;
  channelTitle: string;
  subscriberCount: number;
  videoCount: number;
}

export interface YouTubeAnalysis {
  channel: YouTubeChannelInfo | null;
  recentVideos: YouTubeVideoStats[];
  topNicheVideos: YouTubeVideoStats[];
  titlePatterns: string[];
  descriptionPattern: DescriptionPattern | null;
  avgViews: number;
  engagementBenchmarks: {
    avgLikeRate: number;
    avgCommentRate: number;
  };
}
