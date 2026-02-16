import { z } from "zod";

export const descriptionAnalysisOutputSchema = z.object({
  openingStyle: z.string(),
  subscribeBlock: z.string(),
  socialLinksFormat: z.string(),
  ctaBlock: z.string(),
  hashtagPattern: z.string(),
  newsletterPlug: z.string(),
  avgWordCount: z.number(),
  structuralSkeleton: z.array(z.string()),
  consistentPhrases: z.array(z.string()),
  chapterFormat: z.object({
    usesEmDash: z.boolean(),
    avgLength: z.number(),
    style: z.string(),
    separator: z.string(),
    exampleChapters: z.array(z.string()),
  }),
  rawExamples: z.array(z.string()),
});

export type DescriptionAnalysisOutput = z.infer<typeof descriptionAnalysisOutputSchema>;
