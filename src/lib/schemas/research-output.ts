import { z } from "zod";

export const topicSegmentSchema = z.object({
  timestamp: z.string(),
  topic: z.string(),
  summary: z.string(),
});

export const researchOutputSchema = z.object({
  guest: z.object({
    name: z.string(),
    bio: z.string(),
    credentials: z.array(z.string()),
    socialPresence: z.string(),
    controversies: z.string(),
    authorityLabel: z.string(),
  }),
  brand: z.object({
    podcastName: z.string(),
    titleFormat: z.string(),
    voiceDescription: z.string(),
    audienceProfile: z.string(),
  }),
  transcript: z.object({
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
