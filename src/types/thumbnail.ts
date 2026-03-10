export interface ChannelStyle {
  layout: string;
  colorPalette: string[];
  textStyle: string;
  photoTreatment: string;
  brandElements: string;
  overallVibe: string;
}

export interface ThumbnailResult {
  imageUrl: string; // base64 data URL
  description: string;
}

export type ThumbnailStage = "idle" | "analyzing" | "analyzed" | "generating" | "complete" | "error";

export interface ThumbnailState {
  stage: ThumbnailStage;
  channelStyle: ChannelStyle | null;
  existingThumbnails: string[];
  channelName: string;
  generatedThumbnails: ThumbnailResult[];
  error: string | null;
}

export interface GuestInput {
  name: string;
  headshotBase64?: string;
}

export interface ProcessedGuest {
  name: string;
  cleanedHeadshot?: string;
}
