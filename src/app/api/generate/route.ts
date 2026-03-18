/* eslint-disable @typescript-eslint/no-explicit-any */
import { generateObject, generateText } from "ai";
import { generationModel, minimaxGenerationModel, kimiModel, scoringModel, geminiScoringModel, pairwiseJudgeModel, geminiGenerationModel, descriptionModel } from "@/lib/ai";
import {
  buildGenerationSystemPrompt,
  buildGenerationUserPrompt,
} from "@/lib/prompts/generation-system";
import {
  buildScoringSystemPrompt,
  buildScoringUserPrompt,
} from "@/lib/prompts/scoring-system";
import {
  buildDescriptionChapterSystemPrompt,
  buildDescriptionChapterUserPrompt,
} from "@/lib/prompts/description-chapter-system";
import {
  buildThumbnailRefinementSystemPrompt,
  buildThumbnailRefinementUserPrompt,
} from "@/lib/prompts/thumbnail-refinement-system";
import { generatedYouTubeTitleSchema, titleGenerationOutputSchema } from "@/lib/schemas/title-generation-output";
import { scoringOutputSchema } from "@/lib/schemas/scoring-output";
import { descriptionChapterOutputSchema } from "@/lib/schemas/description-chapter-output";
import { checkAiSlop, checkThumbnailText, checkChapterTitles } from "@/lib/guardrails/ai-slop";
import { checkTierCompliance } from "@/lib/guardrails/tier-compliance";
import { runPairwiseTournament } from "@/lib/pairwise-tournament";
import { supabase } from "@/lib/supabase";
import { PipelineLogger } from "@/lib/pipeline-logger";
import type { GenerationMode, GenerationOutput, GenerationRequestPayload } from "@/types/generation";
import type { PipelineTraceEntry } from "@/types/pipeline-trace";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function extractKeyNouns(title: string): string[] {
  const stopwords = new Set(["the", "a", "an", "is", "are", "was", "and", "or", "of", "in", "to", "for", "on", "with", "by", "from", "at"]);
  return title.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/)
    .filter(w => w.length >= 3 && !stopwords.has(w));
}

function areSameAngle(a: string, b: string): boolean {
  const kA = new Set(extractKeyNouns(a));
  const kB = extractKeyNouns(b);
  const overlap = kB.filter(k => kA.has(k)).length;
  return overlap >= 3;
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().trim();
}

const ALL_TITLE_ARCHETYPES: TitleArchetype[] = ["authority_shocking", "mechanism_outcome", "curiosity_gap", "negative_contrarian"];

/**
 * Select 4 YouTube titles ensuring archetype diversity.
 * Pick the best title from EACH archetype, then fill gaps from remaining pool.
 */
function selectWithArchetypeDiversity(titles: YouTubeTitleItem[]): YouTubeTitleItem[] {
  const selected: YouTubeTitleItem[] = [];
  const usedArchetypes = new Set<string>();
  const usedThumbArchetypes = new Set<string>();
  const usedTitles = new Set<string>();

  // Pass 1: Pick best title from each title archetype
  for (const arch of ALL_TITLE_ARCHETYPES) {
    const candidates = titles.filter(
      t => t.archetype === arch && !usedTitles.has(normalizeTitle(t.title))
    );
    if (candidates.length > 0) {
      candidates.sort((a, b) => (b.score?.total || 0) - (a.score?.total || 0));
      const best = candidates[0];
      selected.push(best);
      usedTitles.add(normalizeTitle(best.title));
      usedArchetypes.add(arch);
      if (best.thumbnailArchetype) usedThumbArchetypes.add(best.thumbnailArchetype);
    }
  }

  // Pass 2: Fill remaining slots from highest-scoring unused titles
  if (selected.length < TARGET_YOUTUBE_COUNT) {
    const remaining = titles
      .filter(t => !usedTitles.has(normalizeTitle(t.title)))
      .sort((a, b) => (b.score?.total || 0) - (a.score?.total || 0));

    for (const t of remaining) {
      if (selected.length >= TARGET_YOUTUBE_COUNT) break;
      // Prefer titles that add a missing archetype
      selected.push(t);
      usedTitles.add(normalizeTitle(t.title));
    }
  }

  return selected.slice(0, TARGET_YOUTUBE_COUNT);
}

interface ScoreBreakdown {
  curiosityGap: number;
  authoritySignal: number;
  emotionalTrigger: number;
  trendingKeyword: number;
  specificity: number;
  characterCount: number;
  wordBalance: number;
  frontLoadHook: number;
  platformFit: number;
  total: number;
}

interface ThumbnailTextScore {
  curiosityGap: number;
  emotionalPunch: number;
  titleComplement: number;
  brevityAndClarity: number;
  total: number;
}

type TitleArchetype = "authority_shocking" | "mechanism_outcome" | "curiosity_gap" | "negative_contrarian";
type ThumbnailArchetype = "gut_punch" | "label" | "alarm" | "confrontation";

interface BaseTitleItem {
  title: string;
  score?: ScoreBreakdown;
  scrollStopReason?: string;
  emotionalTrigger?: string;
  platformNotes?: string;
  archetype?: TitleArchetype;
  sourceModel?: string;
  titleResultId?: string;
  rewritten?: boolean;
}

interface YouTubeTitleItem extends BaseTitleItem {
  thumbnailText?: string;
  thumbnailTextScore?: ThumbnailTextScore;
  thumbnailArchetype?: ThumbnailArchetype;
  pairwiseWins?: number;
  pairwiseRank?: number;
}

interface ScoredTitle {
  title: string;
  rejectionReason: string;
}

interface GenerationResult {
  youtubeTitles: YouTubeTitleItem[];
  spotifyTitles: BaseTitleItem[];
  rejectedTitles: ScoredTitle[];
}

const REWRITE_THRESHOLD = 60;
const MAX_REWRITE_ATTEMPTS = 1;
const TARGET_YOUTUBE_COUNT = 4;
const TARGET_SPOTIFY_COUNT = 2;
const PAIRWISE_TOP_N = 5;

function sendSSE(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  data: unknown
) {
  controller.enqueue(encoder.encode("data: " + JSON.stringify(data) + "\n\n"));
}

function sendTrace(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  entry: PipelineTraceEntry
) {
  sendSSE(controller, encoder, { type: "pipeline_trace", entry });
}

function getAllTitleTexts(titles: { title: string }[]): string[] {
  return titles.map((t) => t.title);
}

/**
 * Strip <think>...</think> blocks that some models (e.g. Minimax) prepend.
 */
function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function extractFirstJson(text: string): string | null {
  // Strip thinking tags and markdown code fences before extraction
  const cleaned = stripThinkTags(text);
  const start = cleaned.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (ch === "\\") {
        i++;
      } else if (ch === '"') {
        inString = false;
      }
    } else {
      if (ch === '"') {
        inString = true;
      } else if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) return cleaned.slice(start, i + 1);
      }
    }
  }
  return null;
}

interface GenerationModelConfig {
  model: Parameters<typeof generateObject>[0]["model"];
  name: string;
}

const GENERATION_CALL_TIMEOUT_MS = 180_000;

/**
 * Check if an error is transient (rate limit, temporary outage) and worth retrying.
 */
function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("429") || msg.includes("rate limit") ||
    msg.includes("503") || msg.includes("service unavailable") ||
    msg.includes("timeout") || msg.includes("aborted") ||
    msg.includes("econnreset") || msg.includes("socket hang up");
}

async function generateWithModel(
  config: GenerationModelConfig,
  systemPrompt: string,
  userPrompt: string,
  retries = 2
): Promise<GenerationResult | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      console.log(`[PASS 1] Retrying ${config.name} (attempt ${attempt + 1}/${retries + 1}) after ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GENERATION_CALL_TIMEOUT_MS);
    try {
      const result = await generateObject({
        model: config.model,
        schema: titleGenerationOutputSchema,
        system: systemPrompt,
        prompt: userPrompt,
        abortSignal: controller.signal,
      });
      return result.object as GenerationResult;
    } catch (err) {
      console.warn(`[PASS 1] generateObject failed for ${config.name} (attempt ${attempt + 1}):`,
        err instanceof Error ? err.message : err);

      // Try generateText fallback (handles models that return <think> tags or non-structured output)
      try {
        const fallbackController = new AbortController();
        const fallbackTimeout = setTimeout(() => fallbackController.abort(), GENERATION_CALL_TIMEOUT_MS);
        const fallback = await generateText({
          model: config.model,
          system: systemPrompt,
          prompt: userPrompt,
          abortSignal: fallbackController.signal,
        });
        clearTimeout(fallbackTimeout);
        const jsonStr = extractFirstJson(fallback.text);
        if (!jsonStr) {
          throw new Error(`[PASS 1] fallback extraction failed for ${config.name} - No JSON found. Output snippet: ${fallback.text.slice(0, 500)}`);
        }
        const parsed = JSON.parse(jsonStr);
        const validated = titleGenerationOutputSchema.safeParse(parsed);
        if (!validated.success) {
          throw new Error(`[PASS 1] Fallback validation failed for ${config.name}: ${validated.error.message}. Raw parsed: ${JSON.stringify(parsed).slice(0, 500)}`);
        }
        return validated.data;
      } catch (err2) {
        const msg1 = err instanceof Error ? err.message : String(err);
        const msg2 = err2 instanceof Error ? err2.message : String(err2);

        // Retry on transient errors, throw on final attempt
        if (attempt < retries && (isTransientError(err) || isTransientError(err2))) {
          console.warn(`[PASS 1] Transient error for ${config.name}, will retry: ${msg1}`);
          continue;
        }
        throw new Error(`[PASS 1] Both standard and fallback generation failed for ${config.name}. Standard err: ${msg1}. Fallback err: ${msg2}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

// Fetch relevant benchmarks from Supabase for scoring calibration
async function fetchBenchmarks(limit = 5): Promise<string> {
  if (!supabase) return "";
  try {
    const { data: titles } = await supabase
      .from("benchmark_titles")
      .select("text, score, content_type, archetype, emotional_trigger, source_channel")
      .order("score", { ascending: false })
      .limit(limit);

    if (!titles || titles.length === 0) return "";

    return `\n## BENCHMARK CALIBRATION ANCHORS (from database)\n${titles.map(
      (t: any) => `- "${t.text}" (${t.content_type}, score: ${t.score}, ${t.archetype || "no archetype"}, ${t.source_channel || "unknown channel"})`
    ).join("\n")}\n\nStep 0: Before scoring any title, compare it against these benchmarks. Find the benchmark closest in quality and energy, and use its score as your anchor.`;
  } catch {
    return "";
  }
}

// Dual-scorer panel: scores with both GPT-5.2 and Gemini, returns mean of dimension scores
async function scoreWithPanel(
  titlesToScore: { youtubeTitles: any[]; spotifyTitles: any[] },
  research: string,
  scoringPrompt: string,
  signal?: AbortSignal
): Promise<any> {
  const scoringInput = buildScoringUserPrompt({
    generatedTitles: JSON.stringify(titlesToScore, null, 2),
    research,
  });

  const scorers: Array<{ model: any; name: string }> = [
    { model: scoringModel, name: "GPT-5.2" },
  ];
  if (geminiScoringModel) {
    scorers.push({ model: geminiScoringModel, name: "Gemini 3.1 Pro" });
  }

  const SCORING_CALL_TIMEOUT_MS = 150_000;

  const results = await Promise.allSettled(
    scorers.map((s) => {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), SCORING_CALL_TIMEOUT_MS);
      const onAbort = () => ctrl.abort();
      signal?.addEventListener("abort", onAbort);
      if (signal?.aborted) {
        clearTimeout(tm);
        signal?.removeEventListener("abort", onAbort);
        throw new Error("Aborted");
      }
      return generateObject({
        model: s.model,
        schema: scoringOutputSchema,
        system: scoringPrompt,
        prompt: scoringInput,
        abortSignal: ctrl.signal,
      }).finally(() => {
        clearTimeout(tm);
        signal?.removeEventListener("abort", onAbort);
      });
    })
  );

  const successfulScores: any[] = [];
  results.forEach((result, idx) => {
    if (result.status === "fulfilled") {
      successfulScores.push({ scores: result.value.object, name: scorers[idx].name });
    } else {
      console.warn(`[SCORING PANEL] ${scorers[idx].name} failed:`, result.reason);
    }
  });

  if (successfulScores.length === 0) return null;
  if (successfulScores.length === 1) return successfulScores[0].scores;

  // Merge: average dimension scores across both scorers
  return mergeScores(successfulScores.map((s) => s.scores));
}

function averageDimensionScores(scores: any[]): any {
  if (scores.length === 0) return null;
  if (scores.length === 1) return scores[0];

  const result: any = {};
  const keys = Object.keys(scores[0]);
  for (const key of keys) {
    if (typeof scores[0][key] === "number") {
      const avg = scores.reduce((sum: number, s: any) => sum + (s[key] || 0), 0) / scores.length;
      result[key] = Math.round(avg);
    }
  }
  // Recalculate total as sum of dimensions
  const dimensionKeys = keys.filter((k) => k !== "total" && typeof scores[0][k] === "number");
  result.total = dimensionKeys.reduce((sum: number, k: string) => sum + (result[k] || 0), 0);
  return result;
}

function mergeScores(allScores: any[]): any {
  if (allScores.length === 0) return null;
  if (allScores.length === 1) return allScores[0];

  const merged: any = { tierClassification: allScores[0].tierClassification };

  // Merge YouTube titles
  const ytCount = Math.max(...allScores.map((s) => s.youtubeTitles?.length || 0));
  merged.youtubeTitles = [];
  for (let i = 0; i < ytCount; i++) {
    const titlesAtIdx = allScores
      .map((s) => s.youtubeTitles?.[i])
      .filter(Boolean);
    if (titlesAtIdx.length === 0) continue;

    const base = { ...titlesAtIdx[0] };
    const dimensionScores = titlesAtIdx.map((t: any) => t.score).filter(Boolean);
    if (dimensionScores.length > 0) {
      base.score = averageDimensionScores(dimensionScores);
    }
    const thumbScores = titlesAtIdx.map((t: any) => t.thumbnailTextScore).filter(Boolean);
    if (thumbScores.length > 0) {
      base.thumbnailTextScore = averageDimensionScores(thumbScores);
    }
    merged.youtubeTitles.push(base);
  }

  // Merge Spotify titles
  const spCount = Math.max(...allScores.map((s) => s.spotifyTitles?.length || 0));
  merged.spotifyTitles = [];
  for (let i = 0; i < spCount; i++) {
    const titlesAtIdx = allScores
      .map((s) => s.spotifyTitles?.[i])
      .filter(Boolean);
    if (titlesAtIdx.length === 0) continue;

    const base = { ...titlesAtIdx[0] };
    const dimensionScores = titlesAtIdx.map((t: any) => t.score).filter(Boolean);
    if (dimensionScores.length > 0) {
      base.score = averageDimensionScores(dimensionScores);
    }
    merged.spotifyTitles.push(base);
  }

  return merged;
}

// Database logging helpers
async function insertGenerationRun(data: {
  podcastName: string;
  guestName: string;
  episodeDescription: string;
  guestTier: number;
  transcriptCharCount: number;
  modelsUsed: string[];
  scoringModel: string;
  pairwiseEnabled: boolean;
}): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data: row, error } = await supabase
      .from("generation_runs")
      .insert({
        podcast_name: data.podcastName,
        guest_name: data.guestName,
        episode_description: data.episodeDescription,
        guest_tier: data.guestTier,
        transcript_char_count: data.transcriptCharCount,
        models_used: data.modelsUsed,
        scoring_model: data.scoringModel,
        pairwise_enabled: data.pairwiseEnabled,
        status: "running",
      })
      .select("id")
      .single();
    if (error) {
      console.warn("[DB] Failed to insert generation_run:", error.message);
      return null;
    }
    return row?.id || null;
  } catch (err) {
    console.warn("[DB] Error inserting generation_run:", err);
    return null;
  }
}

async function updateGenerationRun(
  runId: string | null,
  data: { status: string; totalCandidatesGenerated?: number; runDurationMs?: number }
): Promise<void> {
  if (!supabase || !runId) return;
  try {
    await supabase.from("generation_runs").update({
      status: data.status,
      total_candidates_generated: data.totalCandidatesGenerated,
      run_duration_ms: data.runDurationMs,
    }).eq("id", runId);
  } catch (err) {
    console.warn("[DB] Error updating generation_run:", err);
  }
}

async function insertTitleResults(
  runId: string,
  titles: any[],
  platform: "youtube" | "spotify",
  wasSelected: boolean
): Promise<string[]> {
  if (!supabase || !runId) return [];
  try {
    const rows = titles.map((t: any) => ({
      run_id: runId,
      platform,
      title: t.title,
      thumbnail_text: t.thumbnailText || null,
      source_model: t.sourceModel || "unknown",
      score_total: t.score?.total || null,
      score_curiosity_gap: t.score?.curiosityGap || null,
      score_authority_signal: t.score?.authoritySignal || null,
      score_emotional_trigger: t.score?.emotionalTrigger || null,
      score_trending_keyword: t.score?.trendingKeyword || null,
      score_specificity: t.score?.specificity || null,
      score_character_count: t.score?.characterCount || null,
      score_word_balance: t.score?.wordBalance || null,
      score_front_load: t.score?.frontLoadHook || null,
      score_platform_fit: t.score?.platformFit || null,
      thumb_score_total: t.thumbnailTextScore?.total || null,
      thumb_curiosity_gap: t.thumbnailTextScore?.curiosityGap || null,
      thumb_emotional_punch: t.thumbnailTextScore?.emotionalPunch || null,
      thumb_title_complement: t.thumbnailTextScore?.titleComplement || null,
      thumb_brevity_clarity: t.thumbnailTextScore?.brevityAndClarity || null,
      pairwise_wins: t.pairwiseWins || null,
      pairwise_rank: t.pairwiseRank || null,
      was_selected: wasSelected,
      was_rewritten: t.rewritten || false,
      rejection_reason: t.rejectionReason || null,
    }));
    const { data, error } = await supabase.from("title_results").insert(rows).select("id");
    if (error) {
      console.warn("[DB] Failed to insert title_results:", error.message);
      return [];
    }
    return (data || []).map((r: any) => r.id);
  } catch (err) {
    console.warn("[DB] Error inserting title_results:", err);
    return [];
  }
}

async function insertModelPerformance(
  runId: string,
  modelStats: Map<string, { generated: number; selected: number; totalScore: number; totalThumbScore: number; timeMs: number; hadErrors: boolean; errorMsg?: string }>
): Promise<void> {
  if (!supabase || !runId) return;
  try {
    const rows = Array.from(modelStats.entries()).map(([name, stats]) => ({
      run_id: runId,
      model_name: name,
      titles_generated: stats.generated,
      titles_selected: stats.selected,
      avg_score: stats.selected > 0 ? Math.round((stats.totalScore / stats.selected) * 100) / 100 : null,
      avg_thumb_score: stats.selected > 0 && stats.totalThumbScore > 0
        ? Math.round((stats.totalThumbScore / stats.selected) * 100) / 100
        : null,
      generation_time_ms: stats.timeMs,
      had_errors: stats.hadErrors,
      error_message: stats.errorMsg || null,
    }));
    const { error } = await supabase.from("model_performance").insert(rows);
    if (error) console.warn("[DB] Failed to insert model_performance:", error.message);
  } catch (err) {
    console.warn("[DB] Error inserting model_performance:", err);
  }
}

async function insertPipelineLogs(
  runId: string,
  entries: import("@/types/pipeline-trace").PipelineTraceEntry[]
): Promise<void> {
  if (!supabase || !runId || entries.length === 0) return;
  try {
    const rows = entries.map((e) => ({
      run_id: runId,
      timestamp: e.timestamp,
      pass: e.pass,
      event: e.event,
      title: e.title || null,
      model: e.model || null,
      platform: e.platform || null,
      archetype: e.archetype || null,
      score_total: e.scoreTotal ?? null,
      score_dimensions: e.scoreDimensions || null,
      thumbnail_text: e.thumbnailText || null,
      thumbnail_score_total: e.thumbnailScoreTotal ?? null,
      thumbnail_score_dimensions: e.thumbnailScoreDimensions || null,
      reason: e.reason || null,
      rewrite_attempt: e.rewriteAttempt ?? null,
      pairwise_rank: e.pairwiseRank ?? null,
      pairwise_wins: e.pairwiseWins ?? null,
    }));

    // Batch insert in chunks of 50
    const CHUNK_SIZE = 50;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase.from("pipeline_logs").insert(chunk);
      if (error) console.warn(`[DB] Failed to insert pipeline_logs chunk ${i}:`, error.message);
    }
  } catch (err) {
    console.warn("[DB] Error inserting pipeline_logs:", err);
  }
}

async function updateRunSummary(
  runId: string,
  summary: import("@/types/pipeline-trace").PipelineSummary
): Promise<void> {
  if (!supabase || !runId) return;
  try {
    await supabase.from("generation_runs").update({
      pipeline_summary: summary,
    }).eq("id", runId);
  } catch (err) {
    console.warn("[DB] Error updating pipeline_summary:", err);
  }
}

const GENERATION_MODES: GenerationMode[] = [
  "full",
  "regenerate_title",
  "rescore",
  "rerank",
  "recontent",
];

type ModelStatsMap = Map<
  string,
  {
    generated: number;
    selected: number;
    totalScore: number;
    totalThumbScore: number;
    timeMs: number;
    hadErrors: boolean;
    errorMsg?: string;
  }
>;

function isGenerationMode(value: unknown): value is GenerationMode {
  return typeof value === "string" && (GENERATION_MODES as string[]).includes(value);
}

function cloneExistingGeneration(existing: GenerationOutput): {
  youtubeTitles: YouTubeTitleItem[];
  spotifyTitles: BaseTitleItem[];
  rejectedTitles: ScoredTitle[];
} {
  return {
    youtubeTitles: (existing.youtubeTitles || []).map((t) => ({ ...(t as any) })),
    spotifyTitles: (existing.spotifyTitles || []).map((t) => ({ ...(t as any) })),
    rejectedTitles: (existing.rejectedTitles || []).map((t) => ({ ...(t as any) })),
  };
}

function toScoreInput(youtubeTitles: YouTubeTitleItem[], spotifyTitles: BaseTitleItem[]) {
  return {
    youtubeTitles: youtubeTitles.map((t: any) => ({
      title: t.title,
      thumbnailText: t.thumbnailText,
      score: t.score,
      thumbnailTextScore: t.thumbnailTextScore,
      scrollStopReason: t.scrollStopReason,
      emotionalTrigger: t.emotionalTrigger,
      platformNotes: t.platformNotes,
    })),
    spotifyTitles: spotifyTitles.map((t: any) => ({
      title: t.title,
      score: t.score,
      scrollStopReason: t.scrollStopReason,
      emotionalTrigger: t.emotionalTrigger,
      platformNotes: t.platformNotes,
    })),
  };
}

function mergeScoredTitles(
  scored: any,
  youtubeTitles: YouTubeTitleItem[],
  spotifyTitles: BaseTitleItem[],
  logger: PipelineLogger
): { youtubeTitles: YouTubeTitleItem[]; spotifyTitles: BaseTitleItem[] } {
  let mergedYoutube = youtubeTitles;
  let mergedSpotify = spotifyTitles;

  const ytScoreLookup = new Map<string, any>();
  if (scored?.youtubeTitles) {
    for (const scoredItem of scored.youtubeTitles) {
      if (scoredItem.title) {
        ytScoreLookup.set(normalizeTitle(scoredItem.title), scoredItem);
      }
    }
  }

  const spScoreLookup = new Map<string, any>();
  if (scored?.spotifyTitles) {
    for (const scoredItem of scored.spotifyTitles) {
      if (scoredItem.title) {
        spScoreLookup.set(normalizeTitle(scoredItem.title), scoredItem);
      }
    }
  }

  if (ytScoreLookup.size > 0) {
    mergedYoutube = youtubeTitles.map((t: any) => {
      const scoredItem = ytScoreLookup.get(normalizeTitle(t.title));
      if (!scoredItem) return t;
      const merged = {
        ...t,
        score: scoredItem.score ?? t.score,
        scrollStopReason: scoredItem.scrollStopReason ?? t.scrollStopReason,
        platformNotes: scoredItem.platformNotes ?? t.platformNotes,
        thumbnailTextScore: scoredItem.thumbnailTextScore ?? t.thumbnailTextScore,
      };
      logger.log({
        pass: "2",
        event: "title_scored",
        title: merged.title,
        model: merged.sourceModel,
        platform: "youtube",
        archetype: merged.archetype,
        scoreTotal: merged.score?.total,
        scoreDimensions: merged.score,
        thumbnailText: merged.thumbnailText,
        thumbnailScoreTotal: merged.thumbnailTextScore?.total,
        thumbnailScoreDimensions: merged.thumbnailTextScore,
      });
      return merged;
    });
  }

  if (spScoreLookup.size > 0) {
    mergedSpotify = spotifyTitles.map((t: any) => {
      const scoredItem = spScoreLookup.get(normalizeTitle(t.title));
      if (!scoredItem) return t;
      const merged = {
        ...t,
        score: scoredItem.score ?? t.score,
        scrollStopReason: scoredItem.scrollStopReason ?? t.scrollStopReason,
        platformNotes: scoredItem.platformNotes ?? t.platformNotes,
      };
      logger.log({
        pass: "2",
        event: "title_scored",
        title: merged.title,
        model: merged.sourceModel,
        platform: "spotify",
        scoreTotal: merged.score?.total,
        scoreDimensions: merged.score,
      });
      return merged;
    });
  }

  return {
    youtubeTitles: mergedYoutube,
    spotifyTitles: mergedSpotify,
  };
}

async function runScoringPass(params: {
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
  logger: PipelineLogger;
  researchStr: string;
  youtubeTitles: YouTubeTitleItem[];
  spotifyTitles: BaseTitleItem[];
  signal?: AbortSignal;
}): Promise<{
  youtubeTitles: YouTubeTitleItem[];
  spotifyTitles: BaseTitleItem[];
  scored: any;
}> {
  const { controller, encoder, logger, researchStr, signal } = params;
  let { youtubeTitles, spotifyTitles } = params;

  logger.startPass("2");
  const scorerNames = geminiScoringModel ? "GPT-5.2 + Gemini 3.1 Pro (panel)" : "GPT-5.2";
  sendSSE(controller, encoder, {
    type: "status",
    message: `Scoring ${youtubeTitles.length} YouTube + ${spotifyTitles.length} Spotify titles with ${scorerNames}...`,
  });

  const benchmarkAnchors = await fetchBenchmarks(5);
  const scoringPrompt = buildScoringSystemPrompt() + benchmarkAnchors;

  let scored: any = null;
  try {
    scored = await scoreWithPanel(
      toScoreInput(youtubeTitles, spotifyTitles),
      researchStr,
      scoringPrompt,
      signal
    );
  } catch (err) {
    console.warn("[PASS 2] Scoring panel failed:", err);
    sendSSE(controller, encoder, {
      type: "status",
      message: "Scoring failed — continuing with self-assessed scores",
    });
  }

  if (scored) {
    const merged = mergeScoredTitles(scored, youtubeTitles, spotifyTitles, logger);
    youtubeTitles = merged.youtubeTitles;
    spotifyTitles = merged.spotifyTitles;
  }

  logger.endPass("2");
  return { youtubeTitles, spotifyTitles, scored };
}

async function runPairwiseRerankPass(params: {
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
  logger: PipelineLogger;
  episodeDescription: string;
  youtubeTitles: YouTubeTitleItem[];
  signal?: AbortSignal;
}): Promise<YouTubeTitleItem[]> {
  const { controller, encoder, logger, episodeDescription, signal } = params;
  let { youtubeTitles } = params;
  let pairwiseSucceeded = false;

  logger.startPass("2.5");
  if (pairwiseJudgeModel && youtubeTitles.length > 1) {
    const topN = Math.min(PAIRWISE_TOP_N, youtubeTitles.length);
    const totalPairs = (topN * (topN - 1)) / 2;
    sendSSE(controller, encoder, {
      type: "status",
      message: `Running pairwise tournament on top ${topN} YouTube titles with Gemini (${totalPairs} unique pairs)...`,
    });

    try {
      const tournamentInput = youtubeTitles.map((t) => ({
        title: t.title,
        thumbnailText: t.thumbnailText || "",
        score: { total: t.score?.total || 0 },
      }));
      const tournament = await runPairwiseTournament(
        tournamentInput,
        episodeDescription,
        topN,
        (completed, total) => {
          if (completed % 5 === 0 || completed === total) {
            sendSSE(controller, encoder, {
              type: "status",
              message: `Pairwise tournament: ${completed}/${total} comparisons complete...`,
            });
          }
        },
        signal
      );

      if (tournament) {
        pairwiseSucceeded = true;
        const rankedTitles = tournament.titles.map((t, idx) => ({
          ...t,
          pairwiseWins: tournament.wins.get(idx) || 0,
        }));
        rankedTitles.sort((a, b) => {
          if ((b.pairwiseWins || 0) !== (a.pairwiseWins || 0)) {
            return (b.pairwiseWins || 0) - (a.pairwiseWins || 0);
          }
          return (b.score?.total || 0) - (a.score?.total || 0);
        });

        const rankedWithOrder = rankedTitles.map((t, idx) => ({
          ...t,
          pairwiseRank: idx + 1,
        }));

        youtubeTitles = youtubeTitles.map((t) => {
          const ranked = rankedWithOrder.find(
            (candidate) => normalizeTitle(candidate.title) === normalizeTitle(t.title)
          );
          if (!ranked) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { pairwiseRank, pairwiseWins, ...rest } = t;
            return rest as YouTubeTitleItem;
          }
          logger.log({
            pass: "2.5",
            event: "pairwise_result",
            title: ranked.title,
            model: t.sourceModel,
            pairwiseRank: ranked.pairwiseRank,
            pairwiseWins: ranked.pairwiseWins,
            scoreTotal: t.score?.total,
          });
          return {
            ...t,
            pairwiseRank: ranked.pairwiseRank,
            pairwiseWins: ranked.pairwiseWins,
          };
        });
      }
    } catch (error) {
      console.warn("[PASS 2.5] Pairwise rerank failed:", error);
      sendSSE(controller, encoder, {
        type: "status",
        message: "Pairwise tournament failed, keeping score-based order.",
      });
    }
  }

  if (!pairwiseSucceeded) {
    youtubeTitles = youtubeTitles.map((t) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { pairwiseRank, pairwiseWins, ...rest } = t;
      return rest as Omit<YouTubeTitleItem, "pairwiseRank" | "pairwiseWins">;
    });
  }
  const hasPairwiseData = pairwiseSucceeded;
  youtubeTitles.sort((a, b) => {
    if (hasPairwiseData) {
      if (a.pairwiseRank !== undefined && b.pairwiseRank !== undefined) {
        return a.pairwiseRank - b.pairwiseRank;
      }
      if (a.pairwiseRank !== undefined) return -1;
      if (b.pairwiseRank !== undefined) return 1;
    }
    return (b.score?.total || 0) - (a.score?.total || 0);
  });
  logger.endPass("2.5");
  return youtubeTitles;
}

async function runDescriptionContentPass(params: {
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
  generated: any;
  researchStr: string;
  youtubeAnalysis: any;
  transcript: string;
  episodeDescription: string;
}) {
  const { controller, encoder, generated, researchStr, youtubeAnalysis, transcript, episodeDescription } = params;

  sendSSE(controller, encoder, {
    type: "status",
    message: "Generating descriptions and chapter titles...",
  });

  try {
    const descriptionPattern = youtubeAnalysis?.descriptionPattern
      ? typeof youtubeAnalysis.descriptionPattern === "string"
        ? youtubeAnalysis.descriptionPattern
        : JSON.stringify(youtubeAnalysis.descriptionPattern, null, 2)
      : null;

    const descSystemPrompt = buildDescriptionChapterSystemPrompt();
    const descUserPrompt = buildDescriptionChapterUserPrompt({
      research: researchStr,
      descriptionPattern,
      winningTitles: {
        youtube: (generated.youtubeTitles || []).map((t: any) => t.title),
        spotify: (generated.spotifyTitles || []).map((t: any) => t.title),
      },
      transcript,
      episodeDescription,
    });

    const descAbort = new AbortController();
    const descTimeout = setTimeout(() => descAbort.abort(), 120_000);
    const descResult = await generateObject({
      model: descriptionModel,
      schema: descriptionChapterOutputSchema,
      system: descSystemPrompt,
      prompt: descUserPrompt,
      abortSignal: descAbort.signal,
    });
    clearTimeout(descTimeout);

    const descOutput = descResult.object;

    const chapterCheck = checkChapterTitles(descOutput.chapters.map((c) => c.title));
    if (!chapterCheck.passed) {
      console.warn("[PASS 4] Chapter guardrail violations:", chapterCheck.violations);
    }

    generated.youtubeDescription = descOutput.youtubeDescription;
    generated.spotifyDescription = descOutput.spotifyDescription;
    generated.chapters = descOutput.chapters;
    generated.descriptionSEOKeywords = descOutput.descriptionSEOKeywords;
    generated.descriptionScore = descOutput.descriptionScore;
    generated.chapterScore = descOutput.chapterScore;

    sendSSE(controller, encoder, {
      type: "status",
      message: `Descriptions and ${descOutput.chapters.length} chapter titles generated.`,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn("[PASS 4] Description generation failed:", reason);
    sendSSE(controller, encoder, {
      type: "status",
      message: `[WARNING] Description generation failed: ${reason}. Titles are still available.`,
    });
  }
}

const targetedRegenerationSchema = generatedYouTubeTitleSchema;

async function generateTargetedArchetypeTitle(params: {
  researchStr: string;
  ytStr: string;
  transcript: string;
  episodeDescription: string;
  targetArchetype: TitleArchetype;
  existingYoutubeTitles: YouTubeTitleItem[];
  signal?: AbortSignal;
}): Promise<YouTubeTitleItem | null> {
  const model = geminiGenerationModel ?? generationModel;
  const modelName = geminiGenerationModel ? "Gemini 3.1 Pro" : "GPT-5.2";
  const existingList = params.existingYoutubeTitles
    .map((t) => `- ${t.title}`)
    .join("\n");

  const prompt = [
    "Generate one new YouTube title candidate and matching thumbnail text.",
    `Archetype must be exactly: ${params.targetArchetype}.`,
    "Do not reuse or paraphrase these existing titles:",
    existingList || "- (none)",
    "",
    "Research context:",
    params.researchStr,
    "",
    "YouTube channel analysis:",
    params.ytStr,
    "",
    "Transcript excerpt:",
    params.transcript.slice(0, 6000),
    "",
    "Episode description:",
    params.episodeDescription,
  ].join("\n");

  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 60_000);
  const onAbort = () => abort.abort();
  params.signal?.addEventListener("abort", onAbort);
  if (params.signal?.aborted) {
    clearTimeout(timeout);
    params.signal?.removeEventListener("abort", onAbort);
    throw new Error("Aborted");
  }
  try {
    const result = await generateObject({
      model,
      schema: targetedRegenerationSchema,
      system: buildGenerationSystemPrompt(),
      prompt,
      abortSignal: abort.signal,
    });
    return {
      ...(result.object as any),
      archetype: params.targetArchetype,
      sourceModel: modelName,
    };
  } catch (err) {
    console.warn("[REGENERATE_TITLE] Failed to generate targeted title:", err);
    return null;
  } finally {
    clearTimeout(timeout);
    params.signal?.removeEventListener("abort", onAbort);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerationRequestPayload;
    const {
      research,
      youtubeAnalysis,
      transcript,
      episodeDescription,
      mode: requestedMode,
      existingGeneration,
      targetArchetype,
    } = body;
    const youtubeAnalysisAny = youtubeAnalysis as any;

    const mode: GenerationMode = requestedMode ?? "full";

    if (!research || !transcript || !episodeDescription) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!isGenerationMode(mode)) {
      return Response.json(
        { error: `Invalid generation mode. Expected one of: ${GENERATION_MODES.join(", ")}` },
        { status: 400 }
      );
    }

    if (mode !== "full" && !existingGeneration) {
      return Response.json(
        { error: "existingGeneration is required for rerun modes" },
        { status: 400 }
      );
    }

    if (mode === "rescore") {
      const existingTitles = existingGeneration?.youtubeTitles || [];
      const hasScores = existingTitles.some((t) => t.score !== undefined);
      if (existingTitles.length === 0) {
        return Response.json(
          { error: "No YouTube titles found in existingGeneration for rescore mode" },
          { status: 400 }
        );
      }
      if (!hasScores) {
        return Response.json(
          { error: "Existing titles must have scores before rescore. Run a full pipeline first." },
          { status: 400 }
        );
      }
    }

    if (mode === "regenerate_title") {
      if (!targetArchetype || !ALL_TITLE_ARCHETYPES.includes(targetArchetype as TitleArchetype)) {
        return Response.json(
          { error: "targetArchetype is required for regenerate_title mode" },
          { status: 400 }
        );
      }
    }

    const encoder = new TextEncoder();
    const routeAbortCtrl = new AbortController();
    request.signal.addEventListener("abort", () => routeAbortCtrl.abort());
    const stream = new ReadableStream({
      async start(controller) {
        const runStartTime = Date.now();
        let runId: string | null = null;
        const logger = new PipelineLogger((entry) => sendTrace(controller, encoder, entry));

        try {
          const researchStr =
            typeof research === "string"
              ? research
              : JSON.stringify(research, null, 2);
          const ytStr = youtubeAnalysis
            ? typeof youtubeAnalysis === "string"
              ? youtubeAnalysis
              : JSON.stringify(youtubeAnalysis, null, 2)
            : "No YouTube channel data available.";

          // Extract tier info for guardrails
          let researchObj: any = {};
          try {
            researchObj =
              typeof research === "string" ? JSON.parse(research) : research;
          } catch (parseErr) {
            console.warn(
              "[generate] Failed to parse research JSON:",
              parseErr instanceof Error ? parseErr.message : parseErr
            );
          }
          const guestName = researchObj?.guest?.name || "";
          const guestTier = researchObj?.guest?.guestTier?.tier || 3;
          const guestCredential =
            researchObj?.guest?.authorityLabel || undefined;
          const podcastName = researchObj?.brand?.podcastName || "Unknown Podcast";

          // === DB: Insert generation run ===
          const models: GenerationModelConfig[] = [
            { model: geminiGenerationModel ?? generationModel, name: geminiGenerationModel ? "Gemini 3.1 Pro" : "Gemini 3.0 Flash" },
            { model: generationModel, name: "GPT-5.2" },
            { model: minimaxGenerationModel, name: "Minimax M2.5" },
            ...(kimiModel ? [{ model: kimiModel, name: "Kimi K2.5" }] : []),
          ];

          runId = await insertGenerationRun({
            podcastName,
            guestName: guestName || "(no guest)",
            episodeDescription,
            guestTier,
            transcriptCharCount: transcript.length,
            modelsUsed: models.map((m) => m.name),
            scoringModel: geminiScoringModel ? "GPT-5.2 + Gemini 3.1 Pro (panel)" : "GPT-5.2",
            pairwiseEnabled: !!pairwiseJudgeModel,
          });

          // Send runId to client early so it can poll for results if the stream is cut
          if (runId) {
            sendSSE(controller, encoder, { type: "run_id", runId });
          }

          if (mode !== "full") {
            if (!existingGeneration) {
              throw new Error("existingGeneration is required for rerun modes.");
            }

            const base = cloneExistingGeneration(existingGeneration);
            let allYoutubeTitles = base.youtubeTitles;
            let allSpotifyTitles = base.spotifyTitles;
            const allRejectedTitles = base.rejectedTitles;
            const eliminatedYT: YouTubeTitleItem[] = [];
            const eliminatedSP: BaseTitleItem[] = [];
            const modelStats: ModelStatsMap = new Map();
            const existingModels = new Set<string>();
            for (const t of allYoutubeTitles) {
              if (t.sourceModel) existingModels.add(t.sourceModel);
            }
            for (const t of allSpotifyTitles) {
              if (t.sourceModel) existingModels.add(t.sourceModel);
            }
            for (const model of existingModels) {
              modelStats.set(model, {
                generated: 0,
                selected: 0,
                totalScore: 0,
                totalThumbScore: 0,
                timeMs: 0,
                hadErrors: false,
              });
            }
            let tierClassification = existingGeneration.tierClassification;

            if (allYoutubeTitles.length === 0 && mode !== "recontent") {
              throw new Error("No existing YouTube titles found for rerun mode.");
            }

            sendSSE(controller, encoder, {
              type: "status",
              message: `Running ${mode} mode with existing generation state...`,
            });

            if (mode === "regenerate_title") {
              const arch = targetArchetype as TitleArchetype;
              logger.startPass("1");
              sendSSE(controller, encoder, {
                type: "status",
                message: `Regenerating only the ${arch} YouTube title...`,
              });

              const targetIndex = allYoutubeTitles.findIndex((t) => t.archetype === arch);
              if (targetIndex === -1) {
                throw new Error(`No existing title found for archetype: ${arch}`);
              }

              const replacedTitle = { ...allYoutubeTitles[targetIndex] };
              const replacement = await generateTargetedArchetypeTitle({
                researchStr,
                ytStr,
                transcript,
                episodeDescription,
                targetArchetype: arch,
                existingYoutubeTitles: allYoutubeTitles,
                signal: routeAbortCtrl.signal,
              });

              if (!replacement) {
                throw new Error(`Failed to regenerate title for archetype: ${arch}`);
              }

              allYoutubeTitles[targetIndex] = replacement;
              eliminatedYT.push(replacedTitle);
              allRejectedTitles.push({
                title: replacedTitle.title,
                rejectionReason: `Replaced by targeted regeneration for archetype ${arch}.`,
              });

              logger.log({
                pass: "1",
                event: "title_rejected",
                title: replacedTitle.title,
                model: replacedTitle.sourceModel,
                platform: "youtube",
                archetype: replacedTitle.archetype,
                scoreTotal: replacedTitle.score?.total,
                reason: `Replaced by targeted regeneration for archetype ${arch}.`,
              });
              logger.log({
                pass: "1",
                event: "title_generated",
                title: replacement.title,
                model: replacement.sourceModel,
                platform: "youtube",
                archetype: replacement.archetype,
              });
              logger.endPass("1");

              const source = replacement.sourceModel || "unknown";
              modelStats.set(source, {
                generated: 1,
                selected: 0,
                totalScore: 0,
                totalThumbScore: 0,
                timeMs: 0,
                hadErrors: false,
              });
            }

            if (mode === "regenerate_title" || mode === "rescore" || mode === "rerank") {
              const scoredPass = await runScoringPass({
                controller,
                encoder,
                logger,
                researchStr,
                youtubeTitles: allYoutubeTitles,
                spotifyTitles: allSpotifyTitles,
                signal: routeAbortCtrl.signal,
              });
              allYoutubeTitles = scoredPass.youtubeTitles;
              allSpotifyTitles = scoredPass.spotifyTitles;
              tierClassification =
                scoredPass.scored?.tierClassification ?? tierClassification;
              if (mode === "rescore") {
                allYoutubeTitles.sort((a, b) => (b.score?.total || 0) - (a.score?.total || 0));
                allSpotifyTitles.sort((a, b) => (b.score?.total || 0) - (a.score?.total || 0));
              }
            }

            if (mode === "regenerate_title" || mode === "rerank") {
              allYoutubeTitles = await runPairwiseRerankPass({
                controller,
                encoder,
                logger,
                episodeDescription,
                youtubeTitles: allYoutubeTitles,
                signal: routeAbortCtrl.signal,
              });
            }

            const selectionPass = mode === "recontent" ? "4" : mode === "rescore" ? "2" : "2.5";
            for (const t of allYoutubeTitles) {
              logger.log({
                pass: selectionPass,
                event: "title_selected",
                title: t.title,
                model: t.sourceModel,
                platform: "youtube",
                archetype: t.archetype,
                scoreTotal: t.score?.total,
                pairwiseRank: t.pairwiseRank,
                pairwiseWins: t.pairwiseWins,
              });
            }
            for (const t of allSpotifyTitles) {
              logger.log({
                pass: selectionPass,
                event: "title_selected",
                title: t.title,
                model: t.sourceModel,
                platform: "spotify",
                scoreTotal: t.score?.total,
              });
            }

            const generated: any = {
              ...(existingGeneration as any),
              youtubeTitles: allYoutubeTitles,
              spotifyTitles: allSpotifyTitles,
              rejectedTitles: allRejectedTitles,
              tierClassification,
            };

            if (mode === "recontent") {
              await runDescriptionContentPass({
                controller,
                encoder,
                generated,
                researchStr,
                youtubeAnalysis: youtubeAnalysisAny,
                transcript,
                episodeDescription,
              });
            } else {
              sendSSE(controller, encoder, {
                type: "status",
                message: "Kept existing descriptions and chapters for this rerun mode.",
              });
            }

            for (const t of generated.youtubeTitles || []) {
              const stats = modelStats.get(t.sourceModel || "");
              if (stats) {
                stats.selected++;
                stats.totalScore += t.score?.total || 0;
                stats.totalThumbScore += t.thumbnailTextScore?.total || 0;
              }
            }
            for (const t of generated.spotifyTitles || []) {
              const stats = modelStats.get(t.sourceModel || "");
              if (stats) {
                stats.selected++;
                stats.totalScore += t.score?.total || 0;
              }
            }

            const runDurationMs = Date.now() - runStartTime;
            const totalCandidates = allYoutubeTitles.length + allSpotifyTitles.length;
            const pipelineSummary = logger.buildSummary();

            if (runId) {
              const ytIds = await insertTitleResults(runId, generated.youtubeTitles || [], "youtube", true);
              const spIds = await insertTitleResults(runId, generated.spotifyTitles || [], "spotify", true);
              ytIds.forEach((id, i) => {
                if (generated.youtubeTitles?.[i]) generated.youtubeTitles[i].titleResultId = id;
              });
              spIds.forEach((id, i) => {
                if (generated.spotifyTitles?.[i]) generated.spotifyTitles[i].titleResultId = id;
              });

              const persistenceTasks: Promise<unknown>[] = [
                updateGenerationRun(runId, {
                  status: "complete",
                  totalCandidatesGenerated: totalCandidates,
                  runDurationMs,
                }),
                insertPipelineLogs(runId, logger.getEntries()),
                updateRunSummary(runId, pipelineSummary),
              ];

              if (eliminatedYT.length > 0) {
                persistenceTasks.push(
                  insertTitleResults(
                    runId,
                    eliminatedYT.map((t) => ({
                      ...t,
                      rejectionReason: `Replaced in ${mode} mode (scored ${t.score?.total ?? "N/A"}/100)`,
                    })),
                    "youtube",
                    false
                  )
                );
              }
              if (eliminatedSP.length > 0) {
                persistenceTasks.push(
                  insertTitleResults(
                    runId,
                    eliminatedSP.map((t) => ({
                      ...t,
                      rejectionReason: `Replaced in ${mode} mode (scored ${t.score?.total ?? "N/A"}/100)`,
                    })),
                    "spotify",
                    false
                  )
                );
              }
              if (modelStats.size > 0) {
                persistenceTasks.push(insertModelPerformance(runId, modelStats));
              }

              await Promise.all(persistenceTasks);
            }

            if (runId && supabase) {
              try {
                await supabase.from("generation_runs").update({ output_json: generated }).eq("id", runId);
              } catch (err) {
                console.warn("[DB] Error saving output_json:", err);
              }
            }

            sendSSE(controller, encoder, { type: "pipeline_summary", summary: pipelineSummary });
            sendSSE(controller, encoder, { type: "complete", data: generated });
            return;
          }

          // === PASS 1: Multi-model parallel generation ===
          logger.startPass("1");
          const systemPrompt = buildGenerationSystemPrompt();
          const userPrompt = buildGenerationUserPrompt({
            research: researchStr,
            youtubeAnalysis: ytStr,
            transcript,
            episodeDescription,
            conceptualReframe: researchObj?.transcript?.conceptualReframe || null,
            hotTakeTemperature: researchObj?.transcript?.hotTakeTemperature || undefined,
          });

          sendSSE(controller, encoder, {
            type: "status",
            message: `Generating titles with ${models.length} models in parallel (${models.map((m) => m.name).join(", ")})...`,
          });

          const modelTimings = new Map<string, number>();
          const modelStartTimes = new Map<string, number>();
          for (const m of models) modelStartTimes.set(m.name, Date.now());

          const results = await Promise.allSettled(
            models.map(async (m) => {
              const result = await generateWithModel(m, systemPrompt, userPrompt);
              modelTimings.set(m.name, Date.now() - (modelStartTimes.get(m.name) || Date.now()));
              return result;
            })
          );

          // Merge successful results
          let allYoutubeTitles: YouTubeTitleItem[] = [];
          let allSpotifyTitles: BaseTitleItem[] = [];
          const allRejectedTitles: ScoredTitle[] = [];
          const succeededModels: string[] = [];
          const modelStats = new Map<string, { generated: number; selected: number; totalScore: number; totalThumbScore: number; timeMs: number; hadErrors: boolean; errorMsg?: string }>();

          results.forEach((result, idx) => {
            const modelName = models[idx].name;
            const timeMs = modelTimings.get(modelName) || 0;

            if (result.status === "fulfilled" && result.value) {
              succeededModels.push(modelName);
              const gen = result.value;
              const ytCount = gen.youtubeTitles?.length || 0;
              const spCount = gen.spotifyTitles?.length || 0;

              for (const t of gen.youtubeTitles || []) {
                allYoutubeTitles.push({ ...t, sourceModel: modelName });
                logger.log({
                  pass: "1",
                  event: "title_generated",
                  title: t.title,
                  model: modelName,
                  platform: "youtube",
                  archetype: t.archetype,
                });
              }
              for (const t of gen.spotifyTitles || []) {
                allSpotifyTitles.push({ ...t, sourceModel: modelName });
                logger.log({
                  pass: "1",
                  event: "title_generated",
                  title: t.title,
                  model: modelName,
                  platform: "spotify",
                });
              }
              allRejectedTitles.push(...(gen.rejectedTitles || []));

              modelStats.set(modelName, {
                generated: ytCount + spCount,
                selected: 0,
                totalScore: 0,
                totalThumbScore: 0,
                timeMs,
                hadErrors: false,
              });
            } else {
              const reason = result.status === "rejected" ? (result.reason instanceof Error ? result.reason.message : String(result.reason)) : "returned null";
              console.warn(`[PASS 1] ${modelName} failed. Reason:`, reason);
              sendSSE(controller, encoder, {
                type: "status",
                message: `[WARNING] ${modelName} failed: ${reason}`
              });
              logger.log({
                pass: "1",
                event: "pipeline_warning",
                model: modelName,
                reason: `Model failed: ${reason.slice(0, 200)}`,
              });
              modelStats.set(modelName, {
                generated: 0,
                selected: 0,
                totalScore: 0,
                totalThumbScore: 0,
                timeMs,
                hadErrors: true,
                errorMsg: reason.slice(0, 500),
              });
            }
          });

          if (allYoutubeTitles.length === 0) {
            await updateGenerationRun(runId, { status: "error" });
            sendSSE(controller, encoder, {
              type: "error",
              message: "All generation models failed. No titles produced.",
            });
            controller.close();
            return;
          }

          sendSSE(controller, encoder, {
            type: "status",
            message: `${succeededModels.length}/${models.length} models succeeded (${succeededModels.join(", ")}). Got ${allYoutubeTitles.length} YouTube + ${allSpotifyTitles.length} Spotify titles.`,
          });

          // Semantic deduplication
          const dedupedYoutube: typeof allYoutubeTitles = [];
          for (const candidate of allYoutubeTitles) {
            const sameAngleCount = dedupedYoutube.filter(t => areSameAngle(t.title, candidate.title)).length;
            if (sameAngleCount === 0) {
              dedupedYoutube.push(candidate);
            } else {
              logger.log({
                pass: "1",
                event: "dedup_removed",
                title: candidate.title,
                model: candidate.sourceModel,
                reason: "Redundant angle — overlapping key nouns with existing title",
              });
            }
          }
          if (dedupedYoutube.length < allYoutubeTitles.length) {
            sendSSE(controller, encoder, {
              type: "status",
              message: `Deduplicated ${allYoutubeTitles.length - dedupedYoutube.length} redundant angle(s). ${dedupedYoutube.length} distinct titles remaining.`,
            });
          }
          allYoutubeTitles = dedupedYoutube;

          // Guardrails
          const ytSlopCheck = checkAiSlop(getAllTitleTexts(allYoutubeTitles));
          const ytTierCheck = checkTierCompliance(
            guestName,
            guestTier,
            guestCredential,
            allYoutubeTitles.map((t: any) => t.title)
          );
          const ytThumbCheck = checkThumbnailText(
            allYoutubeTitles.map((t: any) => ({
              thumbnailText: t.thumbnailText || "",
              title: t.title,
            }))
          );

          type GuardrailViolation = string | { title?: string; reason?: string;[k: string]: unknown };
          const allViolations: GuardrailViolation[] = [
            ...ytSlopCheck.violations,
            ...ytTierCheck.violations,
            ...ytThumbCheck.violations,
          ];
          if (allViolations.length > 0) {
            for (const v of allViolations) {
              logger.log({
                pass: "1",
                event: "guardrail_violation",
                title: typeof v === "string" ? undefined : v.title,
                reason: typeof v === "string" ? v : JSON.stringify(v),
              });
            }
            sendSSE(controller, encoder, {
              type: "status",
              message: `${allViolations.length} guardrail violation(s) detected — scoring will penalize affected titles.`,
            });
          }
          logger.endPass("1");

          const spSlopCheck = checkAiSlop(getAllTitleTexts(allSpotifyTitles));
          if (!spSlopCheck.passed) {
            console.warn("[PASS 1] Spotify guardrail violations:", spSlopCheck.violations);
          }

          // === PASS 2: Dual-scorer panel ===
          logger.startPass("2");
          const scorerNames = geminiScoringModel ? "GPT-5.2 + Gemini 3.1 Pro (panel)" : "GPT-5.2";
          sendSSE(controller, encoder, {
            type: "status",
            message: `Scoring ${allYoutubeTitles.length} YouTube + ${allSpotifyTitles.length} Spotify titles with ${scorerNames}...`,
          });

          const benchmarkAnchors = await fetchBenchmarks(5);
          const scoringPrompt = buildScoringSystemPrompt() + benchmarkAnchors;
          const titlesToScore = {
            youtubeTitles: allYoutubeTitles.map((t: any) => ({
              title: t.title,
              thumbnailText: t.thumbnailText,
              score: t.score,
              thumbnailTextScore: t.thumbnailTextScore,
              scrollStopReason: t.scrollStopReason,
              emotionalTrigger: t.emotionalTrigger,
              platformNotes: t.platformNotes,
            })),
            spotifyTitles: allSpotifyTitles.map((t) => ({
              title: t.title,
              score: t.score,
              scrollStopReason: t.scrollStopReason,
              emotionalTrigger: t.emotionalTrigger,
              platformNotes: t.platformNotes,
            })),
          };

          let scored: any = null;
          try {
            scored = await scoreWithPanel(titlesToScore, researchStr, scoringPrompt, routeAbortCtrl.signal);
          } catch (err) {
            console.warn("[PASS 2] Scoring panel failed:", err);
            sendSSE(controller, encoder, {
              type: "status",
              message: "Scoring failed — continuing with self-assessed scores",
            });
          }

          // Merge scores back onto titles
          if (scored) {
            const ytScoreLookup = new Map<string, any>();
            if (scored.youtubeTitles) {
              for (const scoredItem of scored.youtubeTitles) {
                if (scoredItem.title) {
                  ytScoreLookup.set(normalizeTitle(scoredItem.title), scoredItem);
                }
              }
            }
            const spScoreLookup = new Map<string, any>();
            if (scored.spotifyTitles) {
              for (const scoredItem of scored.spotifyTitles) {
                if (scoredItem.title) {
                  spScoreLookup.set(normalizeTitle(scoredItem.title), scoredItem);
                }
              }
            }
            if (ytScoreLookup.size > 0) {
              allYoutubeTitles = allYoutubeTitles.map((t: any) => {
                const key = normalizeTitle(t.title);
                const scoredItem = ytScoreLookup.get(key);
                if (scoredItem) {
                  const merged = {
                    ...t,
                    score: scoredItem.score ?? t.score,
                    scrollStopReason: scoredItem.scrollStopReason ?? t.scrollStopReason,
                    platformNotes: scoredItem.platformNotes ?? t.platformNotes,
                    thumbnailTextScore: scoredItem.thumbnailTextScore ?? t.thumbnailTextScore,
                  };
                  logger.log({
                    pass: "2",
                    event: "title_scored",
                    title: merged.title,
                    model: merged.sourceModel,
                    platform: "youtube",
                    archetype: merged.archetype,
                    scoreTotal: merged.score?.total,
                    scoreDimensions: merged.score,
                    thumbnailText: merged.thumbnailText,
                    thumbnailScoreTotal: merged.thumbnailTextScore?.total,
                    thumbnailScoreDimensions: merged.thumbnailTextScore,
                  });
                  return merged;
                }
                return t;
              });
            }
            if (spScoreLookup.size > 0) {
              allSpotifyTitles = allSpotifyTitles.map((t) => {
                const key = normalizeTitle(t.title);
                const scoredItem = spScoreLookup.get(key);
                if (scoredItem) {
                  const merged = {
                    ...t,
                    score: scoredItem.score ?? t.score,
                    scrollStopReason: scoredItem.scrollStopReason ?? t.scrollStopReason,
                    platformNotes: scoredItem.platformNotes ?? t.platformNotes,
                  };
                  logger.log({
                    pass: "2",
                    event: "title_scored",
                    title: merged.title,
                    model: merged.sourceModel,
                    platform: "spotify",
                    scoreTotal: merged.score?.total,
                    scoreDimensions: merged.score,
                  });
                  return merged;
                }
                return t;
              });
            }
          }
          logger.endPass("2");

          // === PASS 2.75: Thumbnail Text Refinement ===
          logger.startPass("2.75");
          const THUMB_REFINEMENT_THRESHOLD = 75;
          const weakThumbTitles = allYoutubeTitles
            .filter((t) => (t.thumbnailTextScore?.total || 0) < THUMB_REFINEMENT_THRESHOLD)
            .slice(0, 4);

          if (weakThumbTitles.length > 0) {
            sendSSE(controller, encoder, {
              type: "status",
              message: `Refining ${weakThumbTitles.length} weak thumbnail text(s) (score < ${THUMB_REFINEMENT_THRESHOLD})...`,
            });

            const conceptualReframe = researchObj?.transcript?.conceptualReframe || null;
            const hotTakeTemperature = researchObj?.transcript?.hotTakeTemperature || "warm";

            try {
              const thumbRefineModel = geminiGenerationModel ?? generationModel;
              const thumbRefineCtrl = new AbortController();
              const thumbRefineTimeout = setTimeout(() => thumbRefineCtrl.abort(), 30_000);

              const thumbResult = await generateText({
                model: thumbRefineModel,
                system: buildThumbnailRefinementSystemPrompt(),
                prompt: buildThumbnailRefinementUserPrompt({
                  titles: weakThumbTitles.map((t) => ({
                    title: t.title,
                    thumbnailText: t.thumbnailText || "",
                    thumbnailTextScore: t.thumbnailTextScore?.total || 0,
                  })),
                  episodeDescription,
                  conceptualReframe,
                  hotTakeTemperature,
                }),
                abortSignal: thumbRefineCtrl.signal,
              });
              clearTimeout(thumbRefineTimeout);

              const thumbJson = extractFirstJson(thumbResult.text);
              if (thumbJson) {
                const parsed = JSON.parse(thumbJson);
                const refinements: Array<{
                  originalTitle: string;
                  bestAlternative: string;
                  bestScore: { total: number };
                }> = parsed.refinements || [];

                let replacedCount = 0;
                for (const ref of refinements) {
                  if (!ref.bestAlternative || !ref.bestScore?.total) continue;
                  const normalizedRefTitle = normalizeTitle(ref.originalTitle);
                  const idx = allYoutubeTitles.findIndex(
                    (t) => normalizeTitle(t.title) === normalizedRefTitle
                  );
                  if (idx === -1) continue;
                  const oldScore = allYoutubeTitles[idx].thumbnailTextScore?.total || 0;
                  const oldThumb = allYoutubeTitles[idx].thumbnailText;
                  if (ref.bestScore.total > oldScore) {
                    allYoutubeTitles[idx] = {
                      ...allYoutubeTitles[idx],
                      thumbnailText: ref.bestAlternative,
                      thumbnailTextScore: ref.bestScore as any,
                    };
                    replacedCount++;
                    logger.log({
                      pass: "2.75",
                      event: "thumbnail_refined",
                      title: allYoutubeTitles[idx].title,
                      thumbnailText: ref.bestAlternative,
                      thumbnailScoreTotal: ref.bestScore.total,
                      reason: `Replaced "${oldThumb}" (${oldScore}/100) → "${ref.bestAlternative}" (${ref.bestScore.total}/100)`,
                    });
                  }
                }

                if (replacedCount > 0) {
                  sendSSE(controller, encoder, {
                    type: "status",
                    message: `Replaced ${replacedCount} thumbnail text(s) with higher-scoring alternatives.`,
                  });
                } else {
                  sendSSE(controller, encoder, {
                    type: "status",
                    message: "Thumbnail refinement produced no improvements — keeping originals.",
                  });
                }
              }
            } catch (thumbErr) {
              console.warn("[PASS 2.75] Thumbnail refinement failed:", thumbErr);
              sendSSE(controller, encoder, {
                type: "status",
                message: "Thumbnail refinement failed — keeping original thumbnail text.",
              });
            }
          }

          // === PASS 2.5: Pairwise Tournament ===
          logger.startPass("2.5");
          let pairwiseSucceeded = false;
          if (pairwiseJudgeModel && allYoutubeTitles.length > 4) {
            sendSSE(controller, encoder, {
              type: "status",
              message: `Running pairwise tournament on top ${PAIRWISE_TOP_N} YouTube titles with Gemini (${(PAIRWISE_TOP_N * (PAIRWISE_TOP_N - 1)) / 2} unique pairs)...`,
            });

            try {
              const tournamentInput = allYoutubeTitles.map((t) => ({
                title: t.title,
                thumbnailText: t.thumbnailText || "",
                score: { total: t.score?.total || 0 },
              }));

              const tournament = await runPairwiseTournament(
                tournamentInput,
                episodeDescription,
                PAIRWISE_TOP_N,
                (completed, total) => {
                  if (completed % 5 === 0 || completed === total) {
                    sendSSE(controller, encoder, {
                      type: "status",
                      message: `Pairwise tournament: ${completed}/${total} comparisons complete...`,
                    });
                  }
                },
                routeAbortCtrl.signal
              );

              if (tournament) {
                pairwiseSucceeded = true;
                sendSSE(controller, encoder, {
                  type: "status",
                  message: `${tournament.consistentPairs}/${(PAIRWISE_TOP_N * (PAIRWISE_TOP_N - 1)) / 2} unique pairs had consistent results`,
                });

                const rankedTitles = tournament.titles.map((t, idx) => ({
                  ...t,
                  pairwiseWins: tournament.wins.get(idx) || 0,
                }));

                rankedTitles.sort((a, b) => {
                  if (b.pairwiseWins !== a.pairwiseWins) {
                    return b.pairwiseWins - a.pairwiseWins;
                  }
                  return (b.score?.total || 0) - (a.score?.total || 0);
                });

                const rankedWithPairwiseRank = rankedTitles.map((t, idx) => ({
                  ...t,
                  pairwiseRank: idx + 1,
                }));

                allYoutubeTitles = allYoutubeTitles.map((t) => {
                  const ranked = rankedWithPairwiseRank.find((rt) => normalizeTitle(rt.title) === normalizeTitle(t.title));
                  if (ranked) {
                    logger.log({
                      pass: "2.5",
                      event: "pairwise_result",
                      title: ranked.title,
                      model: (t as any).sourceModel,
                      pairwiseRank: ranked.pairwiseRank,
                      pairwiseWins: ranked.pairwiseWins,
                      scoreTotal: (t as any).score?.total,
                    });
                    return { ...t, pairwiseWins: ranked.pairwiseWins, pairwiseRank: ranked.pairwiseRank };
                  }
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const { pairwiseRank, pairwiseWins, ...rest } = t;
                  return rest as YouTubeTitleItem;
                });
              }
            } catch (error) {
              console.error("[Pairwise] Tournament failed:", error);
              sendSSE(controller, encoder, {
                type: "status",
                message: "Pairwise tournament failed, proceeding with score-based selection",
              });
            }
          }

          // === Selection ===
          if (!pairwiseSucceeded) {
            allYoutubeTitles = allYoutubeTitles.map((t) => {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { pairwiseRank, pairwiseWins, ...rest } = t;
              return rest as Omit<YouTubeTitleItem, "pairwiseRank" | "pairwiseWins">;
            });
          }
          const hasPairwiseData = pairwiseSucceeded;
          allYoutubeTitles.sort((a: any, b: any) => {
            if (hasPairwiseData) {
              if (a.pairwiseRank !== undefined && b.pairwiseRank !== undefined) {
                return a.pairwiseRank - b.pairwiseRank;
              }
              if (a.pairwiseRank !== undefined) return -1;
              if (b.pairwiseRank !== undefined) return 1;
            }
            return (b.score?.total || 0) - (a.score?.total || 0);
          });
          allSpotifyTitles.sort(
            (a, b) => (b.score?.total || 0) - (a.score?.total || 0)
          );

          // Use archetype diversity selection for YouTube titles
          const hasArchetypeData = allYoutubeTitles.some((t: any) => t.archetype);
          const selectedYoutube = hasArchetypeData
            ? selectWithArchetypeDiversity(allYoutubeTitles)
            : allYoutubeTitles.slice(0, TARGET_YOUTUBE_COUNT);
          const selectedSpotify = allSpotifyTitles.slice(0, TARGET_SPOTIFY_COUNT);

          // Log selected titles
          for (const t of selectedYoutube) {
            logger.log({
              pass: "2.5",
              event: "title_selected",
              title: t.title,
              model: t.sourceModel,
              platform: "youtube",
              archetype: t.archetype,
              scoreTotal: t.score?.total,
              pairwiseRank: t.pairwiseRank,
              pairwiseWins: t.pairwiseWins,
            });
          }
          for (const t of selectedSpotify) {
            logger.log({
              pass: "2.5",
              event: "title_selected",
              title: t.title,
              model: t.sourceModel,
              platform: "spotify",
              scoreTotal: t.score?.total,
            });
          }

          const selectedYTSet = new Set(selectedYoutube.map(t => normalizeTitle(t.title)));
          const eliminatedYT = allYoutubeTitles.filter(t => !selectedYTSet.has(normalizeTitle(t.title)));
          const eliminatedSP = allSpotifyTitles.slice(TARGET_SPOTIFY_COUNT);
          for (const t of eliminatedYT) {
            const safeScore = t.score?.total ?? 'N/A';
            const pairwiseInfo = t.pairwiseRank !== undefined ? `, pairwise rank #${t.pairwiseRank} (${t.pairwiseWins}W)` : '';
            allRejectedTitles.push({
              title: t.title,
              rejectionReason: `Eliminated in competitive selection (scored ${safeScore}/100, from ${t.sourceModel}${pairwiseInfo})`,
            });
            logger.log({
              pass: "2.5",
              event: "title_rejected",
              title: t.title,
              model: t.sourceModel,
              platform: "youtube",
              scoreTotal: t.score?.total,
              reason: `Eliminated in selection (scored ${safeScore}/100${pairwiseInfo})`,
            });
          }
          for (const t of eliminatedSP) {
            const safeScore = t.score?.total ?? 'N/A';
            allRejectedTitles.push({
              title: t.title,
              rejectionReason: `Eliminated in competitive selection (scored ${safeScore}/100, from ${t.sourceModel})`,
            });
            logger.log({
              pass: "2.5",
              event: "title_rejected",
              title: t.title,
              model: t.sourceModel,
              platform: "spotify",
              scoreTotal: t.score?.total,
              reason: `Eliminated in selection (scored ${safeScore}/100)`,
            });
          }

          sendSSE(controller, encoder, {
            type: "status",
            message: `Selected top ${selectedYoutube.length} YouTube + ${selectedSpotify.length} Spotify titles.`,
          });

          // Update model stats with selection info
          for (const t of selectedYoutube) {
            const stats = modelStats.get(t.sourceModel || "");
            if (stats) {
              stats.selected++;
              stats.totalScore += t.score?.total || 0;
              stats.totalThumbScore += t.thumbnailTextScore?.total || 0;
            }
          }
          for (const t of selectedSpotify) {
            const stats = modelStats.get(t.sourceModel || "");
            if (stats) {
              stats.selected++;
              stats.totalScore += t.score?.total || 0;
            }
          }

          // Build merged output
          const generated: any = {
            youtubeTitles: selectedYoutube,
            spotifyTitles: selectedSpotify,
            rejectedTitles: allRejectedTitles,
            tierClassification: scored?.tierClassification,
          };
          logger.endPass("2.5");

          // === PASS 3: Iterative rewrite loop ===
          logger.startPass("3");
          for (
            let attempt = 1;
            attempt <= MAX_REWRITE_ATTEMPTS;
            attempt++
          ) {
            const weakYTIndices = (generated.youtubeTitles || [])
              .map((t: any, i: number) =>
                (t.score?.total || 0) < REWRITE_THRESHOLD ||
                  (t.thumbnailTextScore?.total || 0) < REWRITE_THRESHOLD
                  ? i
                  : -1
              )
              .filter((i: number) => i !== -1);
            const weakSPIndices = (generated.spotifyTitles || [])
              .map((t: any, i: number) =>
                (t.score?.total || 0) < REWRITE_THRESHOLD ? i : -1
              )
              .filter((i: number) => i !== -1);
            const weakYT = weakYTIndices.map(
              (i: number) => generated.youtubeTitles[i]
            );
            const weakSP = weakSPIndices.map(
              (i: number) => generated.spotifyTitles[i]
            );

            if (weakYT.length === 0 && weakSP.length === 0) {
              sendSSE(controller, encoder, {
                type: "status",
                message: `All titles + thumbnail text passed threshold (${REWRITE_THRESHOLD}+).`,
              });
              break;
            }

            sendSSE(controller, encoder, {
              type: "status",
              message: `Rewriting ${weakYT.length + weakSP.length} weak title(s) — attempt ${attempt}/${MAX_REWRITE_ATTEMPTS}...`,
            });

            const feedback: Array<{
              title: string;
              message: string;
              platform: string;
            }> = [];
            for (const t of weakYT) {
              const lowDims =
                Object.entries(t.score || {})
                  .filter(
                    ([k, v]) =>
                      k !== "total" && typeof v === "number" && (v as number) < 5
                  )
                  .map(([k]) => k)
                  .join(", ") || "overall quality";
              const thumbFeedback = (t.thumbnailTextScore?.total || 0) < REWRITE_THRESHOLD
                ? ` Thumbnail text "${t.thumbnailText}" scored ${t.thumbnailTextScore?.total}/100 — also needs rewriting.`
                : "";
              feedback.push({
                title: t.title,
                message: `YouTube: "${t.title}" scored ${t.score?.total}/100. Problems: low ${lowDims}.${thumbFeedback}`,
                platform: "YouTube",
              });
            }
            for (const t of weakSP) {
              const lowDims =
                Object.entries(t.score || {})
                  .filter(
                    ([k, v]) =>
                      k !== "total" && typeof v === "number" && (v as number) < 5
                  )
                  .map(([k]) => k)
                  .join(", ") || "overall quality";
              feedback.push({
                title: t.title,
                message: `Spotify: "${t.title}" scored ${t.score?.total}/100. Problems: low ${lowDims}`,
                platform: "Spotify",
              });
            }

            const rewriteInput = `## REWRITE REQUEST (Attempt ${attempt}/${MAX_REWRITE_ATTEMPTS})

The following titles were scored by an independent evaluator and FAILED (below ${REWRITE_THRESHOLD}/100):

${feedback.map((f) => `${f.platform}: "${f.title}" — ${f.message}`).join("\n")}

## ORIGINAL RESEARCH
${researchStr}

## ORIGINAL TRANSCRIPT HIGHLIGHTS
${transcript.slice(0, 5000)}

## EPISODE DESCRIPTION
${episodeDescription}

REWRITE these titles from scratch. Do NOT tweak the failed titles — start fresh with new angles.
The failed titles tell you what DOESN'T work. Find a completely different approach.

${weakYT.length > 0 ? `Generate ${weakYT.length} NEW YouTube ${weakYT.length === 1 ? "title" : "titles"} (different angles from the failed ones).` : ""}
${weakSP.length > 0 ? `Generate ${weakSP.length} NEW Spotify ${weakSP.length === 1 ? "title" : "titles"} (different angles from the failed ones).` : ""}

Return the same JSON structure. Score honestly against the calibration benchmarks.`;

            let rewritten: any = null;
            const rewriteModelName = geminiGenerationModel ? "Gemini 3.1 Pro (rewrite)" : "Gemini 3.0 Flash (rewrite)";
            try {
              const rewriteGenResult = await generateWithModel(
                { model: geminiGenerationModel ?? generationModel, name: rewriteModelName },
                systemPrompt,
                rewriteInput
              );
              if (rewriteGenResult) {
                rewritten = rewriteGenResult;
              } else {
                console.warn(`[PASS 3] Rewrite attempt ${attempt} failed`);
                continue;
              }
            } catch (err) {
              const reason = err instanceof Error ? err.message : String(err);
              console.warn(`[PASS 3] Rewrite attempt ${attempt} failed with error:`, reason);
              sendSSE(controller, encoder, {
                type: "status",
                message: `[WARNING] ${rewriteModelName} failed rewrite attempt ${attempt}: ${reason}`
              });
              continue;
            }

            // Guardrails on rewritten titles
            const rewriteSlopCheck = checkAiSlop(
              getAllTitleTexts(rewritten.youtubeTitles || []).concat(
                getAllTitleTexts(rewritten.spotifyTitles || [])
              )
            );
            const rewriteTierCheck = checkTierCompliance(
              guestName,
              guestTier,
              guestCredential,
              (rewritten.youtubeTitles || []).map((t: any) => t.title)
            );

            if (!rewriteSlopCheck.passed || !rewriteTierCheck.passed) {
              console.warn(
                `[PASS 3] Rewrite attempt ${attempt} has guardrail violations:`,
                [...rewriteSlopCheck.violations, ...rewriteTierCheck.violations]
              );
            }

            // Re-score rewritten titles with panel
            let rewriteScored: any = null;
            try {
              const rewriteTitlesToScore = {
                youtubeTitles: (rewritten.youtubeTitles || []).map((t: any) => ({
                  title: t.title,
                  thumbnailText: t.thumbnailText,
                  score: t.score,
                  thumbnailTextScore: t.thumbnailTextScore,
                  scrollStopReason: t.scrollStopReason,
                  emotionalTrigger: t.emotionalTrigger,
                  platformNotes: t.platformNotes,
                })),
                spotifyTitles: (rewritten.spotifyTitles || []).map((t: any) => ({
                  title: t.title,
                  score: t.score,
                  scrollStopReason: t.scrollStopReason,
                  emotionalTrigger: t.emotionalTrigger,
                  platformNotes: t.platformNotes,
                })),
              };
              rewriteScored = await scoreWithPanel(rewriteTitlesToScore, researchStr, scoringPrompt, routeAbortCtrl.signal);
            } catch {
              console.warn(`[PASS 3] Re-scoring attempt ${attempt} failed`);
            }

            // Merge rewritten titles
            if (weakYTIndices.length > 0 && rewritten.youtubeTitles) {
              const ytReplacementCount = Math.min(
                rewritten.youtubeTitles.length,
                weakYTIndices.length
              );
              for (let ri = 0; ri < ytReplacementCount; ri++) {
                const originalIndex = weakYTIndices[ri];
                const rewrittenItem = rewritten.youtubeTitles[ri];
                const newScore = rewriteScored?.youtubeTitles?.[ri]?.score ||
                  rewrittenItem.score ||
                  generated.youtubeTitles[originalIndex].score;
                generated.youtubeTitles[originalIndex] = {
                  ...rewrittenItem,
                  score: newScore,
                  thumbnailTextScore:
                    rewriteScored?.youtubeTitles?.[ri]?.thumbnailTextScore ||
                    rewrittenItem.thumbnailTextScore ||
                    generated.youtubeTitles[originalIndex].thumbnailTextScore,
                  sourceModel: rewriteModelName,
                  rewritten: true,
                };
                logger.log({
                  pass: "3",
                  event: "title_rewritten",
                  title: rewrittenItem.title,
                  model: rewriteModelName,
                  platform: "youtube",
                  scoreTotal: newScore?.total,
                  scoreDimensions: newScore,
                  rewriteAttempt: attempt,
                  reason: `Replaced weak title "${feedback[ri]?.title || "unknown"}"`,
                });
              }
            }
            if (weakSPIndices.length > 0 && rewritten.spotifyTitles) {
              const spReplacementCount = Math.min(
                rewritten.spotifyTitles.length,
                weakSPIndices.length
              );
              for (let ri = 0; ri < spReplacementCount; ri++) {
                const originalIndex = weakSPIndices[ri];
                const rewrittenItem = rewritten.spotifyTitles[ri];
                const newSpScore = rewriteScored?.spotifyTitles?.[ri]?.score ||
                  rewrittenItem.score ||
                  generated.spotifyTitles[originalIndex].score;
                generated.spotifyTitles[originalIndex] = {
                  ...rewrittenItem,
                  score: newSpScore,
                  sourceModel: rewriteModelName,
                  rewritten: true,
                };
                logger.log({
                  pass: "3",
                  event: "title_rewritten",
                  title: rewrittenItem.title,
                  model: rewriteModelName,
                  platform: "spotify",
                  scoreTotal: newSpScore?.total,
                  rewriteAttempt: attempt,
                });
              }
            }
            generated.rejectedTitles = [
              ...(generated.rejectedTitles || []),
              ...feedback.map((f) => ({
                title: f.title,
                rejectionReason: f.message,
              })),
              ...(rewritten.rejectedTitles || []),
            ];
          }
          logger.endPass("3");

          // === PASS 4: Description & Chapter Generation ===
          sendSSE(controller, encoder, {
            type: "status",
            message: "Generating descriptions and chapter titles...",
          });

          try {
            const descriptionPattern = youtubeAnalysisAny?.descriptionPattern
              ? typeof youtubeAnalysisAny.descriptionPattern === "string"
                ? youtubeAnalysisAny.descriptionPattern
                : JSON.stringify(youtubeAnalysisAny.descriptionPattern, null, 2)
              : null;

            const descSystemPrompt = buildDescriptionChapterSystemPrompt();
            const descUserPrompt = buildDescriptionChapterUserPrompt({
              research: researchStr,
              descriptionPattern,
              winningTitles: {
                youtube: (generated.youtubeTitles || []).map((t: any) => t.title),
                spotify: (generated.spotifyTitles || []).map((t: any) => t.title),
              },
              transcript,
              episodeDescription,
            });

            const descAbort = new AbortController();
            const descTimeout = setTimeout(() => descAbort.abort(), 120_000);
            const descResult = await generateObject({
              model: descriptionModel,
              schema: descriptionChapterOutputSchema,
              system: descSystemPrompt,
              prompt: descUserPrompt,
              abortSignal: descAbort.signal,
            });
            clearTimeout(descTimeout);

            const descOutput = descResult.object;

            // Run chapter guardrails
            const chapterCheck = checkChapterTitles(
              descOutput.chapters.map((c) => c.title)
            );
            if (!chapterCheck.passed) {
              console.warn("[PASS 4] Chapter guardrail violations:", chapterCheck.violations);
            }

            generated.youtubeDescription = descOutput.youtubeDescription;
            generated.spotifyDescription = descOutput.spotifyDescription;
            generated.chapters = descOutput.chapters;
            generated.descriptionSEOKeywords = descOutput.descriptionSEOKeywords;
            generated.descriptionScore = descOutput.descriptionScore;
            generated.chapterScore = descOutput.chapterScore;

            sendSSE(controller, encoder, {
              type: "status",
              message: `Descriptions and ${descOutput.chapters.length} chapter titles generated.`,
            });
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            console.warn("[PASS 4] Description generation failed:", reason);
            sendSSE(controller, encoder, {
              type: "status",
              message: `[WARNING] Description generation failed: ${reason}. Titles are still available.`,
            });
          }

          // === DB: Save results ===
          const runDurationMs = Date.now() - runStartTime;
          const totalCandidates = allYoutubeTitles.length + allSpotifyTitles.length;

          // Build pipeline summary for DB + SSE
          const pipelineSummary = logger.buildSummary();

          if (runId) {
            // Insert selected titles sequentially to capture IDs for human feedback
            const ytIds = await insertTitleResults(runId, generated.youtubeTitles || [], "youtube", true);
            const spIds = await insertTitleResults(runId, generated.spotifyTitles || [], "spotify", true);

            // Attach IDs to titles so the client can use them for rating
            ytIds.forEach((id, i) => { if (generated.youtubeTitles?.[i]) generated.youtubeTitles[i].titleResultId = id; });
            spIds.forEach((id, i) => { if (generated.spotifyTitles?.[i]) generated.spotifyTitles[i].titleResultId = id; });

            // Fire-and-forget for eliminated/rejected inserts + other DB ops
            await Promise.all([
              updateGenerationRun(runId, {
                status: "complete",
                totalCandidatesGenerated: totalCandidates,
                runDurationMs,
              }),
              insertTitleResults(
                runId,
                eliminatedYT.map((t) => ({ ...t, rejectionReason: `Eliminated (scored ${t.score?.total ?? "N/A"}/100)` })),
                "youtube",
                false
              ),
              insertTitleResults(
                runId,
                eliminatedSP.map((t) => ({ ...t, rejectionReason: `Eliminated (scored ${t.score?.total ?? "N/A"}/100)` })),
                "spotify",
                false
              ),
              insertModelPerformance(runId, modelStats),
              insertPipelineLogs(runId, logger.getEntries()),
              updateRunSummary(runId, pipelineSummary),
            ]);
          }

          // Save final output to Supabase so clients can poll for it if the SSE stream is cut
          if (runId && supabase) {
            try {
              await supabase.from("generation_runs").update({ output_json: generated }).eq("id", runId);
            } catch (err) {
              console.warn("[DB] Error saving output_json:", err);
            }
          }

          // Emit pipeline summary SSE
          sendSSE(controller, encoder, { type: "pipeline_summary", summary: pipelineSummary });

          // Emit warning if rewrite rate is high
          if (pipelineSummary.rewriteRate > 50) {
            sendSSE(controller, encoder, {
              type: "pipeline_warning",
              message: `High rewrite rate: ${pipelineSummary.rewriteRate.toFixed(1)}% of titles needed rewrites. Consider calibrating the generation prompt.`,
            });
          }

          sendSSE(controller, encoder, { type: "complete", data: generated });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Generation failed";
          if (runId) {
            await updateGenerationRun(runId, { status: "error" });
          }
          sendSSE(controller, encoder, { type: "error", message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
