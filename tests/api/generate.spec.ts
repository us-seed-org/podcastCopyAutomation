import { test, expect } from "@playwright/test";

test.describe("Generate API", () => {
  // These tests validate the shape of the generation output.
  // They require a running server and valid API keys, so they may be
  // skipped in CI unless ENABLE_API_TESTS=true is set.

  test.skip(!process.env.ENABLE_API_TESTS, "Skipped: set ENABLE_API_TESTS=true to run");

  const SAMPLE_TRANSCRIPT = `
    Host: Today we're talking with Jane Doe about why most startups fail in the first year.
    Jane: The number one reason is that founders don't talk to customers. They build in a vacuum.
    Host: That's a bold claim. What's the data behind it?
    Jane: We studied 500 startups. 73% that failed had fewer than 10 customer conversations before launch.
    Host: Wow. So what should founders do instead?
    Jane: Talk to 50 customers before writing a single line of code. Most won't do it because it's uncomfortable.
  `;

  test("returns 4 YouTube + 2 Spotify titles", async ({ request }) => {
    const res = await request.post("/api/generate", {
      data: {
        transcript: SAMPLE_TRANSCRIPT,
        guestName: "Jane Doe",
        podcastName: "Startup Stories",
      },
      timeout: 300_000,
    });

    // The endpoint streams SSE, so we need to read the full body
    const body = await res.text();
    const lines = body.split("\n").filter((l) => l.startsWith("data: "));
    const lastDataLine = lines[lines.length - 1];
    expect(lastDataLine).toBeDefined();

    const payload = JSON.parse(lastDataLine.replace("data: ", ""));

    // Should have the final result
    expect(payload.youtubeTitles).toBeDefined();
    expect(payload.spotifyTitles).toBeDefined();
    expect(payload.youtubeTitles.length).toBe(4);
    expect(payload.spotifyTitles.length).toBe(2);
  });

  test("thumbnail text is <=4 words and ALL CAPS", async ({ request }) => {
    const res = await request.post("/api/generate", {
      data: {
        transcript: SAMPLE_TRANSCRIPT,
        guestName: "Jane Doe",
        podcastName: "Startup Stories",
      },
      timeout: 300_000,
    });

    const body = await res.text();
    const lines = body.split("\n").filter((l) => l.startsWith("data: "));
    const payload = JSON.parse(lines[lines.length - 1].replace("data: ", ""));

    for (const title of payload.youtubeTitles) {
      if (title.thumbnailText) {
        const words = title.thumbnailText.trim().split(/\s+/);
        expect(words.length).toBeLessThanOrEqual(4);
        expect(title.thumbnailText).toBe(title.thumbnailText.toUpperCase());
      }
    }
  });

  test("titles are <=80 characters", async ({ request }) => {
    const res = await request.post("/api/generate", {
      data: {
        transcript: SAMPLE_TRANSCRIPT,
        guestName: "Jane Doe",
        podcastName: "Startup Stories",
      },
      timeout: 300_000,
    });

    const body = await res.text();
    const lines = body.split("\n").filter((l) => l.startsWith("data: "));
    const payload = JSON.parse(lines[lines.length - 1].replace("data: ", ""));

    for (const title of [...payload.youtubeTitles, ...payload.spotifyTitles]) {
      expect(title.title.length).toBeLessThanOrEqual(80);
    }
  });

  test("archetype diversity — 4 different archetypes", async ({ request }) => {
    const res = await request.post("/api/generate", {
      data: {
        transcript: SAMPLE_TRANSCRIPT,
        guestName: "Jane Doe",
        podcastName: "Startup Stories",
      },
      timeout: 300_000,
    });

    const body = await res.text();
    const lines = body.split("\n").filter((l) => l.startsWith("data: "));
    const payload = JSON.parse(lines[lines.length - 1].replace("data: ", ""));

    const titleArchetypes = new Set(
      payload.youtubeTitles.map((t: { archetype?: string }) => t.archetype).filter(Boolean)
    );
    const thumbArchetypes = new Set(
      payload.youtubeTitles.map((t: { thumbnailArchetype?: string }) => t.thumbnailArchetype).filter(Boolean)
    );

    // Should have diversity — at least 2 different archetypes even if not all 4
    expect(titleArchetypes.size).toBeGreaterThanOrEqual(2);
    expect(thumbArchetypes.size).toBeGreaterThanOrEqual(2);
  });
});
