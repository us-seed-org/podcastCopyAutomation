import { z } from "zod";
import { scoreBreakdownSchema, thumbnailTextScoreSchema, rejectedTitleSchema, titleArchetypeSchema, thumbnailArchetypeSchema } from "./generation-output";

const generatedBaseTitleSchema = z.object({
  title: z.string(),
  score: scoreBreakdownSchema,
  scrollStopReason: z.string(),
  emotionalTrigger: z.string(),
  platformNotes: z.string(),
  archetype: titleArchetypeSchema.optional(),
});

export const generatedYouTubeTitleSchema = generatedBaseTitleSchema.extend({
  thumbnailText: z.string(),
  thumbnailTextScore: thumbnailTextScoreSchema,
  thumbnailArchetype: thumbnailArchetypeSchema.optional(),
});

export const generatedSpotifyTitleSchema = generatedBaseTitleSchema;

export const titleGenerationOutputSchema = z.object({
  youtubeTitles: z.array(generatedYouTubeTitleSchema).min(1),
  spotifyTitles: z.array(generatedSpotifyTitleSchema).min(1),
  rejectedTitles: z.array(rejectedTitleSchema).min(3),
});

export type TitleGenerationOutput = z.infer<typeof titleGenerationOutputSchema>;
