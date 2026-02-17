import { generateObject, generateText } from "ai";
import { generationModel, scoringModel } from "@/lib/ai";
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
import { checkAiSlop, checkThumbnailText } from "@/lib/guardrails/ai-slop";
import { checkTierCompliance } from "@/lib/guardrails/tier-compliance";

export const maxDuration = 300;

const REWRITE_THRESHOLD = 65;
const MAX_REWRITE_ATTEMPTS = 3;

function sendSSE(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  data: unknown
) {
  controller.enqueue(encoder.encode("data: " + JSON.stringify(data) + "\n\n"));
}

function getAllTitleTexts(generated: any): string[] {
  const titles: string[] = [];
  for (const t of generated.youtubeTitles || []) titles.push(t.title);
  for (const t of generated.spotifyTitles || []) titles.push(t.title);
  return titles;
}

function extractFirstJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\" ) {
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

          // === PASS 1: Generate titles + thumbnail text ===
          sendSSE(controller, encoder, {
            type: "status",
            message: "Generating titles + thumbnail text...",
          });

          const systemPrompt = buildGenerationSystemPrompt();
          const userPrompt = buildGenerationUserPrompt({
            research: researchStr,
            youtubeAnalysis: ytStr,
            transcript,
            episodeDescription,
          });

          let generated: any;
          try {
            const result = await generateObject({
              model: generationModel,
              schema: titleGenerationOutputSchema,
              system: systemPrompt,
              prompt: userPrompt,
            });
            generated = result.object;
          } catch (err) {
            // Fallback: try generateText and parse JSON manually
            console.warn("[PASS 1] generateObject failed, falling back to generateText:", err);
            const fallback = await generateText({
              model: generationModel,
              system: systemPrompt,
              prompt: userPrompt,
            });
            const jsonStr = extractFirstJson(fallback.text);
            if (!jsonStr) {
              sendSSE(controller, encoder, {
                type: "error",
                message: "Failed to generate titles",
              });
              controller.close();
              return;
            }
            generated = JSON.parse(jsonStr);
          }

          // Run guardrails on initial titles + thumbnail text
          const slopCheck = checkAiSlop(getAllTitleTexts(generated));
          const tierCheck = checkTierCompliance(
            guestName,
            guestTier,
            guestCredential,
            (generated.youtubeTitles || []).map((t: any) => t.title)
          );
          const thumbCheck = checkThumbnailText(
            (generated.youtubeTitles || []).map((t: any) => ({
              thumbnailText: t.thumbnailText || "",
              title: t.title,
            }))
          );

          if (!slopCheck.passed || !tierCheck.passed || !thumbCheck.passed) {
            const allViolations = [
              ...slopCheck.violations,
              ...tierCheck.violations,
              ...thumbCheck.violations,
            ];
            sendSSE(controller, encoder, {
              type: "status",
              message: `Guardrail violations detected (${allViolations.length}), re-generating titles...`,
            });

            const violationFeedback = `## GUARDRAIL VIOLATIONS — FIX THESE

The following violations were detected in your output. You MUST fix all of them:

${allViolations.map((v) => `- ${v}`).join("\n")}

Re-generate ALL titles, ensuring NONE of these violations remain.`;

            try {
              const fixResult = await generateObject({
                model: generationModel,
                schema: titleGenerationOutputSchema,
                system: systemPrompt,
                prompt: userPrompt + "\n\n" + violationFeedback,
              });
              generated = fixResult.object;
            } catch {
              // Keep original if fix attempt fails
              console.warn("[PASS 1] Guardrail re-generation failed, keeping originals");
            }
          }

          // === PASS 2: Score titles independently with Minimax M2.5 ===
          sendSSE(controller, encoder, {
            type: "status",
            message:
              "Scoring titles independently with cross-model evaluator...",
          });

          const scoringPrompt = buildScoringSystemPrompt();
          const scoringInput = buildScoringUserPrompt({
            generatedTitles: JSON.stringify(generated, null, 2),
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
            console.warn("[PASS 2] Cross-model scoring failed, falling back to generation model:", err);
            // Fallback to generation model for scoring
            try {
              const scoreResult = await generateObject({
                model: generationModel,
                schema: scoringOutputSchema,
                system: scoringPrompt,
                prompt: scoringInput,
              });
              scored = scoreResult.object;
            } catch (err2) {
              console.warn("[PASS 2] Scoring fallback also failed:", err2);
              sendSSE(controller, encoder, {
                type: "status",
                message:
                  "Scoring failed — continuing with self-assessed scores",
              });
            }
          }

          // Merge scores onto generated titles (including thumbnail text scores for YouTube)
          if (scored) {
            if (generated.youtubeTitles && scored.youtubeTitles) {
              generated.youtubeTitles = generated.youtubeTitles.map(
                (t: any, i: number) => ({
                  ...t,
                  score: scored.youtubeTitles?.[i]?.score || t.score,
                  scrollStopReason:
                    scored.youtubeTitles?.[i]?.scrollStopReason ||
                    t.scrollStopReason,
                  platformNotes:
                    scored.youtubeTitles?.[i]?.platformNotes || t.platformNotes,
                  thumbnailTextScore:
                    scored.youtubeTitles?.[i]?.thumbnailTextScore ||
                    t.thumbnailTextScore,
                })
              );
            }
            if (generated.spotifyTitles && scored.spotifyTitles) {
              generated.spotifyTitles = generated.spotifyTitles.map(
                (t: any, i: number) => ({
                  ...t,
                  score: scored.spotifyTitles?.[i]?.score || t.score,
                  scrollStopReason:
                    scored.spotifyTitles?.[i]?.scrollStopReason ||
                    t.scrollStopReason,
                  platformNotes:
                    scored.spotifyTitles?.[i]?.platformNotes || t.platformNotes,
                })
              );
            }
            generated.tierClassification = scored.tierClassification;
          }

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
              getAllTitleTexts(rewritten)
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
              // Continue to scoring anyway — we'll try again next iteration
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
              console.warn(`[PASS 3] Re-scoring attempt ${attempt} failed with cross-model, trying generation model`);
              try {
                const scoreResult = await generateObject({
                  model: generationModel,
                  schema: scoringOutputSchema,
                  system: scoringPrompt,
                  prompt: buildScoringUserPrompt({
                    generatedTitles: JSON.stringify(rewritten, null, 2),
                    research: researchStr,
                  }),
                });
                rewriteScored = scoreResult.object;
              } catch {
                console.warn(`[PASS 3] Re-scoring fallback also failed`);
              }
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
