export interface YouTubeVideoStats {
  title: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string;
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
  avgViews: number;
  engagementBenchmarks: {
    avgLikeRate: number;
    avgCommentRate: number;
  };
}
