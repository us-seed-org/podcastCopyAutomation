import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

let _openaiProvider: ReturnType<typeof createOpenAI> | null = null;
let _minimaxProvider: ReturnType<typeof createOpenAICompatible> | null = null;
let _nvidiaProvider: ReturnType<typeof createOpenAICompatible> | null = null;
let _googleProvider: ReturnType<typeof createGoogleGenerativeAI> | null = null;

export function getOpenAIProvider() {
  if (!_openaiProvider) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Missing OPENAI_API_KEY environment variable: required by createOpenAI"
      );
    }
    _openaiProvider = createOpenAI({ apiKey });
  }
  return _openaiProvider;
}

function getMinimaxProvider() {
  if (!_minimaxProvider) {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Missing MINIMAX_API_KEY environment variable: required by createOpenAICompatible"
      );
    }
    _minimaxProvider = createOpenAICompatible({
      name: "minimax",
      baseURL: "https://api.minimax.io/v1",
      apiKey,
    });
  }
  return _minimaxProvider;
}

function getNvidiaProvider() {
  if (!_nvidiaProvider) {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (apiKey) {
      _nvidiaProvider = createOpenAICompatible({
        name: "nvidia",
        baseURL: "https://integrate.api.nvidia.com/v1",
        apiKey,
      });
    }
  }
  return _nvidiaProvider;
}

function getGoogleProvider() {
  if (!_googleProvider) {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (apiKey) {
      _googleProvider = createGoogleGenerativeAI({ apiKey });
    }
  }
  return _googleProvider;
}

function selectModel(model: string) {
  if (model.startsWith("gemini")) {
    const provider = getGoogleProvider();
    if (!provider) {
      throw new Error(
        `Model "${model}" requires GOOGLE_API_KEY environment variable`
      );
    }
    return provider(model);
  }
  return getOpenAIProvider()(model);
}

export const researchModel = (model?: string) =>
  selectModel(model || process.env.RESEARCH_MODEL || "gemini-3.0-flash");
export const generationModel = (model?: string) =>
  selectModel(model || process.env.GENERATION_MODEL || "gemini-3.0-flash");
export const minimaxGenerationModel = (model?: string) =>
  getMinimaxProvider()(model || process.env.MINIMAX_GENERATION_MODEL || "minimax-m2.5");
export const kimiModel = (model?: string) => {
  const provider = getNvidiaProvider();
  return provider ? provider(model || process.env.KIMI_MODEL || "kimi-k2.5") : null;
};

export const geminiGenerationModel = (model?: string) => {
  const provider = getGoogleProvider();
  return provider
    ? provider(model || process.env.GEMINI_GENERATION_MODEL || "gemini-3.1-pro-preview")
    : null;
};

export const pairwiseJudgeModel = (model?: string) => {
  const provider = getGoogleProvider();
  return provider
    ? provider(model || process.env.PAIRWISE_JUDGE_MODEL || "gemini-3.1-pro-preview")
    : null;
};

export const scoringModel = (model?: string) =>
  selectModel(model || process.env.SCORING_MODEL || "gpt-5.2");

export const geminiScoringModel = (model?: string) => {
  const provider = getGoogleProvider();
  return provider
    ? provider(model || process.env.GEMINI_SCORING_MODEL || "gemini-3.1-pro-preview")
    : null;
};

export const descriptionModel = (model?: string) => {
  const provider = getGoogleProvider();
  if (provider) {
    return provider(model || process.env.DESCRIPTION_MODEL_GOOGLE || "gemini-3.1-pro-preview");
  }
  return getOpenAIProvider()(model || process.env.DESCRIPTION_MODEL_OPENAI || "gpt-5.2");
};
