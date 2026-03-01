import { z } from "zod";

const chapterTitleSchema = z.object({
  timestamp: z.string(),
  title: z.string(),
});

const descriptionScoreSchema = z.object({
  hookQuality: z.number().min(0).max(25),
  structuralMatch: z.number().min(0).max(25),
  seoIntegration: z.number().min(0).max(25),
  humanVoice: z.number().min(0).max(25),
  total: z.number().min(0).max(100),
});

const chapterScoreSchema = z.object({
  specificityAvg: z.number().min(0).max(25),
  activeVoice: z.number().min(0).max(25),
  patternCompliance: z.number().min(0).max(25),
  miniHookQuality: z.number().min(0).max(25),
  total: z.number().min(0).max(100),
});

export const descriptionChapterOutputSchema = z.object({
  youtubeDescription: z.string(),
  spotifyDescription: z.string(),
  chapters: z.array(chapterTitleSchema).min(3),
  descriptionSEOKeywords: z.array(z.string()).min(1),
  reasoningNotes: z.string(),
  descriptionScore: descriptionScoreSchema,
  chapterScore: chapterScoreSchema,
});

export type DescriptionChapterOutput = z.infer<typeof descriptionChapterOutputSchema>;
