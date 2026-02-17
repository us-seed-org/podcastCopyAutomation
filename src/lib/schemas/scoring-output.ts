import { z } from "zod";
import { scoreBreakdownSchema, thumbnailTextScoreSchema, tierClassificationSchema } from "./generation-output";

const scoredBaseTitleSchema = z.object({
  title: z.string().min(1),
  score: scoreBreakdownSchema,
  scrollStopReason: z.string().min(1),
  emotionalTrigger: z.string().min(1),
  platformNotes: z.string().min(1),
});

export const scoredYouTubeTitleSchema = scoredBaseTitleSchema.extend({
  thumbnailText: z.string().min(1),
  thumbnailTextScore: thumbnailTextScoreSchema,
});

export const scoredSpotifyTitleSchema = scoredBaseTitleSchema;

export const scoringOutputSchema = z.object({
  youtubeTitles: z.array(scoredYouTubeTitleSchema),
  spotifyTitles: z.array(scoredSpotifyTitleSchema),
  tierClassification: tierClassificationSchema,
});

export type ScoringOutput = z.infer<typeof scoringOutputSchema>;
