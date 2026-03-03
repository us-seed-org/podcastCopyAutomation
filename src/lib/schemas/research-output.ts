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
  heatScore: z.number().min(1).max(5).describe("How likely to start an argument at a dinner party (1-5)"),
  viewerStakes: z.string().describe("One sentence explaining why this personally affects the VIEWER"),
  sharpenedVersion: z.string().describe("The same claim escalated to heat level 4+"),
});

export const guestTierSchema = z.object({
  tier: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
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
    hotTakeTemperature: z.enum(["hot", "warm", "cold"]).describe("hot = 2+ takes scored 4+, warm = 1 take scored 4+, cold = no takes scored 4+"),
    conceptualReframe: z.string().nullable().describe("2-5 word bumper sticker distilling the episode's core thesis, or null"),
    topClaims: z.array(z.string()),
    specificNumbers: z.array(z.string()),
    emotionalMoments: z.array(z.string()),
    clickableMoment: z.string(),
    competitiveLandscape: z.string().optional().describe("What similar episodes from other podcasts are doing"),
    topicSegments: z.array(topicSegmentSchema),
    trendingKeywords: z.array(z.string()),
  }),
  trendingTopics: z.array(z.string()),
  searchQueriesUsed: z.array(z.string()),
});

export type ResearchOutputSchema = z.infer<typeof researchOutputSchema>;
