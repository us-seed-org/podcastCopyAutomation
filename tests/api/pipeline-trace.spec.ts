import { test, expect, APIRequestContext } from "@playwright/test";

test.describe("Pipeline Trace SSE Events", () => {
    test.setTimeout(300000); // 5 minutes because LLM generations take time
    test.skip(!process.env.ENABLE_API_TESTS, "Skipped: set ENABLE_API_TESTS=true to run");

    const SAMPLE_TRANSCRIPT = `
    Host: Today we're talking with Jane Doe about why most startups fail in the first year.
    Jane: The number one reason is that founders don't talk to customers. They build in a vacuum.
    Host: That's a bold claim. What's the data behind it?
    Jane: We studied 500 startups. 73% that failed had fewer than 10 customer conversations before launch.
    Host: Wow. So what should founders do instead?
    Jane: Talk to 50 customers before writing a single line of code. Most won't do it because it's uncomfortable.
  `;

    const SAMPLE_RESEARCH = {
        guest: {
            name: "Jane Doe",
            bio: "Startup advisor and researcher who has studied over 500 early-stage companies.",
            credentials: ["Startup Advisor", "Author of 'Customer First'"],
        },
        brand: {
            podcastName: "Startup Stories",
            channelDescription: "Interviews with founders and startup experts about building companies.",
        },
        guestTier: {
            tier: 3,
            youtubeRecommendation: "TOPIC-ONLY",
        },
    };

    const SAMPLE_EPISODE_DESCRIPTION = "Jane Doe discusses her research into why 73% of startups fail due to lack of customer conversations, and shares a practical framework for pre-launch validation.";

    function parseSSEEvents(body: string) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const events: any[] = [];
        const lines = body.split(/\r?\n/);
        let currentData = "";

        for (const line of lines) {
            if (line.startsWith("data: ")) {
                currentData += (currentData ? "\n" : "") + line.slice(6);
            } else if (line === "" && currentData) {
                try {
                    events.push(JSON.parse(currentData));
                } catch (err) {
                    console.debug("Failed to parse SSE payload:", currentData, err);
                }
                currentData = "";
            }
        }

        // Catch any trailing data
        if (currentData) {
            try {
                events.push(JSON.parse(currentData));
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                } catch (_err) {
                    // ignore
            }
        }
        return events;
    }

    async function generateResponse(request: APIRequestContext) {
        return await request.post("/api/generate", {
            data: {
                research: SAMPLE_RESEARCH,
                transcript: SAMPLE_TRANSCRIPT,
                episodeDescription: SAMPLE_EPISODE_DESCRIPTION,
            },
            timeout: 300_000,
        });
    }

    test("emits pipeline_trace events during generation", async ({ request }) => {
        const res = await generateResponse(request);
        expect(res.status()).toBe(200);

        const body = await res.text();
        const events = parseSSEEvents(body);

        const traceEvents = events.filter((e) => e.type === "pipeline_trace");
        expect(traceEvents.length).toBeGreaterThan(0);

        // Each trace event has an entry with required fields
        for (const evt of traceEvents) {
            expect(evt.entry).toBeDefined();
            expect(evt.entry.event).toBeDefined();
            expect(evt.entry.pass).toBeDefined();
            expect(evt.entry.timestamp).toBeDefined();
        }

        // Should contain at least title_generated and title_scored events
        const eventTypes = traceEvents.map((e) => e.entry.event);
        expect(eventTypes).toContain("title_generated");
        expect(eventTypes).toContain("title_scored");
    });

    test("emits pipeline_summary before complete event", async ({ request }) => {
        const res = await generateResponse(request);
        expect(res.status()).toBe(200);

        const body = await res.text();
        const events = parseSSEEvents(body);

        const summaryEvent = events.find((e) => e.type === "pipeline_summary");
        const completeEvent = events.find((e) => e.type === "complete");

        expect(summaryEvent).toBeDefined();
        expect(completeEvent).toBeDefined();

        // Summary arrives before complete
        const summaryIdx = events.indexOf(summaryEvent!);
        const completeIdx = events.indexOf(completeEvent!);
        expect(summaryIdx).toBeLessThan(completeIdx);

        // Summary has expected shape
        const summary = summaryEvent!.summary;
        expect(summary.totalGenerated).toBeGreaterThan(0);
        expect(summary.totalSelected).toBeGreaterThan(0);
        expect(typeof summary.rewriteRate).toBe("number");
        expect(summary.totalDurationMs).toBeGreaterThan(0);
        expect(Array.isArray(summary.weakDimensions)).toBe(true);
        expect(Array.isArray(summary.modelBreakdown)).toBe(true);
    });

    test("trace events include score dimensions for scored titles", async ({ request }) => {
        const res = await generateResponse(request);
        expect(res.status()).toBe(200);

        const body = await res.text();
        const events = parseSSEEvents(body);

        const scoredEvents = events
            .filter((e) => e.type === "pipeline_trace")
            .filter((e) => e.entry.event === "title_scored");

        expect(scoredEvents.length).toBeGreaterThan(0);

        for (const evt of scoredEvents) {
            expect(evt.entry.scoreTotal).toBeDefined();
            expect(typeof evt.entry.scoreTotal).toBe("number");
            expect(evt.entry.scoreDimensions).toBeDefined();
            expect(typeof evt.entry.scoreDimensions).toBe("object");
        }
    });
});
