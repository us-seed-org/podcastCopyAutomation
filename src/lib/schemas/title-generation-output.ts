import { z } from "zod";
import { scoreBreakdownSchema, rejectedTitleSchema } from "./generation-output";

export const generatedTitleSchema = z.object({
  title: z.string(),
  score: scoreBreakdownSchema,
  scrollStopReason: z.string(),
  emotionalTrigger: z.string(),
  platformNotes: z.string(),
});

export const titleGenerationOutputSchema = z.object({
  youtubeTitles: z.array(generatedTitleSchema).length(2),
  spotifyTitles: z.array(generatedTitleSchema).length(2),
  rejectedTitles: z.array(rejectedTitleSchema).min(1),
});

export type TitleGenerationOutput = z.infer<typeof titleGenerationOutputSchema>;
