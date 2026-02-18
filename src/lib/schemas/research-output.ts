    import { z } from "zod";

export const topicSegmentSchema = z.object({
  timestamp: z.string(),
  topic: z.string(),
  summary: z.string(),
});

export const hotTakeSchema = z.object({
  quote: z.string().describe("Near-verbatim quote from transcript"),
  topic: z.string().describe("What this hot take is about"),
  whyClickable: z.string().describe("Why someone would stop scrolling and click"),
  type: z.enum([
    "contrarian",
    "shocking_stat",
    "bold_prediction",
    "debunking",
    "provocative_opinion",
  ]),
});

export const guestTierSchema = z.object({
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  reasoning: z.string(),
  youtubeRecommendation: z.string(),
});

export const researchOutputSchema = z.object({
  guest: z.object({
    name: z.string(),
    bio: z.string(),
    credentials: z.array(z.string()),
    socialPresence: z.string(),
    controversies: z.string(),
    authorityLabel: z.string(),
    guestTier: guestTierSchema,
  }),
  brand: z.object({
    podcastName: z.string(),
    titleFormat: z.string(),
    voiceDescription: z.string(),
    audienceProfile: z.string(),
  }),
  transcript: z.object({
    hotTakes: z.array(hotTakeSchema).min(1).max(5).describe("Up to 5 most clickable hot takes from the transcript"),
    topClaims: z.array(z.string()),
    specificNumbers: z.array(z.string()),
    emotionalMoments: z.array(z.string()),
    clickableMoment: z.string(),
    topicSegments: z.array(topicSegmentSchema),
    trendingKeywords: z.array(z.string()),
  }),
  trendingTopics: z.array(z.string()),
  searchQueriesUsed: z.array(z.string()),
});

export type ResearchOutputSchema = z.infer<typeof researchOutputSchema>;
