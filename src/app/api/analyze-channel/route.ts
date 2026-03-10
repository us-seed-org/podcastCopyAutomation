import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// ── Helpers ─────────────────────────────────────────────────────────────────

function cleanChannelUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  url = url.replace(
    /\/(videos|featured|shorts|streams|playlists|community|about|channels)\s*\/?$/i,
    ""
  );
  url = url.replace(/\/+$/, "");
  return url;
}

async function resolveChannelId(channelUrl: string): Promise<string> {
  let url = cleanChannelUrl(channelUrl);

  const handleMatch = url.match(/@([\w.-]+)/);
  if (handleMatch) {
    url = `https://www.youtube.com/@${handleMatch[1]}`;
  } else if (!url.startsWith("http")) {
    url = `https://www.youtube.com/${url}`;
  }

  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error("Only HTTPS YouTube URLs are supported");
  }
  const allowedHosts = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"];
  if (!allowedHosts.includes(parsed.hostname)) {
    throw new Error("URL must be a YouTube channel URL");
  }

  console.log("[Analyze] Fetching channel page:", url);
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; bot)" },
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch channel page: ${resp.status}`);
  }

  const html = await resp.text();

  const channelIdMatch = html.match(
    /(?:"channelId"|"externalId"|channel_id=|\/channel\/)(UC[\w-]{22})/
  );
  if (channelIdMatch) return channelIdMatch[1];

  const rssMatch = html.match(/channel_id=(UC[\w-]{22})/);
  if (rssMatch) return rssMatch[1];

  throw new Error(
    "Could not resolve channel ID from URL. Try using the channel's direct URL."
  );
}

function getChannelNameFromRss(xml: string): string {
  const nameMatch = xml.match(/<name>(.*?)<\/name>/);
  return nameMatch?.[1] ?? "Unknown Channel";
}

async function analyzeWithVision(
  thumbnailUrls: string[]
): Promise<{
  layout: string;
  colorPalette: string[];
  textStyle: string;
  photoTreatment: string;
  brandElements: string;
  overallVibe: string;
}> {
  if (!GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY not configured");

  const model = process.env.THUMBNAIL_ANALYSIS_MODEL || "gemini-3.1-flash";

  // Use Google Generative AI REST API directly for vision with image URLs
  const imageParts = thumbnailUrls.map((url) => ({
    type: "image_url" as const,
    image_url: { url },
  }));

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GOOGLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You are a YouTube thumbnail design analyst. Study these ${thumbnailUrls.length} thumbnails from the same podcast channel and identify the CONSISTENT visual patterns.

Analyze:
1. **Layout**: Where are people positioned? Where is text? What's the background treatment?
2. **Color Palette**: What 4-6 hex colors appear consistently? Include background, text, and accent colors.
3. **Text Style**: How is text formatted? (font weight, case, outline/shadow, size relative to image)
4. **Photo Treatment**: How are people shown? (cutout vs in-context, expression style, lighting)
5. **Brand Elements**: Any consistent logos, banners, borders, shapes, or branding?
6. **Overall Vibe**: One sentence describing the thumbnail aesthetic

Be very specific — these patterns will be used to generate NEW thumbnails matching this exact style.`,
              },
              ...imageParts,
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_analysis",
              description: "Submit the channel thumbnail style analysis",
              parameters: {
                type: "object",
                properties: {
                  layout: {
                    type: "string",
                    description: "Detailed layout description",
                  },
                  colorPalette: {
                    type: "array",
                    items: { type: "string" },
                    description: "4-6 hex color codes",
                  },
                  textStyle: {
                    type: "string",
                    description: "Text formatting description",
                  },
                  photoTreatment: {
                    type: "string",
                    description: "How people/photos are treated",
                  },
                  brandElements: {
                    type: "string",
                    description: "Consistent branding elements",
                  },
                  overallVibe: {
                    type: "string",
                    description: "One-sentence aesthetic summary",
                  },
                },
                required: [
                  "layout",
                  "colorPalette",
                  "textStyle",
                  "photoTreatment",
                  "brandElements",
                  "overallVibe",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: "submit_analysis" },
        },
      }),
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    console.error("[Analyze] AI error:", resp.status, text);
    throw new Error(`AI analysis error ${resp.status}`);
  }

  const json = await resp.json();
  const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    try {
      return JSON.parse(toolCall.function.arguments);
    } catch {
      console.error("[Analyze] Failed to parse tool call arguments:", toolCall.function.arguments);
      throw new Error("AI returned malformed analysis data");
    }
  }
  throw new Error("No structured output from vision analysis");
}

// ── Route Handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    let channelUrl: string;
    try {
      const body = await req.json();
      channelUrl = body.channelUrl;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }
    if (!channelUrl) {
      return NextResponse.json(
        { error: "channelUrl is required" },
        { status: 400 }
      );
    }

    // 1. Resolve channel ID
    const channelId = await resolveChannelId(channelUrl);
    console.log("[Analyze] Channel ID:", channelId);

    // 2. Fetch recent video IDs from RSS
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const rssResp = await fetch(rssUrl);
    if (!rssResp.ok) {
      throw new Error(`Failed to fetch channel RSS feed (HTTP ${rssResp.status})`);
    }
    const rssXml = await rssResp.text();

    const allVideoIds: string[] = [];
    const idRegex = /<yt:videoId>([\w-]+)<\/yt:videoId>/g;
    let match;
    while ((match = idRegex.exec(rssXml)) !== null) {
      allVideoIds.push(match[1]);
    }

    const channelName = getChannelNameFromRss(rssXml);

    if (allVideoIds.length === 0) {
      throw new Error("No videos found on this channel");
    }

    // 3. Filter out Shorts
    const videoIds: string[] = [];
    const oembedChecks = allVideoIds.slice(0, 15).map(async (id) => {
      try {
        const shortsCheck = await fetch(
          `https://www.youtube.com/shorts/${id}`,
          { method: "HEAD", redirect: "manual" }
        );
        if (shortsCheck.status === 200) return null; // It's a Short
        return id;
      } catch (err) {
        console.warn(`[Analyze] Shorts check failed for ${id}:`, err);
        return id; // On error, include it
      }
    });

    const results = await Promise.all(oembedChecks);
    for (const id of results) {
      if (id && videoIds.length < 10) videoIds.push(id);
    }

    if (videoIds.length === 0) {
      throw new Error(
        "No long-form videos found on this channel (only Shorts detected)"
      );
    }

    // 4. Build thumbnail URLs
    const thumbnailUrls = (
      await Promise.all(
        videoIds.map(async (id) => {
          const maxres = `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
          try {
            const head = await fetch(maxres, { method: "HEAD" });
            if (head.ok) return maxres;
          } catch { /* fall through */ }
          return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
        })
      )
    ).filter(Boolean);

    console.log(
      `[Analyze] Found ${thumbnailUrls.length} thumbnails for "${channelName}"`
    );

    // 5. Analyze with AI vision
    const channelStyle = await analyzeWithVision(thumbnailUrls);

    return NextResponse.json({ channelStyle, thumbnailUrls, channelName });
  } catch (error) {
    console.error("[Analyze] Error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
