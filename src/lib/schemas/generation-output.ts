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
  scrollStopReason: z.string(),
  emotionalTrigger: z.string(),
  platformNotes: z.string(),
});

export const rejectedTitleSchema = z.object({
  title: z.string(),
  rejectionReason: z.string(),
});

export const chapterTitleSchema = z.object({
  timestamp: z.string(),
  title: z.string(),
});

export const tierClassificationSchema = z.object({
  tier: z.number().int().min(1).max(3),
  appliedCorrectly: z.boolean(),
  verification: z.string(),
});

export const descriptionScoreSchema = z.object({
  hookQuality: z.number().min(0).max(25),
  structuralMatch: z.number().min(0).max(25),
  seoIntegration: z.number().min(0).max(25),
  humanVoice: z.number().min(0).max(25),
  total: z.number().min(0).max(100),
});

export const chapterScoreSchema = z.object({
  specificityAvg: z.number().min(0).max(25),
  activeVoice: z.number().min(0).max(25),
  noBannedPatterns: z.number().min(0).max(25),
  miniHookQuality: z.number().min(0).max(25),
  total: z.number().min(0).max(100),
});

export const generationOutputSchema = z.object({
  youtubeTitles: z.array(titleOptionSchema).length(2),
  spotifyTitles: z.array(titleOptionSchema).length(2),
  rejectedTitles: z.array(rejectedTitleSchema).min(1),
  youtubeDescription: z.string().optional(),
  spotifyDescription: z.string().optional(),
  chapters: z.array(chapterTitleSchema).optional(),
  tierClassification: tierClassificationSchema.optional(),
  descriptionScore: descriptionScoreSchema.optional(),
  chapterScore: chapterScoreSchema.optional(),
});

export type GenerationOutputSchema = z.infer<typeof generationOutputSchema>;
