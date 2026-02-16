import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    "Missing OPENAI_API_KEY environment variable: required by createOpenAI to initialize openaiProvider"
  );
}

const openaiProvider = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

if (!process.env.MINIMAX_API_KEY) {
  throw new Error(
    "Missing MINIMAX_API_KEY environment variable: required by createOpenAICompatible to initialize minimaxProvider"
  );
}

const minimaxProvider = createOpenAICompatible({
  name: "minimax",
  baseURL: "https://api.minimax.io/v1",
  apiKey: process.env.MINIMAX_API_KEY,
});

export const researchModel = openaiProvider(process.env.RESEARCH_MODEL || "gpt-5.2");
export const generationModel = openaiProvider(process.env.GENERATION_MODEL || "gpt-5.2");
export const scoringModel = minimaxProvider(process.env.SCORING_MODEL || "minimax-m2.5");
