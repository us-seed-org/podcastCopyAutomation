import { generateText, stepCountIs } from "ai";
import { researchModel } from "@/lib/ai";
import { buildResearchSystemPrompt, buildResearchUserPrompt } from "@/lib/prompts/research-system";
import { researchOutputSchema } from "@/lib/schemas/research-output";

export const maxDuration = 60;

function sendSSE(controller: ReadableStreamDefaultController, encoder: TextEncoder, data: unknown) {
  controller.enqueue(encoder.encode("data: " + JSON.stringify(data) + "\n\n"));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { guestName, podcastName, episodeDescription, transcript, coHosts, targetAudience } = body;

    if (!guestName || !podcastName || !episodeDescription || !transcript) {
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
    const hasNoGuest = noGuestPatterns.some((pattern) =>
      guestName.toLowerCase().includes(pattern)
    );

    if (hasNoGuest) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          sendSSE(controller, encoder, {
            type: "status",
            message: "No external guest - using topic-based generation...",
          });

          const noGuestResearch = {
            guest: {
              name: guestName,
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

          sendSSE(controller, encoder, { type: "complete", data: noGuestResearch });
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
      guestName,
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
              web_search_preview: {
                type: "provider-defined",
                id: "openai.web_search_preview",
              } as any,
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
