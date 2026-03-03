import { generateObject, generateText, stepCountIs } from "ai";
import { z } from "zod";
import { researchModel, openaiProvider } from "@/lib/ai";
import { buildResearchSystemPrompt, buildResearchUserPrompt } from "@/lib/prompts/research-system";
import { researchOutputSchema } from "@/lib/schemas/research-output";

export const maxDuration = 300;

function sampleTranscript(text: string, totalChars = 8000): string {
  if (text.length <= totalChars) return text;
  const chunkSize = Math.floor(totalChars / 3);
  const start = text.slice(0, chunkSize);
  const mid = text.slice(
    Math.floor(text.length / 2) - Math.floor(chunkSize / 2),
    Math.floor(text.length / 2) + Math.ceil(chunkSize / 2)
  );
  const end = text.slice(text.length - chunkSize);
  return `${start}\n\n---\n\n${mid}\n\n---\n\n${end}`;
}

function sendSSE(controller: ReadableStreamDefaultController, encoder: TextEncoder, data: unknown) {
  controller.enqueue(encoder.encode("data: " + JSON.stringify(data) + "\n\n"));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { guestName, podcastName, episodeDescription, transcript, coHosts, targetAudience } = body;

    if (!podcastName || !episodeDescription || !transcript) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Skip research for episodes with no meaningful guest
    const noGuestPatterns = [
      "no guest",
      "there is no guest",
      "no external guest",
      "hosts only",
      "host-only",
      "solo episode",
    ];
    const hasNoGuest = !guestName || guestName.trim() === "" || noGuestPatterns.some((pattern) =>
      guestName.toLowerCase().includes(pattern)
    );

    if (hasNoGuest) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          sendSSE(controller, encoder, {
            type: "status",
            message: "No external guest - extracting hot takes from transcript...",
          });

          const hotTakeExtractionSchema = z.object({
            hotTakes: z.array(z.object({
              quote: z.string(),
              topic: z.string(),
              whyClickable: z.string(),
              type: z.enum(["contrarian", "shocking_stat", "bold_prediction", "debunking", "provocative_opinion"]),
            })).min(3).max(5),
          });

          let extractedHotTakes: Array<{ quote: string; topic: string; whyClickable: string; type: string }> = [];
          try {
            const hotTakeResult = await generateObject({
              model: researchModel,
              schema: hotTakeExtractionSchema,
              system: `You extract the most clickable hot takes from podcast transcripts.
A hot take is a moment that would make someone STOP scrolling — a contrarian claim, shocking stat, bold prediction, debunking, or provocative opinion.
CRITICAL: Extract 3–5 hot takes that span DIFFERENT topic areas or segments of the episode.
Do NOT extract multiple hot takes about the same overarching theme — if two candidates are on the same subject, keep only the stronger one and find a hot take from a different part of the transcript.
Each hot take must be anchored in a specific quote or claim, not a vague summary.`,
              prompt: `Extract the top hot takes from this podcast transcript:\n\n${sampleTranscript(transcript)}`,
            });
            extractedHotTakes = hotTakeResult.object.hotTakes;
            sendSSE(controller, encoder, {
              type: "status",
              message: `Extracted ${extractedHotTakes.length} hot takes from transcript.`,
            });
          } catch (err) {
            console.warn("[Research] Hot take extraction failed, using fallback:", err);
            extractedHotTakes = [
              {
                quote: "This episode has no external guest — the hosts drive the entire conversation",
                topic: "Format overview",
                whyClickable: "Rare format signals a host-led deep dive",
                type: "provocative_opinion" as const,
              },
              {
                quote: "The hosts share a direct, specific take on the main topic of this episode",
                topic: "Core argument",
                whyClickable: "Direct host opinion is more trustworthy than an expert interview",
                type: "contrarian" as const,
              },
              {
                quote: "A concrete actionable insight is revealed in this episode",
                topic: "Actionable takeaway",
                whyClickable: "Specific actionable content outperforms general advice",
                type: "provocative_opinion" as const,
              },
            ];
          }

          const noGuestResearch = {
            guest: {
              name: "N/A - Solo Episode",
              bio: "This episode has no external guest. Content is driven by hosts' discussion and transcript topics.",
              credentials: [],
              socialPresence: "N/A - no external guest",
              controversies: "None",
              authorityLabel: "N/A",
              guestTier: {
                tier: 3,
                reasoning: "No external guest - episode is topic-driven",
                youtubeRecommendation: "TOPIC-ONLY, drop guest from YouTube title",
              },
            },
            brand: {
              podcastName: podcastName,
              titleFormat: "Topic-driven episodes",
              voiceDescription: "Based on transcript content",
              audienceProfile: targetAudience || "General audience interested in discussed topics",
            },
            transcript: {
              hotTakes: extractedHotTakes,
              topClaims: [],
              specificNumbers: [],
              emotionalMoments: [],
              clickableMoment: "",
              topicSegments: [],
              trendingKeywords: [],
            },
            trendingTopics: [],
            searchQueriesUsed: [],
          };

          let validatedNoGuest;
          try {
            validatedNoGuest = researchOutputSchema.parse(noGuestResearch);
          } catch (validationError) {
            console.error("noGuestResearch validation failed:", validationError);
            sendSSE(controller, encoder, {
              type: "error",
              message: "Internal error: default research output failed schema validation",
            });
            controller.close();
            return;
          }

          sendSSE(controller, encoder, { type: "complete", data: validatedNoGuest });
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const systemPrompt = buildResearchSystemPrompt();
    const userPrompt = buildResearchUserPrompt({
      guestName: guestName || "N/A - Solo Episode",
      podcastName,
      episodeDescription,
      transcript,
      coHosts,
      targetAudience,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          sendSSE(controller, encoder, {
            type: "status",
            message: `Researching ${guestName}...`,
          });

          // Use generateText with web search tool — research needs web_search
          // which is OpenAI-specific, so we use generateText and parse the JSON
          const result = await generateText({
            model: researchModel,
            system: systemPrompt,
            prompt: userPrompt,
            tools: {
              web_search_preview: openaiProvider.tools.webSearchPreview({}),
            },
            stopWhen: stepCountIs(5),
          });

          sendSSE(controller, encoder, {
            type: "status",
            message: "Parsing research results...",
          });

          // Extract JSON from the response text using balanced-brace scanning
          const candidates: string[] = [];
          for (let si = 0; si < result.text.length; si++) {
            if (result.text[si] !== "{") continue;
            let depth = 0;
            let inString = false;
            for (let j = si; j < result.text.length; j++) {
              const ch = result.text[j];
              if (inString) {
                if (ch === "\\") {
                  j++; // skip escaped character
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
                  if (depth === 0) {
                    candidates.push(result.text.slice(si, j + 1));
                    si = j; // advance outer loop past this match
                    break;
                  }
                }
              }
            }
          }
          let parsed: any = null;
          for (const candidate of candidates) {
            try {
              parsed = JSON.parse(candidate);
              break;
            } catch {
              continue;
            }
          }
          if (!parsed) {
            sendSSE(controller, encoder, {
              type: "error",
              message: "Failed to parse research output",
            });
            controller.close();
            return;
          }

          // Validate with Zod schema to catch malformed data (e.g., tier as string)
          const validated = researchOutputSchema.safeParse(parsed);
          if (validated.success) {
            sendSSE(controller, encoder, { type: "complete", data: validated.data });
          } else {
            console.warn(
              "[Research] Zod validation failed, attempting fix:",
              validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)
            );
            // Fix common issues: tier as string instead of number
            if (parsed.guest?.guestTier?.tier && typeof parsed.guest.guestTier.tier === "string") {
              const tierMatch = String(parsed.guest.guestTier.tier).match(/\d/);
              parsed.guest.guestTier.tier = tierMatch ? parseInt(tierMatch[0]) : 3;
            }
            const revalidated = researchOutputSchema.safeParse(parsed);
            if (revalidated.success) {
              sendSSE(controller, encoder, { type: "complete", data: revalidated.data });
            } else {
              console.error(
                "[Research] Re-validation failed after fixes:",
                revalidated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)
              );
              sendSSE(controller, encoder, {
                type: "error",
                message: "Research output failed schema validation",
              });
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Research failed";
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
    const message = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
