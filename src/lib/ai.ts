import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    "Missing OPENAI_API_KEY environment variable: required by createOpenAI to initialize openaiProvider"
  );
}

export const openaiProvider = createOpenAI({
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

const nvidiaProvider = process.env.NVIDIA_API_KEY
  ? createOpenAICompatible({
    name: "nvidia",
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKey: process.env.NVIDIA_API_KEY,
  })
  : null;

const googleProvider = process.env.GOOGLE_API_KEY
  ? createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY })
  : null;

export const researchModel = openaiProvider(process.env.RESEARCH_MODEL || "gemini-3.0-flash");
export const generationModel = openaiProvider(process.env.GENERATION_MODEL || "gemini-3.0-flash");
export const minimaxGenerationModel = minimaxProvider(process.env.MINIMAX_GENERATION_MODEL || "minimax-m2.5");
export const kimiModel = nvidiaProvider
  ? nvidiaProvider(process.env.KIMI_MODEL || "kimi-k2.5")
  : null;

// Primary generation: Gemini 3.1 Pro Preview. null if GOOGLE_API_KEY is not set;
// generate/route.ts falls back to Gemini 3.0 Flash (generationModel) at point of use.
export const geminiGenerationModel = googleProvider
  ? googleProvider(process.env.GEMINI_GENERATION_MODEL || "gemini-3.1-pro-preview")
  : null;

// Pairwise judge: Gemini 3.1 Pro Preview for stronger creative discrimination
export const pairwiseJudgeModel = googleProvider
  ? googleProvider(process.env.PAIRWISE_JUDGE_MODEL || "gemini-3.1-pro-preview")
  : null;

// Scorer: Gemini 3.0 Flash (cross-family from Gemini generators; stronger at rubric-following)
export const scoringModel = openaiProvider(process.env.SCORING_MODEL || "gemini-3.0-flash");
