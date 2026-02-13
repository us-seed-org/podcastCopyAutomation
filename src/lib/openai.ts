import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const RESEARCH_MODEL = process.env.RESEARCH_MODEL || "gpt-5.2";
export const GENERATION_MODEL = process.env.GENERATION_MODEL || "gpt-5.2";
