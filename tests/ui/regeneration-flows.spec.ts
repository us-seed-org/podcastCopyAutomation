import { test, expect, type Page, type Route } from "@playwright/test";

const SCORE_TEMPLATE = {
  curiosityGap: 8,
  authoritySignal: 8,
  emotionalTrigger: 8,
  trendingKeyword: 8,
  specificity: 8,
  characterCount: 8,
  wordBalance: 8,
  frontLoadHook: 8,
  platformFit: 8,
  total: 72,
};

const THUMB_TEMPLATE = {
  curiosityGap: 20,
  emotionalPunch: 20,
  titleComplement: 18,
  brevityAndClarity: 18,
  total: 76,
};

const BASE_OUTPUT = {
  youtubeTitles: [
    {
      title: "Why 73% of Startups Fail Before Launch",
      score: SCORE_TEMPLATE,
      scrollStopReason: "Hard-hitting stat",
      emotionalTrigger: "Fear of failure",
      platformNotes: "Strong front-loaded hook",
      thumbnailText: "STARTUP TRUTH",
      thumbnailTextScore: THUMB_TEMPLATE,
      archetype: "authority_shocking",
      thumbnailArchetype: "alarm",
      sourceModel: "GPT-5.2",
      pairwiseWins: 4,
      pairwiseRank: 1,
      titleResultId: "yt-1",
    },
    {
      title: "The 50-Customer Rule Most Founders Ignore",
      score: SCORE_TEMPLATE,
      scrollStopReason: "Actionable mechanism",
      emotionalTrigger: "Curiosity",
      platformNotes: "Useful and tactical",
      thumbnailText: "50 CUSTOMERS",
      thumbnailTextScore: THUMB_TEMPLATE,
      archetype: "mechanism_outcome",
      thumbnailArchetype: "label",
      sourceModel: "Gemini 3.1 Pro",
      pairwiseWins: 3,
      pairwiseRank: 2,
      titleResultId: "yt-2",
    },
    {
      title: "What Nobody Tells You About Validating Ideas",
      score: SCORE_TEMPLATE,
      scrollStopReason: "Open loop framing",
      emotionalTrigger: "Suspense",
      platformNotes: "High click curiosity",
      thumbnailText: "NOBODY TELLS",
      thumbnailTextScore: THUMB_TEMPLATE,
      archetype: "curiosity_gap",
      thumbnailArchetype: "gut_punch",
      sourceModel: "Minimax M2.5",
      pairwiseWins: 2,
      pairwiseRank: 3,
      titleResultId: "yt-3",
    },
    {
      title: "Stop Building First: Why MVP Advice Is Backwards",
      score: SCORE_TEMPLATE,
      scrollStopReason: "Contrarian angle",
      emotionalTrigger: "Surprise",
      platformNotes: "Strong debate hook",
      thumbnailText: "STOP BUILDING",
      thumbnailTextScore: THUMB_TEMPLATE,
      archetype: "negative_contrarian",
      thumbnailArchetype: "confrontation",
      sourceModel: "Kimi K2.5",
      pairwiseWins: 1,
      pairwiseRank: 4,
      titleResultId: "yt-4",
    },
  ],
  spotifyTitles: [
    {
      title: "Customer Calls Before Code: Jane Doe's Validation Framework",
      score: SCORE_TEMPLATE,
      scrollStopReason: "Clear promise",
      emotionalTrigger: "Confidence",
      platformNotes: "Podcast-native framing",
      sourceModel: "GPT-5.2",
      titleResultId: "sp-1",
    },
    {
      title: "The Startup Validation Playbook (From 500 Failed Companies)",
      score: SCORE_TEMPLATE,
      scrollStopReason: "Authority credential",
      emotionalTrigger: "Urgency",
      platformNotes: "Long-tail topic fit",
      sourceModel: "Gemini 3.1 Pro",
      titleResultId: "sp-2",
    },
  ],
  rejectedTitles: [],
  tierClassification: {
    tier: 2,
    appliedCorrectly: true,
    verification: "Mocked",
  },
  youtubeDescription: "Original YouTube description.",
  spotifyDescription: "Original Spotify description.",
  chapters: [
    { timestamp: "00:00", title: "Intro" },
    { timestamp: "04:10", title: "73% Failure Pattern" },
    { timestamp: "12:20", title: "How to Run Customer Calls" },
  ],
  descriptionSEOKeywords: ["startup", "customer research"],
  descriptionScore: {
    hookQuality: 22,
    structuralMatch: 21,
    seoIntegration: 20,
    humanVoice: 21,
    total: 84,
  },
  chapterScore: {
    specificityAvg: 21,
    activeVoice: 20,
    patternCompliance: 21,
    miniHookQuality: 20,
    total: 82,
  },
};

function buildSSE(output: unknown, runId: string) {
  const summary = {
    totalGenerated: 6,
    totalSelected: 6,
    totalRejected: 0,
    rewriteRate: 0,
    weakDimensions: [],
    modelBreakdown: [],
    passDurations: [{ pass: "2", durationMs: 120 }],
    totalDurationMs: 350,
  };

  const events = [
    { type: "run_id", runId },
    { type: "status", message: "Processing..." },
    { type: "pipeline_summary", summary },
    { type: "complete", data: output },
  ];
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createModeOutput(mode: string, payload: any) {
  const output = structuredClone(BASE_OUTPUT);

  if (mode === "regenerate_title") {
    const arch = payload.targetArchetype;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const idx = output.youtubeTitles.findIndex((t: any) => t.archetype === arch);
    if (idx >= 0) {
      output.youtubeTitles[idx] = {
        ...output.youtubeTitles[idx],
        title: `Regenerated ${arch} title`,
        thumbnailText: "NEW ANGLE",
      };
    }
  }

  if (mode === "rescore") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    output.youtubeTitles = output.youtubeTitles.map((t: any, i: number) => ({
      ...t,
      score: { ...t.score, total: 80 - i },
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    output.spotifyTitles = output.spotifyTitles.map((t: any, i: number) => ({
      ...t,
      score: { ...t.score, total: 78 - i },
    }));
  }

  if (mode === "rerank") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    output.youtubeTitles = output.youtubeTitles.map((t: any, i: number) => ({
      ...t,
      pairwiseRank: output.youtubeTitles.length - i,
      pairwiseWins: i,
    }));
  }

  if (mode === "recontent") {
    output.youtubeDescription = "Updated YouTube description from recontent.";
    output.spotifyDescription = "Updated Spotify description from recontent.";
    output.chapters = [
      { timestamp: "00:00", title: "Fresh Intro" },
      { timestamp: "03:45", title: "Updated Framework" },
      { timestamp: "10:30", title: "Action Plan" },
    ];
  }

  return output;
}

async function fillAndSubmit(page: Page) {
  await page.goto("/generate");
  await page.locator("#podcastName").fill("Mock Podcast");
  await page.locator("#episodeDescription").fill(
    "Detailed mock episode description with enough content for form validation."
  );
  await page.locator("#transcript-input").setInputFiles({
    name: "transcript.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Transcript line. ".repeat(300)),
  });
  await page.getByRole("button", { name: "Generate Copy" }).click();
  await expect(page.getByRole("heading", { name: "Generated Copy" })).toBeVisible();
}

async function setupCoreMocks(page: Page) {
  await page.route("**/api/research", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify({
        type: "complete",
        data: {
          guest: { name: "Jane Doe", guestTier: { tier: 2 } },
          brand: { podcastName: "Mock Podcast" },
        },
      })}\n\n`,
    });
  });

  await page.route("**/api/youtube-analysis", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ descriptionPattern: "Mock pattern" }),
    });
  });
}

test.describe("Regeneration flows", () => {
  test("per-title regenerate sends regenerate_title mode with archetype and existing generation", async ({
    page,
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requests: any[] = [];

    await setupCoreMocks(page);
    await page.route("**/api/generate", async (route: Route) => {
      const payload = JSON.parse(route.request().postData() || "{}");
      requests.push(payload);
      const mode = payload.mode || "full";
      await new Promise((resolve) => setTimeout(resolve, mode === "full" ? 30 : 250));
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: buildSSE(createModeOutput(mode, payload), `run-${requests.length}`),
      });
    });

    await fillAndSubmit(page);
    await page.getByRole("button", { name: /^Regenerate$/ }).first().click();

    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    await expect.poll(() => requests.length).toBe(2);

    expect(requests[1].mode).toBe("regenerate_title");
    expect(typeof requests[1].targetArchetype).toBe("string");
    expect(requests[1].existingGeneration.youtubeTitles).toHaveLength(4);
    await expect(page.locator("p", { hasText: /Regenerated .* title/ }).first()).toBeVisible();
  });

  test("rerun buttons send rescore, rerank, and recontent modes with existing generation", async ({
    page,
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requests: any[] = [];

    await setupCoreMocks(page);
    await page.route("**/api/generate", async (route: Route) => {
      const payload = JSON.parse(route.request().postData() || "{}");
      requests.push(payload);
      const mode = payload.mode || "full";
      await new Promise((resolve) => setTimeout(resolve, mode === "full" ? 20 : 180));
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: buildSSE(createModeOutput(mode, payload), `run-${requests.length}`),
      });
    });

    await fillAndSubmit(page);

    const rerunButtons: Array<{ label: "Re-score" | "Re-rank" | "Re-content"; mode: string }> = [
      { label: "Re-score", mode: "rescore" },
      { label: "Re-rank", mode: "rerank" },
      { label: "Re-content", mode: "recontent" },
    ];

    for (let i = 0; i < rerunButtons.length; i++) {
      const rerun = rerunButtons[i];
      await page.getByRole("button", { name: rerun.label }).click();
      await expect.poll(() => requests.length).toBe(i + 2);
      expect(requests[requests.length - 1].mode).toBe(rerun.mode);
      expect(requests[requests.length - 1].existingGeneration.youtubeTitles).toHaveLength(4);
      await expect(page.getByRole("button", { name: rerun.label })).toBeEnabled();
    }

    await expect(page.getByText("Updated YouTube description from recontent.")).toBeVisible();
  });

  test("cancel stops an in-flight rerun and restores controls", async ({ page }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requests: any[] = [];

    await setupCoreMocks(page);
    await page.route("**/api/generate", async (route: Route) => {
      const payload = JSON.parse(route.request().postData() || "{}");
      requests.push(payload);
      const mode = payload.mode || "full";

      if (mode === "rerank") {
        await new Promise((resolve) => setTimeout(resolve, 4000));
      } else {
        await new Promise((resolve) => setTimeout(resolve, 30));
      }

      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: buildSSE(createModeOutput(mode, payload), `run-${requests.length}`),
      });
    });

    await fillAndSubmit(page);
    await page.getByRole("button", { name: "Re-rank" }).click();
    await expect.poll(() => requests.length).toBe(2);
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByRole("button", { name: "Cancel" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Re-rank" })).toBeEnabled();
    expect(requests[1].mode).toBe("rerank");
  });
});
