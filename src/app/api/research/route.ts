import { openai, RESEARCH_MODEL } from "@/lib/openai";
import { buildResearchSystemPrompt, buildResearchUserPrompt } from "@/lib/prompts/research-system";

export const maxDuration = 60;

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
      "solo episode"
    ];
    const hasNoGuest = noGuestPatterns.some(pattern =>
      guestName.toLowerCase().includes(pattern)
    );

    if (hasNoGuest) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "status", message: "No external guest - using topic-based generation..." })}\n\n`)
          );

          // Return minimal research object for no-guest episodes
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
                youtubeRecommendation: "TOPIC-ONLY, drop guest from YouTube title"
              }
            },
            brand: {
              podcastName: podcastName,
              titleFormat: "Topic-driven episodes",
              voiceDescription: "Based on transcript content",
              audienceProfile: targetAudience || "General audience interested in discussed topics"
            },
            transcript: {
              topClaims: [],
              specificNumbers: [],
              emotionalMoments: [],
              clickableMoment: "",
              topicSegments: [],
              trendingKeywords: []
            },
            trendingTopics: [],
            searchQueriesUsed: []
          };

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "complete", data: noGuestResearch })}\n\n`)
          );
          controller.close();
        }
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
          // Send initial status
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "status", message: "Starting research..." })}\n\n`)
          );

          const response = await openai.responses.create({
            model: RESEARCH_MODEL,
            instructions: systemPrompt,
            input: userPrompt,
            tools: [{ type: "web_search_preview" }],
            stream: true,
          });

          let fullText = "";

          for await (const event of response) {
            if (event.type === "response.output_text.delta") {
              fullText += event.delta;
            }

            if (event.type === "response.created") {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "status", message: `Searching for ${guestName}...` })}\n\n`
                )
              );
            }

            if (
              event.type === "response.output_item.added" &&
              "type" in event.item &&
              event.item.type === "web_search_call"
            ) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "status", message: "Searching the web..." })}\n\n`
                )
              );
            }
          }

          // Parse the JSON from the response
          const jsonMatch = fullText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "complete", data: parsed })}\n\n`)
            );
          } else {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "error", message: "Failed to parse research output" })}\n\n`
              )
            );
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Research failed";
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", message })}\n\n`)
          );
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
