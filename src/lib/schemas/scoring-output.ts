import { z } from "zod";
import { scoreBreakdownSchema, tierClassificationSchema } from "./generation-output";

export const scoredTitleSchema = z.object({
  title: z.string().min(1),
  score: scoreBreakdownSchema,
  scrollStopReason: z.string().min(1),
  emotionalTrigger: z.string().min(1),
  platformNotes: z.string().min(1),
});

export const scoringOutputSchema = z.object({
  youtubeTitles: z.array(scoredTitleSchema),
  spotifyTitles: z.array(scoredTitleSchema),
  tierClassification: tierClassificationSchema,
});

export type ScoringOutput = z.infer<typeof scoringOutputSchema>;
