import { z } from "zod";

export const pairwiseOutputSchema = z.object({
  winner: z.enum(["A", "B"]),
  reasoning: z.string().min(1),
});

export type PairwiseOutput = z.infer<typeof pairwiseOutputSchema>;
