import { test, expect } from "@playwright/test";

test.describe("Scoring Validation", () => {
  test.skip(!process.env.ENABLE_API_TESTS, "Skipped: set ENABLE_API_TESTS=true to run");

  const SAMPLE_TRANSCRIPT = `
    Host: Welcome back. Today we have Dr. Smith talking about sleep.
    Dr. Smith: Most people are destroying their health by sleeping less than 6 hours.
    Host: What happens to your body?
    Dr. Smith: Your cortisol spikes 40%, your immune system drops by half. It's a silent killer.
  `;

  test("score dimensions are within valid ranges", async ({ request }) => {
    const res = await request.post("/api/generate", {
      data: {
        transcript: SAMPLE_TRANSCRIPT,
        guestName: "Dr. Smith",
        podcastName: "Health Pod",
      },
      timeout: 300_000,
    });

    const body = await res.text();
    const lines = body.split("\n").filter((l) => l.startsWith("data: "));
    const payload = JSON.parse(lines[lines.length - 1].replace("data: ", ""));

    const DIMENSION_MAXES: Record<string, number> = {
      curiosityGap: 20,
      authoritySignal: 15,
      emotionalTrigger: 15,
      trendingKeyword: 10,
      specificity: 10,
      characterCount: 10,
      wordBalance: 10,
      frontLoadHook: 5,
      platformFit: 5,
    };

    for (const title of [...payload.youtubeTitles, ...payload.spotifyTitles]) {
      for (const [dim, max] of Object.entries(DIMENSION_MAXES)) {
        const val = title.score[dim];
        if (val !== undefined) {
          expect(val).toBeGreaterThanOrEqual(0);
          expect(val).toBeLessThanOrEqual(max);
        }
      }
      // Total should be 0-100
      expect(title.score.total).toBeGreaterThanOrEqual(0);
      expect(title.score.total).toBeLessThanOrEqual(100);
    }
  });

  test("thumbnail text scores have valid ranges", async ({ request }) => {
    const res = await request.post("/api/generate", {
      data: {
        transcript: SAMPLE_TRANSCRIPT,
        guestName: "Dr. Smith",
        podcastName: "Health Pod",
      },
      timeout: 300_000,
    });

    const body = await res.text();
    const lines = body.split("\n").filter((l) => l.startsWith("data: "));
    const payload = JSON.parse(lines[lines.length - 1].replace("data: ", ""));

    for (const title of payload.youtubeTitles) {
      if (title.thumbnailTextScore) {
        expect(title.thumbnailTextScore.curiosityGap).toBeGreaterThanOrEqual(0);
        expect(title.thumbnailTextScore.curiosityGap).toBeLessThanOrEqual(30);
        expect(title.thumbnailTextScore.emotionalPunch).toBeGreaterThanOrEqual(0);
        expect(title.thumbnailTextScore.emotionalPunch).toBeLessThanOrEqual(30);
        expect(title.thumbnailTextScore.titleComplement).toBeGreaterThanOrEqual(0);
        expect(title.thumbnailTextScore.titleComplement).toBeLessThanOrEqual(20);
        expect(title.thumbnailTextScore.brevityAndClarity).toBeGreaterThanOrEqual(0);
        expect(title.thumbnailTextScore.brevityAndClarity).toBeLessThanOrEqual(20);
        expect(title.thumbnailTextScore.total).toBeGreaterThanOrEqual(0);
        expect(title.thumbnailTextScore.total).toBeLessThanOrEqual(100);
      }
    }
  });
});
