import type { ChannelConfig } from "@/types/channel-config";

export interface ChatContext {
  episodeTitle?: string;
  guestName?: string;
  podcastName?: string;
  guestTier?: number;
  hotTakes?: string[];
  youtubeTitles?: Array<{ title: string; score?: { total?: number }; archetype?: string }>;
  spotifyTitles?: Array<{ title: string; score?: { total?: number } }>;
  scoresJson?: unknown;
  channelConfig?: ChannelConfig | null;
}

function sanitize(text: string, maxLen: number): string {
  return String(text ?? "").replace(/`/g, "'").slice(0, maxLen);
}

function safeMap<T>(arr: T[] | undefined, limit: number, fn: (item: T, i: number) => string): string {
  if (!arr?.length) return "(none)";
  return arr.slice(0, limit).map(fn).join("\n");
}

function truncateJson(obj: unknown, maxLen: number): string {
  try {
    const str = JSON.stringify(obj, null, 2);
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen) + "\n... (truncated)";
  } catch {
    return "(unparseable)";
  }
}

export function chatSystemPrompt(context: ChatContext): string {
  const {
    episodeTitle,
    guestName,
    podcastName,
    guestTier,
    hotTakes,
    youtubeTitles,
    spotifyTitles,
    scoresJson,
    channelConfig,
  } = context;

  const sections: string[] = [];

  sections.push(`You are a podcast copy strategist helping refine titles, descriptions, and chapters for an episode.
You have full context about the generated titles and their scores. Be direct, opinionated, and concise.
When the user asks for changes, suggest specific edits. When a pipeline action (regenerate, rescore, rerank, recontent) would help, suggest it with a structured action block.`);

  // Episode context
  sections.push(`## Episode Context
- Podcast: ${sanitize(podcastName || "Unknown", 100)}
- Guest: ${sanitize(guestName || "No guest", 100)}
- Episode title hint: ${sanitize(episodeTitle || "(none)", 200)}
- Guest tier: ${sanitize(String(guestTier ?? 3), 50)}`);

  // Hot takes
  if (hotTakes?.length) {
    sections.push(`## Key Hot Takes
${safeMap(hotTakes, 5, (h, i) => `${i + 1}. ${sanitize(h, 150)}`)}`);
  }

  // Generated YouTube titles
  sections.push(`## Generated YouTube Titles
${safeMap(youtubeTitles, 8, (t, i) =>
  `${i + 1}. [${t.archetype ?? "unknown"}] "${sanitize(t.title, 100)}" (score: ${t.score?.total ?? "n/a"})`
)}`);

  // Generated Spotify titles
  sections.push(`## Generated Spotify Titles
${safeMap(spotifyTitles, 5, (t, i) =>
  `${i + 1}. "${sanitize(t.title, 100)}" (score: ${t.score?.total ?? "n/a"})`
)}`);

  // Scores
  if (scoresJson) {
    sections.push(`## Score Details
\`\`\`json
${truncateJson(scoresJson, 800)}
\`\`\``);
  }

  // Channel config
  if (channelConfig) {
    sections.push(`## Channel Configuration
Name: ${sanitize(channelConfig.name, 100)}
${channelConfig.voice_guidelines?.tone ? `Tone: ${sanitize(channelConfig.voice_guidelines.tone, 150)}` : ""}
${channelConfig.voice_guidelines?.style ? `Style: ${sanitize(channelConfig.voice_guidelines.style, 150)}` : ""}`.trim());
  }

  // Available actions
  sections.push(`## Available Pipeline Actions
When you recommend a pipeline action, include a JSON block like:
\`\`\`action
{"type": "regenerate", "description": "Regenerate curiosity_gap titles", "parameters": {"archetype": "curiosity_gap"}}
\`\`\`
Action types:
- regenerate: Re-generate titles for a specific archetype. Parameters: {archetype: string}
- rescore: Re-score all existing titles with the scoring panel. Parameters: {}
- rerank: Re-run pairwise ranking tournament. Parameters: {}
- recontent: Regenerate descriptions and chapters. Parameters: {}`);

  return sections.join("\n\n");
}
