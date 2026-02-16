import { z } from "zod";
import {
  chapterTitleSchema,
  descriptionScoreSchema,
  chapterScoreSchema,
} from "./generation-output";

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
