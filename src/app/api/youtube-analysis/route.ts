import { analyzeChannel } from "@/lib/youtube";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { channelUrl, podcastTopic } = body;

    if (!channelUrl) {
      return Response.json({
        channel: null,
        recentVideos: [],
        topNicheVideos: [],
        titlePatterns: [],
        descriptionPattern: null,
        avgViews: 0,
        engagementBenchmarks: { avgLikeRate: 0, avgCommentRate: 0 },
      });
    }

    if (!process.env.YOUTUBE_API_KEY) {
      return Response.json(
        { error: "YouTube API key not configured" },
        { status: 500 }
      );
    }

    const analysis = await analyzeChannel(channelUrl, podcastTopic || "podcast");

    return Response.json(analysis);
  } catch (err) {
    const message = err instanceof Error ? err.message : "YouTube analysis failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
