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
import {
  buildDescriptionAnalysisSystemPrompt,
  buildDescriptionAnalysisUserPrompt,
} from "@/lib/prompts/description-analysis-system";
import {
  buildDescriptionChapterSystemPrompt,
  buildDescriptionChapterUserPrompt,
} from "@/lib/prompts/description-chapter-system";
import { titleGenerationOutputSchema } from "@/lib/schemas/title-generation-output";
import { scoringOutputSchema } from "@/lib/schemas/scoring-output";
import { descriptionChapterOutputSchema } from "@/lib/schemas/description-chapter-output";
import { descriptionAnalysisOutputSchema } from "@/lib/schemas/description-analysis-output";
import { checkAiSlop } from "@/lib/guardrails/ai-slop";
import { checkTierCompliance } from "@/lib/guardrails/tier-compliance";
import { checkChapterFormat } from "@/lib/guardrails/chapter-format";

export const maxDuration = 300;

const REWRITE_THRESHOLD = 65;
const MAX_REWRITE_ATTEMPTS = 3;
const DESC_REWRITE_THRESHOLD = 70;

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

          // === PASS 0: Analyze description patterns from prior videos ===
          let descriptionPatternStr: string | null = null;

          const ytData =
            typeof youtubeAnalysis === "string" ? null : youtubeAnalysis;
          const priorDescriptions: string[] = (ytData?.recentVideos || [])
            .map((v: any) => v.description)
            .filter((d: string) => d && d.length > 50);

          if (priorDescriptions.length >= 3) {
            sendSSE(controller, encoder, {
              type: "status",
              message: `Analyzing ${priorDescriptions.length} prior video descriptions for patterns...`,
            });

            try {
              const descAnalysis = await generateObject({
                model: generationModel,
                schema: descriptionAnalysisOutputSchema,
                system: buildDescriptionAnalysisSystemPrompt(),
                prompt: buildDescriptionAnalysisUserPrompt(priorDescriptions),
              });

              descriptionPatternStr = JSON.stringify(
                descAnalysis.object,
                null,
                2
              );
              sendSSE(controller, encoder, {
                type: "status",
                message: "Description patterns extracted successfully.",
              });
            } catch (err) {
              console.warn("[PASS 0] Description analysis failed:", err);
              sendSSE(controller, encoder, {
                type: "status",
                message:
                  "Description analysis failed — using best practices.",
              });
            }
          } else {
            sendSSE(controller, encoder, {
              type: "status",
              message:
                "No prior descriptions available — using best practices.",
            });
          }

          // === PASS 1: Generate titles ===
          sendSSE(controller, encoder, {
            type: "status",
            message: "Generating title options...",
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

          // Run guardrails on initial titles
          const slopCheck = checkAiSlop(getAllTitleTexts(generated));
          const tierCheck = checkTierCompliance(
            guestName,
            guestTier,
            guestCredential,
            (generated.youtubeTitles || []).map((t: any) => t.title)
          );

          if (!slopCheck.passed || !tierCheck.passed) {
            const allViolations = [
              ...slopCheck.violations,
              ...tierCheck.violations,
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

          // Merge scores onto generated titles
          if (scored) {
            for (const section of [
              "youtubeTitles",
              "spotifyTitles",
            ] as const) {
              if (generated[section] && scored[section]) {
                generated[section] = generated[section].map(
                  (t: any, i: number) => ({
                    ...t,
                    score: scored[section]?.[i]?.score || t.score,
                    scrollStopReason:
                      scored[section]?.[i]?.scrollStopReason ||
                      t.scrollStopReason,
                    platformNotes:
                      scored[section]?.[i]?.platformNotes || t.platformNotes,
                  })
                );
              }
            }
            generated.tierClassification = scored.tierClassification;
          }

          // === PASS 3: Iterative rewrite loop (up to 3 attempts) ===
          for (
            let attempt = 1;
            attempt <= MAX_REWRITE_ATTEMPTS;
            attempt++
          ) {
            const weakYTIndices = (generated.youtubeTitles || [])
              .map((t: any, i: number) =>
                (t.score?.total || 0) < REWRITE_THRESHOLD ? i : -1
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
                message: `All titles passed threshold (${REWRITE_THRESHOLD}+).`,
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
              feedback.push({
                title: t.title,
                message: `YouTube: "${t.title}" scored ${t.score?.total}/100. Problems: low ${lowDims}`,
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

          // === PASS 4: Dedicated description + chapter generation ===
          sendSSE(controller, encoder, {
            type: "status",
            message:
              "Generating descriptions and chapters with dedicated agent...",
          });

          const winningTitles = {
            youtube: (generated.youtubeTitles || []).map(
              (t: any) => t.title
            ),
            spotify: (generated.spotifyTitles || []).map(
              (t: any) => t.title
            ),
          };

          let descChapterResult: any = null;
          try {
            const descResult = await generateObject({
              model: generationModel,
              schema: descriptionChapterOutputSchema,
              system: buildDescriptionChapterSystemPrompt(),
              prompt: buildDescriptionChapterUserPrompt({
                winningTitles,
                research: researchStr,
                transcript,
                episodeDescription,
                descriptionPattern: descriptionPatternStr,
              }),
            });
            descChapterResult = descResult.object;
          } catch (err) {
            console.warn("[PASS 4] generateObject for descriptions failed, falling back:", err);
            try {
              const fallback = await generateText({
                model: generationModel,
                system: buildDescriptionChapterSystemPrompt(),
                prompt: buildDescriptionChapterUserPrompt({
                  winningTitles,
                  research: researchStr,
                  transcript,
                  episodeDescription,
                  descriptionPattern: descriptionPatternStr,
                }),
              });
              const descJsonStr = extractFirstJson(fallback.text);
              if (descJsonStr) {
                descChapterResult = JSON.parse(descJsonStr);
              }
            } catch {
              console.warn("[PASS 4] Description fallback also failed");
            }
          }

          if (descChapterResult) {
            // Run chapter format guardrail
            const chapterCheck = checkChapterFormat(
              descChapterResult.chapters || []
            );
            if (!chapterCheck.passed) {
              sendSSE(controller, encoder, {
                type: "status",
                message: `Chapter format violations (${chapterCheck.violations.length}), re-generating...`,
              });

              try {
                const fixResult = await generateObject({
                  model: generationModel,
                  schema: descriptionChapterOutputSchema,
                  system: buildDescriptionChapterSystemPrompt(),
                  prompt:
                    buildDescriptionChapterUserPrompt({
                      winningTitles,
                      research: researchStr,
                      transcript,
                      episodeDescription,
                      descriptionPattern: descriptionPatternStr,
                    }) +
                    "\n\n## CHAPTER FORMAT VIOLATIONS — FIX THESE\n\n" +
                    chapterCheck.violations
                      .map((v) => `- ${v}`)
                      .join("\n") +
                    "\n\nFix ALL violations above. Every chapter title must be 25-50 chars with no em dashes, arrows, or parentheticals.",
                });
                descChapterResult = fixResult.object;
              } catch {
                console.warn("[PASS 4] Chapter fix re-generation failed");
              }
            }

            generated.youtubeDescription =
              descChapterResult.youtubeDescription ||
              generated.youtubeDescription;
            generated.spotifyDescription =
              descChapterResult.spotifyDescription ||
              generated.spotifyDescription;
            generated.chapters =
              descChapterResult.chapters || generated.chapters;
            generated.descriptionScore =
              descChapterResult.descriptionScore || null;
            generated.chapterScore =
              descChapterResult.chapterScore || null;

            // === PASS 5: Rewrite weak descriptions/chapters if scores are low ===
            const descScore =
              descChapterResult.descriptionScore?.total || 0;
            const chapScore =
              descChapterResult.chapterScore?.total || 0;

            if (
              descScore < DESC_REWRITE_THRESHOLD ||
              chapScore < DESC_REWRITE_THRESHOLD
            ) {
              sendSSE(controller, encoder, {
                type: "status",
                message: `Rewriting ${descScore < DESC_REWRITE_THRESHOLD ? "description" : ""}${descScore < DESC_REWRITE_THRESHOLD && chapScore < DESC_REWRITE_THRESHOLD ? " and " : ""}${chapScore < DESC_REWRITE_THRESHOLD ? "chapters" : ""} (scored ${descScore}/100, ${chapScore}/100)...`,
              });

              const rewriteDescPrompt = `## REWRITE REQUEST

The descriptions/chapters scored poorly and need rewriting.

Description score: ${descScore}/100
${descScore < DESC_REWRITE_THRESHOLD ? `Problems: ${JSON.stringify(descChapterResult.descriptionScore)}` : "Description OK."}

Chapter score: ${chapScore}/100
${chapScore < DESC_REWRITE_THRESHOLD ? `Problems: ${JSON.stringify(descChapterResult.chapterScore)}` : "Chapters OK."}

Current YouTube description:
${descChapterResult.youtubeDescription || "None"}

Current chapters:
${(descChapterResult.chapters || []).map((c: any) => `${c.timestamp} ${c.title}`).join("\n")}

## WINNING TITLES
YouTube: ${winningTitles.youtube.join(" | ")}
Spotify: ${winningTitles.spotify.join(" | ")}

## DESCRIPTION PATTERN FROM PRIOR VIDEOS
${descriptionPatternStr || "No prior video analysis available."}

## RESEARCH
${researchStr}

## TRANSCRIPT
${transcript.slice(0, 8000)}

## EPISODE DESCRIPTION
${episodeDescription}

REWRITE from scratch. Focus on:
${descScore < DESC_REWRITE_THRESHOLD ? "- YouTube description: hook paragraph must sound like a Wired article, NOT 'In this episode...'" : ""}
${chapScore < DESC_REWRITE_THRESHOLD ? "- Chapters: every title needs an active verb, specific detail, NO em dashes/arrows/parenthetical fillers" : ""}

Return the same JSON structure with updated scores.`;

              try {
                const rewriteDescResult = await generateObject({
                  model: generationModel,
                  schema: descriptionChapterOutputSchema,
                  system: buildDescriptionChapterSystemPrompt(),
                  prompt: rewriteDescPrompt,
                });
                const rewrittenDesc = rewriteDescResult.object;

                if (rewrittenDesc.youtubeDescription) {
                  generated.youtubeDescription =
                    rewrittenDesc.youtubeDescription;
                }
                if (rewrittenDesc.spotifyDescription) {
                  generated.spotifyDescription =
                    rewrittenDesc.spotifyDescription;
                }
                if (
                  chapScore < DESC_REWRITE_THRESHOLD &&
                  rewrittenDesc.chapters
                ) {
                  generated.chapters = rewrittenDesc.chapters;
                }
                if (rewrittenDesc.descriptionScore) {
                  generated.descriptionScore =
                    rewrittenDesc.descriptionScore;
                }
                if (
                  chapScore < DESC_REWRITE_THRESHOLD &&
                  rewrittenDesc.chapterScore
                ) {
                  generated.chapterScore = rewrittenDesc.chapterScore;
                }
              } catch {
                console.warn("[PASS 5] Description rewrite failed");
              }
            }
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
