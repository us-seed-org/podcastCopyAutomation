import { generateObject, generateText } from "ai";
import { generationModel, minimaxGenerationModel, kimiModel, scoringModel, pairwiseJudgeModel } from "@/lib/ai";
import {
  buildGenerationSystemPrompt,
  buildGenerationUserPrompt,
} from "@/lib/prompts/generation-system";
import {
  buildScoringSystemPrompt,
  buildScoringUserPrompt,
} from "@/lib/prompts/scoring-system";
import { titleGenerationOutputSchema } from "@/lib/schemas/title-generation-output";
import { scoringOutputSchema } from "@/lib/schemas/scoring-output";
import { scoreBreakdownSchema, thumbnailTextScoreSchema, rejectedTitleSchema } from "@/lib/schemas/generation-output";
import { checkAiSlop, checkThumbnailText } from "@/lib/guardrails/ai-slop";
import { checkTierCompliance } from "@/lib/guardrails/tier-compliance";
import { runPairwiseTournament } from "@/lib/pairwise-tournament";

export const maxDuration = 300;

interface ScoreBreakdown {
  curiosityGap: number;
  authoritySignal: number;
  emotionalTrigger: number;
  trendingKeyword: number;
  specificity: number;
  characterCount: number;
  wordBalance: number;
  frontLoadHook: number;
  thumbnailComplement: number;
  total: number;
}

interface ThumbnailTextScore {
  curiosityGap: number;
  emotionalPunch: number;
  titleComplement: number;
  brevityAndClarity: number;
  total: number;
}

interface BaseTitleItem {
  title: string;
  score?: ScoreBreakdown;
  scrollStopReason?: string;
  emotionalTrigger?: string;
  platformNotes?: string;
  sourceModel?: string;
}

interface YouTubeTitleItem extends BaseTitleItem {
  thumbnailText?: string;
  thumbnailTextScore?: ThumbnailTextScore;
  pairwiseWins?: number;
  pairwiseRank?: number;
}

interface YoutubeTitle {
  title: string;
  thumbnailText?: string;
  thumbnailTextScore?: ThumbnailTextScore;
  score?: ScoreBreakdown;
  scrollStopReason?: string;
  emotionalTrigger?: string;
  platformNotes?: string;
  sourceModel?: string;
  pairwiseWins?: number;
  pairwiseRank?: number;
}

interface SpotifyTitleItem extends BaseTitleItem {
  // Spotify titles don't have thumbnail fields
}

interface ScoredTitle {
  title: string;
  rejectionReason: string;
}

interface GenerationResult {
  youtubeTitles: YouTubeTitleItem[];
  spotifyTitles: SpotifyTitleItem[];
  rejectedTitles: ScoredTitle[];
}

const REWRITE_THRESHOLD = 70;
const MAX_REWRITE_ATTEMPTS = 3;
const TARGET_YOUTUBE_COUNT = 4;
const TARGET_SPOTIFY_COUNT = 2;
const REWRITE_MODEL_NAME = "GPT-5.2 (rewrite)";
const PAIRWISE_TOP_N = 6;

function sendSSE(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  data: unknown
) {
  controller.enqueue(encoder.encode("data: " + JSON.stringify(data) + "\n\n"));
}

function getAllTitleTexts(titles: { title: string }[]): string[] {
  return titles.map((t) => t.title);
}

function extractFirstJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") {
        i++; // skip escaped character
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
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

interface GenerationModelConfig {
  model: Parameters<typeof generateObject>[0]["model"];
  name: string;
}

async function generateWithModel(
  config: GenerationModelConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<GenerationResult | null> {
  try {
    const result = await generateObject({
      model: config.model,
      schema: titleGenerationOutputSchema,
      system: systemPrompt,
      prompt: userPrompt,
    });
    return result.object as GenerationResult;
  } catch (err) {
    console.warn(`[PASS 1] generateObject failed for ${config.name}, falling back to generateText:`, err);
    try {
      const fallback = await generateText({
        model: config.model,
        system: systemPrompt,
        prompt: userPrompt,
      });
      const jsonStr = extractFirstJson(fallback.text);
      if (!jsonStr) return null;
      const parsed = JSON.parse(jsonStr);
      const validated = titleGenerationOutputSchema.safeParse(parsed);
      if (!validated.success) {
        console.warn("Fallback validation failed:", validated.error);
        return null;
      }
      return validated.data;
    } catch (err2) {
      console.warn(`[PASS 1] generateText also failed for ${config.name}:`, err2);
      return null;
    }
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { research, youtubeAnalysis, transcript, episodeDescription } = body;

    if (!research || !transcript || !episodeDescription) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
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

          // === PASS 1: Multi-model parallel generation ===
          const systemPrompt = buildGenerationSystemPrompt();
          const userPrompt = buildGenerationUserPrompt({
            research: researchStr,
            youtubeAnalysis: ytStr,
            transcript,
            episodeDescription,
          });

          const models: GenerationModelConfig[] = [
            { model: generationModel, name: "GPT-5.2" },
            { model: generationModel, name: "GPT-5.2 (B)" },
            { model: minimaxGenerationModel, name: "Minimax M2.5" },
            ...(kimiModel ? [{ model: kimiModel, name: "Kimi K2.5" }] : []),
          ];

          sendSSE(controller, encoder, {
            type: "status",
            message: `Generating titles with ${models.length} models in parallel (${models.map((m) => m.name).join(", ")})...`,
          });

          const results = await Promise.allSettled(
            models.map((m) => generateWithModel(m, systemPrompt, userPrompt))
          );

          // Merge successful results
          let allYoutubeTitles: YoutubeTitle[] = [];
          let allSpotifyTitles: any[] = [];
          let allRejectedTitles: any[] = [];
          const succeededModels: string[] = [];

          results.forEach((result, idx) => {
            const modelName = models[idx].name;
            if (result.status === "fulfilled" && result.value) {
              succeededModels.push(modelName);
              const gen = result.value;
              // Tag each title with its source model
              for (const t of gen.youtubeTitles || []) {
                allYoutubeTitles.push({ ...t, sourceModel: modelName });
              }
              for (const t of gen.spotifyTitles || []) {
                allSpotifyTitles.push({ ...t, sourceModel: modelName });
              }
              allRejectedTitles.push(...(gen.rejectedTitles || []));
            } else {
              const reason = result.status === "rejected" ? result.reason : "returned null";
              console.warn(`[PASS 1] ${modelName} failed:`, reason);
            }
          });

          if (allYoutubeTitles.length === 0) {
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

          // Run guardrails on merged set — filter out violating titles instead of re-generating
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

          // If guardrail violations exist, log them but keep titles (scoring will penalize them)
          const allViolations = [
            ...ytSlopCheck.violations,
            ...ytTierCheck.violations,
            ...ytThumbCheck.violations,
          ];
          if (allViolations.length > 0) {
            sendSSE(controller, encoder, {
              type: "status",
              message: `${allViolations.length} guardrail violation(s) detected — scoring will penalize affected titles.`,
            });
          }

          // Also check Spotify titles
          const spSlopCheck = checkAiSlop(getAllTitleTexts(allSpotifyTitles));
          if (!spSlopCheck.passed) {
            console.warn("[PASS 1] Spotify guardrail violations:", spSlopCheck.violations);
          }

          // === PASS 2: Score all titles with Minimax M2.5 ===
          sendSSE(controller, encoder, {
            type: "status",
            message: `Scoring ${allYoutubeTitles.length} YouTube + ${allSpotifyTitles.length} Spotify titles with independent evaluator...`,
          });

          const scoringPrompt = buildScoringSystemPrompt();
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
            spotifyTitles: allSpotifyTitles.map((t: any) => ({
              title: t.title,
              score: t.score,
              scrollStopReason: t.scrollStopReason,
              emotionalTrigger: t.emotionalTrigger,
              platformNotes: t.platformNotes,
            })),
          };

          const scoringInput = buildScoringUserPrompt({
            generatedTitles: JSON.stringify(titlesToScore, null, 2),
            research: researchStr,
          });

          let scored: any = null;
          try {
            const scoreResult = await generateObject({
              model: scoringModel,
              schema: scoringOutputSchema,
              system: scoringPrompt,
              prompt: scoringInput,
            });
            scored = scoreResult.object;
          } catch (err) {
            console.warn("[PASS 2] Scoring failed:", err);
            sendSSE(controller, encoder, {
              type: "status",
              message: "Scoring failed — continuing with self-assessed scores",
            });
          }

          // Merge scores back onto titles using lookup map by normalized title
          if (scored) {
            const normalizeTitle = (title: string) => title.toLowerCase().trim();
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
                  return {
                    ...t,
                    score: scoredItem.score ?? t.score,
                    scrollStopReason: scoredItem.scrollStopReason ?? t.scrollStopReason,
                    platformNotes: scoredItem.platformNotes ?? t.platformNotes,
                    thumbnailTextScore: scoredItem.thumbnailTextScore ?? t.thumbnailTextScore,
                  };
                }
                return t;
              });
            }
            if (spScoreLookup.size > 0) {
              allSpotifyTitles = allSpotifyTitles.map((t: any) => {
                const key = normalizeTitle(t.title);
                const scoredItem = spScoreLookup.get(key);
                if (scoredItem) {
                  return {
                    ...t,
                    score: scoredItem.score ?? t.score,
                    scrollStopReason: scoredItem.scrollStopReason ?? t.scrollStopReason,
                    platformNotes: scoredItem.platformNotes ?? t.platformNotes,
                  };
                }
                return t;
              });
            }
          }

          // === PASS 2.5: Pairwise Tournament (Gemini) ===
          const normalizeTitle = (title: string) => title.toLowerCase().trim();
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
                PAIRWISE_TOP_N
              );

              if (tournament) {
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
                  return ranked
                    ? { ...t, pairwiseWins: ranked.pairwiseWins, pairwiseRank: ranked.pairwiseRank }
                    : t;
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

          // === Selection: Keep top titles by pairwise rank (or score if no tournament) ===
          const hasPairwiseData = allYoutubeTitles.some((t: any) => t.pairwiseRank !== undefined);
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
            (a: any, b: any) => (b.score?.total || 0) - (a.score?.total || 0)
          );

          const selectedYoutube = allYoutubeTitles.slice(0, TARGET_YOUTUBE_COUNT);
          const selectedSpotify = allSpotifyTitles.slice(0, TARGET_SPOTIFY_COUNT);

          // Add eliminated titles to rejected list
          const eliminatedYT = allYoutubeTitles.slice(TARGET_YOUTUBE_COUNT);
          const eliminatedSP = allSpotifyTitles.slice(TARGET_SPOTIFY_COUNT);
          for (const t of eliminatedYT) {
            const safeScore = t.score?.total ?? 'N/A';
            const pairwiseInfo = t.pairwiseRank !== undefined ? `, pairwise rank #${t.pairwiseRank} (${t.pairwiseWins}W)` : '';
            allRejectedTitles.push({
              title: t.title,
              rejectionReason: `Eliminated in competitive selection (scored ${safeScore}/100, from ${t.sourceModel}${pairwiseInfo})`,
            });
          }
          for (const t of eliminatedSP) {
            const safeScore = t.score?.total ?? 'N/A';
            allRejectedTitles.push({
              title: t.title,
              rejectionReason: `Eliminated in competitive selection (scored ${safeScore}/100, from ${t.sourceModel})`,
            });
          }

          sendSSE(controller, encoder, {
            type: "status",
            message: `Selected top ${selectedYoutube.length} YouTube + ${selectedSpotify.length} Spotify titles.`,
          });

          // Build merged output
          const generated: any = {
            youtubeTitles: selectedYoutube,
            spotifyTitles: selectedSpotify,
            rejectedTitles: allRejectedTitles,
            tierClassification: scored?.tierClassification,
          };

          // === PASS 3: Iterative rewrite loop (up to 3 attempts) ===
          for (
            let attempt = 1;
            attempt <= MAX_REWRITE_ATTEMPTS;
            attempt++
          ) {
            // A YouTube title is weak if either title score OR thumbnail text score is below threshold
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
            try {
              const rewriteResult = await generateObject({
                model: generationModel,
                schema: titleGenerationOutputSchema,
                system: systemPrompt,
                prompt: rewriteInput,
              });
              rewritten = rewriteResult.object;
            } catch {
              console.warn(`[PASS 3] Rewrite attempt ${attempt} failed`);
              continue;
            }

            // Run guardrails on rewritten titles
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

            // Re-score rewritten titles
            let rewriteScored: any = null;
            try {
              const scoreResult = await generateObject({
                model: scoringModel,
                schema: scoringOutputSchema,
                system: scoringPrompt,
                prompt: buildScoringUserPrompt({
                  generatedTitles: JSON.stringify(rewritten, null, 2),
                  research: researchStr,
                }),
              });
              rewriteScored = scoreResult.object;
            } catch {
              console.warn(`[PASS 3] Re-scoring attempt ${attempt} failed`);
            }

            // Merge rewritten titles into generated, replacing weak ones
            if (weakYTIndices.length > 0 && rewritten.youtubeTitles) {
              const ytReplacementCount = Math.min(
                rewritten.youtubeTitles.length,
                weakYTIndices.length
              );
              for (let ri = 0; ri < ytReplacementCount; ri++) {
                const originalIndex = weakYTIndices[ri];
                const rewrittenItem = rewritten.youtubeTitles[ri];
                generated.youtubeTitles[originalIndex] = {
                  ...rewrittenItem,
                  score:
                    rewriteScored?.youtubeTitles?.[ri]?.score ||
                    rewrittenItem.score ||
                    generated.youtubeTitles[originalIndex].score,
                  thumbnailTextScore:
                    rewriteScored?.youtubeTitles?.[ri]?.thumbnailTextScore ||
                    rewrittenItem.thumbnailTextScore ||
                    generated.youtubeTitles[originalIndex].thumbnailTextScore,
                  sourceModel: REWRITE_MODEL_NAME,
                  rewritten: true,
                };
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
                generated.spotifyTitles[originalIndex] = {
                  ...rewrittenItem,
                  score:
                    rewriteScored?.spotifyTitles?.[ri]?.score ||
                    rewrittenItem.score ||
                    generated.spotifyTitles[originalIndex].score,
                  sourceModel: REWRITE_MODEL_NAME,
                  rewritten: true,
                };
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

          sendSSE(controller, encoder, { type: "complete", data: generated });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Generation failed";
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
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
