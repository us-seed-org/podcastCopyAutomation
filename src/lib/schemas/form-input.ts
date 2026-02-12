import { z } from "zod";

export const formInputSchema = z.object({
  transcript: z.string().min(100, "Transcript must be at least 100 characters"),
  transcriptTimestamps: z.boolean(),
  guestName: z.string().min(1, "Guest name is required"),
  podcastName: z.string().min(1, "Podcast name is required"),
  episodeDescription: z.string().min(10, "Please provide at least a brief description"),
  coHosts: z.string().optional(),
  youtubeChannelUrl: z.string().optional(),
  targetAudience: z.string().optional(),
});

export type FormInputSchema = z.infer<typeof formInputSchema>;
