import { z } from "zod";

export const scoreBreakdownSchema = z.object({
  curiosityGap: z.number().min(0).max(20),
  authoritySignal: z.number().min(0).max(15),
  emotionalTrigger: z.number().min(0).max(15),
  trendingKeyword: z.number().min(0).max(10),
  specificity: z.number().min(0).max(10),
  characterCount: z.number().min(0).max(10),
  wordBalance: z.number().min(0).max(10),
  frontLoadHook: z.number().min(0).max(5),
  thumbnailComplement: z.number().min(0).max(5),
  total: z.number().min(0).max(100),
});

export const titleOptionSchema = z.object({
  title: z.string(),
  score: scoreBreakdownSchema,
  archetype: z.string(),
  emotionalTrigger: z.string(),
  platformNotes: z.string(),
});

export const chapterTitleSchema = z.object({
  timestamp: z.string(),
  title: z.string(),
});

export const generationOutputSchema = z.object({
  youtubeTitles: z.array(titleOptionSchema).length(2),
  spotifyTitles: z.array(titleOptionSchema).length(2),
  youtubeDescription: z.string(),
  spotifyDescription: z.string(),
  chapters: z.array(chapterTitleSchema),
});

export type GenerationOutputSchema = z.infer<typeof generationOutputSchema>;
