import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
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

export const researchModel = openaiProvider(process.env.RESEARCH_MODEL || "gpt-5.2");
export const generationModel = openaiProvider(process.env.GENERATION_MODEL || "gpt-5.2");
export const minimaxGenerationModel = minimaxProvider(process.env.MINIMAX_GENERATION_MODEL || "minimax-m2.5");
export const kimiModel = nvidiaProvider
  ? nvidiaProvider(process.env.KIMI_MODEL || "kimi-k2.5")
  : null;

export const pairwiseJudgeModel = googleProvider
  ? googleProvider(process.env.PAIRWISE_JUDGE_MODEL || "gemini-3.0-flash")
  : null;
// Minimax is well-calibrated for scoring — its interpretation of the rubric produces accurate scores
export const scoringModel = minimaxProvider(
  process.env.MINIMAX_SCORING_MODEL || process.env.SCORING_MODEL || "minimax-m2.5"
);
