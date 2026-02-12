import { openai, GENERATION_MODEL } from "@/lib/openai";
import {
  buildGenerationSystemPrompt,
  buildGenerationUserPrompt,
} from "@/lib/prompts/generation-system";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { research, youtubeAnalysis, transcript, episodeDescription } = body;

    if (!research || !transcript || !episodeDescription) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const systemPrompt = buildGenerationSystemPrompt();
    const userPrompt = buildGenerationUserPrompt({
      research: typeof research === "string" ? research : JSON.stringify(research, null, 2),
      youtubeAnalysis: youtubeAnalysis
        ? typeof youtubeAnalysis === "string"
          ? youtubeAnalysis
          : JSON.stringify(youtubeAnalysis, null, 2)
        : "No YouTube channel data available. Generate titles based on research and transcript only.",
      transcript,
      episodeDescription,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "status", message: "Analyzing title angles..." })}\n\n`
            )
          );

          const response = await openai.responses.create({
            model: GENERATION_MODEL,
            instructions: systemPrompt,
            input: userPrompt,
            stream: true,
          });

          let fullText = "";
          let statusSent = false;

          for await (const event of response) {
            if (event.type === "response.output_text.delta") {
              fullText += event.delta;

              // Send progress updates based on content length
              if (!statusSent && fullText.length > 100) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "status", message: "Drafting and scoring titles..." })}\n\n`
                  )
                );
                statusSent = true;
              }
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
                `data: ${JSON.stringify({ type: "error", message: "Failed to parse generation output" })}\n\n`
              )
            );
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Generation failed";
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
