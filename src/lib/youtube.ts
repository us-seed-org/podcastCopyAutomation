import { google } from "googleapis";
import type { YouTubeAnalysis, YouTubeVideoStats, YouTubeChannelInfo, DescriptionPattern } from "@/types/youtube";

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
        description: video.snippet?.description || "",
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
        description: video.snippet?.description || "",
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
      descriptionPattern: null,
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

  const descriptionPattern = extractDescriptionPatterns(recentVideos);

  return {
    channel,
    recentVideos,
    topNicheVideos,
    titlePatterns,
    descriptionPattern,
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

function extractDescriptionPatterns(videos: YouTubeVideoStats[]): DescriptionPattern | null {
  const descriptions = videos
    .map((v) => v.description)
    .filter((d) => d && d.length > 50)
    .map((d) => d.slice(0, 2000)); // Truncate to prevent ReDoS
  if (descriptions.length < 3) return null;

  // Extract structural skeleton by finding common section markers
  const sectionMarkers: Record<string, number> = {};
  const consistentPhrases: string[] = [];

  // Find phrases that appear in 50%+ of descriptions
  for (const desc of descriptions) {
    const lines = desc.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      // Track recurring lines (subscribe CTAs, social links, etc.)
      const normalized = line.toLowerCase().replace(/https?:\/\/\S+/g, "[URL]");
      sectionMarkers[normalized] = (sectionMarkers[normalized] || 0) + 1;
    }
  }

  const threshold = descriptions.length * 0.4;
  for (const [phrase, count] of Object.entries(sectionMarkers)) {
    if (count >= threshold && phrase.length > 10) {
      consistentPhrases.push(phrase);
    }
  }

  // Detect subscribe/CTA blocks
  const subscribePatterns = descriptions.filter(
    (d) => /subscri/i.test(d) || /hit the bell/i.test(d) || /turn on notifications/i.test(d)
  );
  const subscribeBlock = subscribePatterns.length > threshold
    ? extractFirstMatchingBlock(descriptions, /subscri[\s\S]{0,500}?(?:\n\n|\n(?=[A-Z]))/i)
    : "";

  // Detect social links format - count @ occurrences first to avoid nested quantifiers
  const socialPatterns = descriptions.filter(
    (d) => /follow|twitter|instagram|tiktok|@/i.test(d)
  );
  const socialLinksFormat = socialPatterns.length > threshold
    ? extractFirstMatchingBlock(descriptions, /(?:follow|connect|find)[\s\S]{0,500}?@\w+[\s\S]{0,300}?@\w+[\s\S]{0,300}/i)
    : "";

  // Detect newsletter plugs
  const newsletterPatterns = descriptions.filter(
    (d) => /newsletter|sign up|signup|email list/i.test(d)
  );
  const newsletterPlug = newsletterPatterns.length > threshold
    ? extractFirstMatchingBlock(descriptions, /newsletter[\s\S]{0,500}?(?:\n\n|\n(?=[A-Z]))/i)
    : "";

  // Detect hashtag usage
  const hashtagDescriptions = descriptions.filter((d) => /#\w+/.test(d));
  const hashtagPattern = hashtagDescriptions.length > threshold
    ? extractHashtags(descriptions)
    : "";

  // Detect chapter format from descriptions that have timestamps
  const timestampDescriptions = descriptions.filter((d) => /\d{1,2}:\d{2}/.test(d));
  const chapterFormat = analyzeChapterFormat(timestampDescriptions);

  // Calculate average word count
  const avgWordCount = Math.round(
    descriptions.reduce((sum, d) => sum + d.split(/\s+/).length, 0) / descriptions.length
  );

  // Build structural skeleton (ordered sections found in most descriptions)
  const structuralSkeleton = buildStructuralSkeleton(descriptions);

  // Detect opening style
  const openingStyle = analyzeOpeningStyle(descriptions);

  // Detect CTA block
  const ctaBlock = extractFirstMatchingBlock(
    descriptions,
    /(?:like|comment|share|subscribe|leave a review)[\s\S]{0,500}?(?:\n\n|$)/i
  );

  // Keep raw examples (first 5, truncated)
  const rawExamples = descriptions.slice(0, 5).map((d) => d.slice(0, 1500));

  return {
    openingStyle,
    subscribeBlock,
    socialLinksFormat,
    ctaBlock,
    hashtagPattern,
    newsletterPlug,
    avgWordCount,
    structuralSkeleton,
    consistentPhrases,
    chapterFormat,
    rawExamples,
  };
}

function extractFirstMatchingBlock(descriptions: string[], pattern: RegExp): string {
  for (const desc of descriptions) {
    const match = desc.match(pattern);
    if (match) return match[0].trim().slice(0, 500);
  }
  return "";
}

function extractHashtags(descriptions: string[]): string {
  const allTags: Record<string, number> = {};
  for (const desc of descriptions) {
    const tags = desc.match(/#\w+/g) || [];
    for (const tag of tags) {
      allTags[tag.toLowerCase()] = (allTags[tag.toLowerCase()] || 0) + 1;
    }
  }
  return Object.entries(allTags)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag]) => tag)
    .join(" ");
}

function analyzeChapterFormat(timestampDescs: string[]): DescriptionPattern["chapterFormat"] {
  if (timestampDescs.length === 0) {
    return { usesEmDash: false, avgLength: 0, style: "none detected" };
  }

  let emDashCount = 0;
  const chapterLengths: number[] = [];

  for (const desc of timestampDescs) {
    const chapterLineMatches = desc.split("\n").filter((l) => /\d{1,2}:\d{2}/.test(l));
    for (const line of chapterLineMatches) {
      if (/[—–]/.test(line)) emDashCount++;
      // Extract the chapter title part (after timestamp)
      const titlePart = line.replace(/^\d{1,2}:\d{2}(?::\d{2})?\s*[-—–]?\s*/, "").trim();
      if (titlePart) chapterLengths.push(titlePart.length);
    }
  }

  const totalChapters = chapterLengths.length || 1;
  return {
    usesEmDash: emDashCount / totalChapters > 0.3,
    avgLength: Math.round(chapterLengths.reduce((s, l) => s + l, 0) / totalChapters),
    style: emDashCount / totalChapters > 0.3
      ? "timestamp — title (em dash separator)"
      : countChapterLines(timestampDescs) > 0
        ? detectChapterSeparator(timestampDescs)
        : "timestamp title (no separator)",
  };
}

function countChapterLines(descs: string[]): number {
  return descs.reduce((count, d) => count + d.split("\n").filter((l) => /\d{1,2}:\d{2}/.test(l)).length, 0);
}

function detectChapterSeparator(descs: string[]): string {
  let colonCount = 0;
  let dashCount = 0;
  let pipeCount = 0;
  let total = 0;

  for (const desc of descs) {
    const lines = desc.split("\n").filter((l) => /\d{1,2}:\d{2}/.test(l));
    for (const line of lines) {
      total++;
      const afterTimestamp = line.replace(/^\d{1,2}:\d{2}(?::\d{2})?\s*/, "");
      if (afterTimestamp.startsWith(":")) colonCount++;
      else if (afterTimestamp.startsWith("-") || afterTimestamp.startsWith("–")) dashCount++;
      else if (afterTimestamp.startsWith("|")) pipeCount++;
    }
  }

  if (total === 0) return "timestamp title (no separator)";
  if (colonCount / total > 0.3) return "timestamp: title (colon separator)";
  if (dashCount / total > 0.3) return "timestamp - title (hyphen separator)";
  if (pipeCount / total > 0.3) return "timestamp | title (pipe separator)";
  return "timestamp title (space only)";
}

function analyzeOpeningStyle(descriptions: string[]): string {
  const openings = descriptions.map((d) => {
    const firstPara = d.split(/\n\n/)[0] || d.split("\n")[0] || "";
    return firstPara.trim();
  }).filter(Boolean);

  if (openings.length === 0) return "unknown";

  // Check if openings typically start with a question
  // Look for leading question words or ? within first 30 chars (not anywhere in the text)
  const questionWords = /^(?:what|why|how|when|where|who|is|are|do|does|can|could|would|will)/i;
  const questionStarts = openings.filter((o) => {
    const first30 = o.slice(0, 30);
    return questionWords.test(first30) || first30.includes("?");
  }).length;
  if (questionStarts / openings.length > 0.4) return "question-led opening";

  // Check if openings start with "In this episode" or similar
  const episodeRefStarts = openings.filter(
    (o) => /^in this (episode|video|conversation)/i.test(o)
  ).length;
  if (episodeRefStarts / openings.length > 0.4) return "'In this episode...' format";

  // Check if openings are hook/teaser style (short, punchy)
  const shortOpenings = openings.filter((o) => o.split(/\s+/).length < 20).length;
  if (shortOpenings / openings.length > 0.5) return "short hook/teaser opening";

  // Check for guest-intro style
  const guestIntroStarts = openings.filter(
    (o) => /^(join|today|this week|we sit down|we welcome)/i.test(o)
  ).length;
  if (guestIntroStarts / openings.length > 0.3) return "guest-introduction opening";

  return "varied/editorial opening";
}

function buildStructuralSkeleton(descriptions: string[]): string[] {
  // Identify the common ordered sections across descriptions
  const sectionTypes = [
    { label: "Opening/hook paragraph", pattern: /^(?:you won'?t believe|don'?t miss|discover|learn|find out|ever wondered|here'?s (?:why|how)|what if|why|how|can |is |are |do |does |will |would |could |should )/i },
    { label: "Episode summary", pattern: /in this (episode|video|conversation)/i },
    { label: "Topics/highlights list", pattern: /(?:topics?|highlights?|we (?:cover|discuss|talk))/i },
    { label: "Chapter timestamps", pattern: /\d{1,2}:\d{2}/ },
    { label: "Guest bio/credentials", pattern: /(?:about|bio|guest)[\s:]/i },
    { label: "Subscribe CTA", pattern: /subscri/i },
    { label: "Social links", pattern: /(?:follow|twitter|instagram|@)/i },
    { label: "Newsletter plug", pattern: /newsletter|sign up/i },
    { label: "Hashtags", pattern: /#\w+/ },
    { label: "Engagement CTA", pattern: /(?:like|comment|share|leave a review)/i },
    { label: "Links/resources", pattern: /(?:links?|resources?|mentioned|referenced)/i },
    { label: "Sponsors/ads", pattern: /(?:sponsor|partner|brought to you|use code)/i },
  ];

  // Track both count and cumulative position for each section type
  const sectionData: Record<string, { count: number; totalPosition: number }> = {};
  
  for (const desc of descriptions) {
    const firstPara = desc.split(/\n\n/)[0] || desc.split("\n")[0] || "";
    let cumulativePosition = 0;
    
    for (const { label, pattern } of sectionTypes) {
      const textToTest = label === "Opening/hook paragraph" ? firstPara : desc;
      if (pattern.test(textToTest)) {
        if (!sectionData[label]) {
          sectionData[label] = { count: 0, totalPosition: 0 };
        }
        sectionData[label].count++;
        sectionData[label].totalPosition += cumulativePosition;
      }
      cumulativePosition++;
    }
  }

  const threshold = descriptions.length * 0.3;
  
  // Convert to array with average position, filter by threshold, and sort
  return Object.entries(sectionData)
    .filter(([, data]) => data.count >= threshold)
    .map(([label, data]) => ({
      label,
      count: data.count,
      avgPosition: data.totalPosition / data.count,
    }))
    .sort((a, b) => {
      // First sort by average position (to preserve document structure)
      if (a.avgPosition !== b.avgPosition) {
        return a.avgPosition - b.avgPosition;
      }
      // Then by frequency
      return b.count - a.count;
    })
    .map(({ label }) => label);
}
