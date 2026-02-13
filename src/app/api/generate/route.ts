import { openai, GENERATION_MODEL } from "@/lib/openai";
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

export const maxDuration = 300; // 5 passes now

function sendSSE(controller: ReadableStreamDefaultController, encoder: TextEncoder, data: unknown) {
  controller.enqueue(encoder.encode("data: " + JSON.stringify(data) + "\n\n"));
}

async function callModel(instructions: string, input: string, tools?: unknown[]) {
  const opts: Record<string, unknown> = {
    model: GENERATION_MODEL,
    instructions,
    input,
  };
  if (tools) opts.tools = tools;

  const response = await openai.responses.create(opts as any);
  const text = response.output_text || "";

  console.log("[callModel] Raw response length:", text.length);
  console.log("[callModel] Raw response preview:", text.slice(0, 200));

  // Try to extract JSON from markdown code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      console.log("[callModel] Successfully parsed JSON from code block");
      return parsed;
    } catch (parseErr) {
      console.warn("[callModel] Failed to parse code block content, falling back to regex");
    }
  }

  // Iterative JSON.parse extraction — handles braces inside JSON strings correctly
  const startIdx = text.indexOf('{');
  if (startIdx === -1) {
    console.warn("[callModel] No '{' found in response");
    console.warn("[callModel] Full response:", text);
    return null;
  }

  for (let endIdx = startIdx + 1; endIdx < text.length; endIdx++) {
    if (text[endIdx] !== '}') continue;
    try {
      const parsed = JSON.parse(text.slice(startIdx, endIdx + 1));
      console.log("[callModel] Successfully parsed JSON via iterative extraction");
      return parsed;
    } catch {
      // Not a complete JSON object yet — keep scanning
    }
  }

  // Final safety-net: try parsing whatever we found
  console.warn("[callModel] Iterative extraction failed, attempting raw fallback");
  try {
    const parsed = JSON.parse(text.slice(startIdx));
    console.log("[callModel] Fallback JSON.parse succeeded");
    return parsed;
  } catch (parseErr) {
    console.error("[callModel] JSON parse error:", parseErr);
    console.error("[callModel] Full response:", text.slice(0, 500));
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { research, youtubeAnalysis, transcript, episodeDescription } = body;

    if (!research || !transcript || !episodeDescription) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const researchStr = typeof research === "string" ? research : JSON.stringify(research, null, 2);
          const ytStr = youtubeAnalysis
            ? typeof youtubeAnalysis === "string" ? youtubeAnalysis : JSON.stringify(youtubeAnalysis, null, 2)
            : "No YouTube channel data available.";

          // === PASS 0: Analyze description patterns from prior videos ===
          let descriptionPatternStr: string | null = null;

          const ytData = typeof youtubeAnalysis === "string" ? null : youtubeAnalysis;
          const priorDescriptions: string[] = (ytData?.recentVideos || [])
            .map((v: any) => v.description)
            .filter((d: string) => d && d.length > 50);

          if (priorDescriptions.length >= 3) {
            sendSSE(controller, encoder, {
              type: "status",
              message: `Analyzing ${priorDescriptions.length} prior video descriptions for patterns...`,
            });

            const descAnalysis = await callModel(
              buildDescriptionAnalysisSystemPrompt(),
              buildDescriptionAnalysisUserPrompt(priorDescriptions)
            );

            if (descAnalysis) {
              descriptionPatternStr = JSON.stringify(descAnalysis, null, 2);
              sendSSE(controller, encoder, {
                type: "status",
                message: "Description patterns extracted successfully.",
              });
            }
          } else {
            sendSSE(controller, encoder, {
              type: "status",
              message: "No prior descriptions available — using best practices.",
            });
          }

          // === PASS 1: Generate titles ===
          sendSSE(controller, encoder, { type: "status", message: "Generating title options..." });

          const systemPrompt = buildGenerationSystemPrompt();
          const userPrompt = buildGenerationUserPrompt({
            research: researchStr,
            youtubeAnalysis: ytStr,
            transcript,
            episodeDescription,
          });

          const generated = await callModel(systemPrompt, userPrompt, [{ type: "web_search_preview" }]);
          if (!generated) {
            sendSSE(controller, encoder, { type: "error", message: "Failed to parse generation output" });
            controller.close();
            return;
          }

          // === PASS 2: Score titles independently ===
          sendSSE(controller, encoder, { type: "status", message: "Scoring titles independently..." });

          const scoringPrompt = buildScoringSystemPrompt();
          const scoringInput = buildScoringUserPrompt({
            generatedTitles: JSON.stringify(generated, null, 2),
            research: researchStr,
          });

          const scored = await callModel(scoringPrompt, scoringInput);

          if (!scored) {
            sendSSE(controller, encoder, { type: "status", message: "Scoring failed - continuing with generated titles without independent scoring" });
          }

          // Merge scores onto generated titles
          if (scored) {
            for (const section of ["youtubeTitles", "spotifyTitles"] as const) {
              if (generated[section] && scored[section]) {
                generated[section] = generated[section].map((t: any, i: number) => ({
                  ...t,
                  score: scored[section]?.[i]?.score || t.score,
                  scrollStopReason: scored[section]?.[i]?.scrollStopReason || t.scrollStopReason,
                  platformNotes: scored[section]?.[i]?.platformNotes || t.platformNotes,
                }));
              }
            }
            generated.tierClassification = scored.tierClassification;
          }

          // === PASS 3: Rewrite any titles scoring below 75 ===
          const weakYTIndices = (generated.youtubeTitles || [])
            .map((t: any, i: number) => (t.score?.total || 0) < 75 ? i : -1)
            .filter((i: number) => i !== -1);
          const weakSPIndices = (generated.spotifyTitles || [])
            .map((t: any, i: number) => (t.score?.total || 0) < 75 ? i : -1)
            .filter((i: number) => i !== -1);
          const weakYT = weakYTIndices.map((i: number) => generated.youtubeTitles[i]);
          const weakSP = weakSPIndices.map((i: number) => generated.spotifyTitles[i]);

          if (weakYT.length > 0 || weakSP.length > 0) {
            sendSSE(controller, encoder, {
              type: "status",
              message: `Rewriting ${weakYT.length + weakSP.length} weak title(s) with scoring feedback...`,
            });

            const feedback: Array<{ title: string; message: string; platform: string }> = [];
            for (const t of weakYT) {
              const message = `YouTube: "${t.title}" scored ${t.score?.total}/100. Problems: low ${Object.entries(t.score || {})
                  .filter(([k, v]) => k !== "total" && typeof v === "number" && v < 5)
                  .map(([k]) => k).join(", ") || "overall quality"
                }`;
              feedback.push({ title: t.title, message, platform: "YouTube" });
            }
            for (const t of weakSP) {
              const message = `Spotify: "${t.title}" scored ${t.score?.total}/100. Problems: low ${Object.entries(t.score || {})
                  .filter(([k, v]) => k !== "total" && typeof v === "number" && v < 5)
                  .map(([k]) => k).join(", ") || "overall quality"
                }`;
              feedback.push({ title: t.title, message, platform: "Spotify" });
            }

            const rewriteInput = `## REWRITE REQUEST

The following titles were scored by an independent evaluator and FAILED (below 75/100):

${feedback.join("\n")}

## ORIGINAL RESEARCH
${researchStr}

## ORIGINAL TRANSCRIPT HIGHLIGHTS
${transcript.slice(0, 5000)}

## EPISODE DESCRIPTION
${episodeDescription}

REWRITE these titles from scratch. Do NOT tweak the failed titles — start fresh with new angles.
The failed titles tell you what DOESN'T work. Find a completely different approach.

${weakYT.length > 0 ? "Generate 2 NEW YouTube titles (different angles from the failed ones)." : ""}
${weakSP.length > 0 ? "Generate 2 NEW Spotify titles (different angles from the failed ones)." : ""}

Return the same JSON structure. All titles MUST score 75+.`;

            const rewritten = await callModel(systemPrompt, rewriteInput, [{ type: "web_search_preview" }]);

            if (rewritten) {
              const rewriteScored = await callModel(scoringPrompt, buildScoringUserPrompt({
                generatedTitles: JSON.stringify(rewritten, null, 2),
                research: researchStr,
              }));

              if (weakYTIndices.length > 0 && rewritten.youtubeTitles) {
                generated.youtubeTitles = generated.youtubeTitles.map((original: any, i: number) => {
                  const weakIndex = weakYTIndices.indexOf(i);
                  if (weakIndex === -1) {
                    return original;
                  }
                  const rewrittenItem = rewritten.youtubeTitles[weakIndex];
                  if (!rewrittenItem) {
                    console.warn(`[Rewrite] Missing rewritten item at index ${weakIndex} for YouTube`);
                    return original;
                  }
                  return {
                    ...rewrittenItem,
                    score: rewriteScored?.youtubeTitles?.[weakIndex]?.score || rewrittenItem.score || original.score,
                    rewritten: true,
                  };
                });
              }
              if (weakSPIndices.length > 0 && rewritten.spotifyTitles) {
                generated.spotifyTitles = generated.spotifyTitles.map((original: any, i: number) => {
                  const weakIndex = weakSPIndices.indexOf(i);
                  if (weakIndex === -1) {
                    return original;
                  }
                  const rewrittenItem = rewritten.spotifyTitles[weakIndex];
                  if (!rewrittenItem) {
                    console.warn(`[Rewrite] Missing rewritten item at index ${weakIndex} for Spotify`);
                    return original;
                  }
                  return {
                    ...rewrittenItem,
                    score: rewriteScored?.spotifyTitles?.[weakIndex]?.score || rewrittenItem.score || original.score,
                    rewritten: true,
                  };
                });
              }
              generated.rejectedTitles = [
                ...(generated.rejectedTitles || []),
                ...feedback.map(f => ({ title: f.title, rejectionReason: f.message })),
                ...(rewritten.rejectedTitles || []),
              ];
            }
          }

          // === PASS 4: Dedicated description + chapter generation ===
          sendSSE(controller, encoder, {
            type: "status",
            message: "Generating descriptions and chapters with dedicated agent...",
          });

          const winningTitles = {
            youtube: (generated.youtubeTitles || []).map((t: any) => t.title),
            spotify: (generated.spotifyTitles || []).map((t: any) => t.title),
          };

          const descChapterResult = await callModel(
            buildDescriptionChapterSystemPrompt(),
            buildDescriptionChapterUserPrompt({
              winningTitles,
              research: researchStr,
              transcript,
              episodeDescription,
              descriptionPattern: descriptionPatternStr,
            })
          );

          // Merge description + chapter results onto the generated output
          if (descChapterResult) {
            generated.youtubeDescription = descChapterResult.youtubeDescription || generated.youtubeDescription;
            generated.spotifyDescription = descChapterResult.spotifyDescription || generated.spotifyDescription;
            generated.chapters = descChapterResult.chapters || generated.chapters;
            generated.descriptionScore = descChapterResult.descriptionScore || null;
            generated.chapterScore = descChapterResult.chapterScore || null;

            // === PASS 5: Rewrite weak descriptions/chapters if scores are low ===
            const descScore = descChapterResult.descriptionScore?.total || 0;
            const chapScore = descChapterResult.chapterScore?.total || 0;

            if (descScore < 70 || chapScore < 70) {
              sendSSE(controller, encoder, {
                type: "status",
                message: `Rewriting ${descScore < 70 ? "description" : ""}${descScore < 70 && chapScore < 70 ? " and " : ""}${chapScore < 70 ? "chapters" : ""} (scored ${descScore}/100, ${chapScore}/100)...`,
              });

              const rewriteDescInput = `## REWRITE REQUEST

The descriptions/chapters scored poorly and need rewriting.

Description score: ${descScore}/100
${descScore < 70 ? `Problems: ${JSON.stringify(descChapterResult.descriptionScore)}` : "Description OK."}

Chapter score: ${chapScore}/100  
${chapScore < 70 ? `Problems: ${JSON.stringify(descChapterResult.chapterScore)}` : "Chapters OK."}

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
${descScore < 70 ? "- YouTube description: hook paragraph must sound like a Wired article, NOT 'In this episode...'" : ""}
${chapScore < 70 ? "- Chapters: every title needs an active verb, specific detail, NO em dashes/arrows/parenthetical fillers" : ""}

Return the same JSON structure.`;

              const rewrittenDesc = await callModel(
                buildDescriptionChapterSystemPrompt(),
                rewriteDescInput
              );

              if (rewrittenDesc) {
                // Only update each platform if the AI provided a rewritten version
                // This prevents overwriting a good YouTube description when only Spotify was weak (or vice versa)
                if (rewrittenDesc.youtubeDescription) {
                  generated.youtubeDescription = rewrittenDesc.youtubeDescription;
                }
                if (rewrittenDesc.spotifyDescription) {
                  generated.spotifyDescription = rewrittenDesc.spotifyDescription;
                }
                if (chapScore < 70 && rewrittenDesc.chapters) {
                  generated.chapters = rewrittenDesc.chapters;
                }
                generated.descriptionScore = rewrittenDesc.descriptionScore || generated.descriptionScore;
                generated.chapterScore = rewrittenDesc.chapterScore || generated.chapterScore;
              }
            }
          }

          sendSSE(controller, encoder, { type: "complete", data: generated });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Generation failed";
          sendSSE(controller, encoder, { type: "error", message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
