export interface ChannelConfig {
  id: string;
  name: string;
  system_prompt: string;
  voice_guidelines: { tone?: string; style?: string; personality?: string };
  banned_phrases: string[];
  preferred_archetypes: string[];
  created_at: string;
  updated_at: string;
}
