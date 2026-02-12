import { google } from "googleapis";
import type { YouTubeAnalysis, YouTubeVideoStats, YouTubeChannelInfo } from "@/types/youtube";

const youtube = google.youtube({
  version: "v3",
  auth: process.env.YOUTUBE_API_KEY,
});

export async function resolveChannelId(input: string): Promise<string | null> {
  if (!input) return null;

  // Direct channel ID
  if (input.startsWith("UC") && input.length === 24) {
    return input;
  }

  // Extract from URL patterns
  let identifier = input;

  // Handle full URLs
  const urlPatterns = [
    /youtube\.com\/channel\/(UC[\w-]{22})/,
    /youtube\.com\/@([\w.-]+)/,
    /youtube\.com\/c\/([\w.-]+)/,
    /youtube\.com\/user\/([\w.-]+)/,
  ];

  for (const pattern of urlPatterns) {
    const match = input.match(pattern);
    if (match) {
      identifier = match[1];
      break;
    }
  }

  // If it's already a channel ID from URL
  if (identifier.startsWith("UC") && identifier.length === 24) {
    return identifier;
  }

  // Handle @ prefix
  if (identifier.startsWith("@")) {
    identifier = identifier.slice(1);
  }

  // Search for the channel by handle/name
  try {
    const searchRes = await youtube.search.list({
      part: ["snippet"],
      q: identifier,
      type: ["channel"],
      maxResults: 1,
    });

    const channelId = searchRes.data.items?.[0]?.snippet?.channelId;
    return channelId || null;
  } catch {
    return null;
  }
}

export async function getChannelInfo(channelId: string): Promise<YouTubeChannelInfo | null> {
  try {
    const res = await youtube.channels.list({
      part: ["snippet", "statistics"],
      id: [channelId],
    });

    const channel = res.data.items?.[0];
    if (!channel) return null;

    return {
      channelId,
      channelTitle: channel.snippet?.title || "",
      subscriberCount: parseInt(channel.statistics?.subscriberCount || "0"),
      videoCount: parseInt(channel.statistics?.videoCount || "0"),
    };
  } catch {
    return null;
  }
}

export async function getRecentVideos(channelId: string, maxResults = 15): Promise<YouTubeVideoStats[]> {
  try {
    const searchRes = await youtube.search.list({
      part: ["snippet"],
      channelId,
      order: "date",
      type: ["video"],
      maxResults,
    });

    const videoIds = searchRes.data.items
      ?.map((item) => item.id?.videoId)
      .filter(Boolean) as string[];

    if (!videoIds?.length) return [];

    const statsRes = await youtube.videos.list({
      part: ["statistics", "snippet"],
      id: videoIds,
    });

    return (
      statsRes.data.items?.map((video) => ({
        title: video.snippet?.title || "",
        viewCount: parseInt(video.statistics?.viewCount || "0"),
        likeCount: parseInt(video.statistics?.likeCount || "0"),
        commentCount: parseInt(video.statistics?.commentCount || "0"),
        publishedAt: video.snippet?.publishedAt || "",
      })) || []
    );
  } catch {
    return [];
  }
}

export async function getTopNicheVideos(
  query: string,
  maxResults = 10
): Promise<YouTubeVideoStats[]> {
  try {
    const searchRes = await youtube.search.list({
      part: ["snippet"],
      q: query,
      order: "viewCount",
      type: ["video"],
      maxResults,
    });

    const videoIds = searchRes.data.items
      ?.map((item) => item.id?.videoId)
      .filter(Boolean) as string[];

    if (!videoIds?.length) return [];

    const statsRes = await youtube.videos.list({
      part: ["statistics", "snippet"],
      id: videoIds,
    });

    return (
      statsRes.data.items?.map((video) => ({
        title: video.snippet?.title || "",
        viewCount: parseInt(video.statistics?.viewCount || "0"),
        likeCount: parseInt(video.statistics?.likeCount || "0"),
        commentCount: parseInt(video.statistics?.commentCount || "0"),
        publishedAt: video.snippet?.publishedAt || "",
      })) || []
    );
  } catch {
    return [];
  }
}

export async function analyzeChannel(channelUrl: string, podcastTopic: string): Promise<YouTubeAnalysis> {
  const channelId = await resolveChannelId(channelUrl);

  if (!channelId) {
    return {
      channel: null,
      recentVideos: [],
      topNicheVideos: [],
      titlePatterns: [],
      avgViews: 0,
      engagementBenchmarks: { avgLikeRate: 0, avgCommentRate: 0 },
    };
  }

  const [channel, recentVideos, topNicheVideos] = await Promise.all([
    getChannelInfo(channelId),
    getRecentVideos(channelId),
    getTopNicheVideos(podcastTopic),
  ]);

  const avgViews =
    recentVideos.length > 0
      ? recentVideos.reduce((sum, v) => sum + v.viewCount, 0) / recentVideos.length
      : 0;

  const engagementBenchmarks = {
    avgLikeRate:
      recentVideos.length > 0
        ? recentVideos.reduce((sum, v) => sum + (v.viewCount > 0 ? v.likeCount / v.viewCount : 0), 0) /
          recentVideos.length
        : 0,
    avgCommentRate:
      recentVideos.length > 0
        ? recentVideos.reduce((sum, v) => sum + (v.viewCount > 0 ? v.commentCount / v.viewCount : 0), 0) /
          recentVideos.length
        : 0,
  };

  const titlePatterns = extractTitlePatterns(recentVideos.map((v) => v.title));

  return {
    channel,
    recentVideos,
    topNicheVideos,
    titlePatterns,
    avgViews: Math.round(avgViews),
    engagementBenchmarks,
  };
}

function extractTitlePatterns(titles: string[]): string[] {
  const patterns: string[] = [];

  const hasNumbers = titles.filter((t) => /\d/.test(t)).length;
  if (hasNumbers > titles.length * 0.3) {
    patterns.push("Frequently uses numbers/statistics in titles");
  }

  const hasQuestion = titles.filter((t) => t.includes("?")).length;
  if (hasQuestion > titles.length * 0.2) {
    patterns.push("Often uses question format");
  }

  const hasPipe = titles.filter((t) => t.includes("|")).length;
  if (hasPipe > titles.length * 0.3) {
    patterns.push("Uses pipe separator (Name | Topic)");
  }

  const hasDash = titles.filter((t) => t.includes(" - ")).length;
  if (hasDash > titles.length * 0.3) {
    patterns.push("Uses dash separator (Topic - Name)");
  }

  const hasColon = titles.filter((t) => t.includes(":")).length;
  if (hasColon > titles.length * 0.3) {
    patterns.push("Uses colon format (Category: Topic)");
  }

  const hasQuotes = titles.filter((t) => /[""]/.test(t)).length;
  if (hasQuotes > titles.length * 0.2) {
    patterns.push("Uses quotes for direct speech/claims");
  }

  const avgLen = titles.reduce((sum, t) => sum + t.length, 0) / (titles.length || 1);
  patterns.push(`Average title length: ${Math.round(avgLen)} characters`);

  return patterns;
}
