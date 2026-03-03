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
  platformFit: z.number().min(0).max(5),
  total: z.number().min(0).max(100),
});

export const thumbnailTextScoreSchema = z.object({
  curiosityGap: z.number().min(0).max(25),
  emotionalPunch: z.number().min(0).max(25),
  titleComplement: z.number().min(0).max(25),
  brevityAndClarity: z.number().min(0).max(25),
  total: z.number().min(0).max(100),
});

export const titleArchetypeSchema = z.enum([
  "authority_shocking",
  "mechanism_outcome",
  "curiosity_gap",
  "negative_contrarian",
]);

export const thumbnailArchetypeSchema = z.enum([
  "gut_punch",
  "label",
  "alarm",
  "confrontation",
]);

export const titleOptionSchema = z.object({
  title: z.string(),
  score: scoreBreakdownSchema,
  scrollStopReason: z.string(),
  emotionalTrigger: z.string(),
  platformNotes: z.string(),
  thumbnailText: z.string().optional(),
  thumbnailTextScore: thumbnailTextScoreSchema.optional(),
  archetype: titleArchetypeSchema.optional(),
  thumbnailArchetype: thumbnailArchetypeSchema.optional(),
}).refine(
  (data) => (data.thumbnailText == null) === (data.thumbnailTextScore == null),
  { message: "thumbnailText and thumbnailTextScore must both be present or both be absent" },
);

export const rejectedTitleSchema = z.object({
  title: z.string(),
  rejectionReason: z.string(),
});

export const tierClassificationSchema = z.object({
  tier: z.number().int().min(0).max(3),
  appliedCorrectly: z.boolean(),
  verification: z.string(),
});

export const generationOutputSchema = z.object({
  youtubeTitles: z.array(titleOptionSchema).min(4).max(4),
  spotifyTitles: z.array(titleOptionSchema).length(2),
  rejectedTitles: z.array(rejectedTitleSchema).min(1),
  tierClassification: tierClassificationSchema.optional(),
});

export type GenerationOutputSchema = z.infer<typeof generationOutputSchema>;
