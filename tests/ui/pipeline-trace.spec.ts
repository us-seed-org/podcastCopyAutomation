import { test, expect } from "@playwright/test";

test.describe("Pipeline Trace Panel", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/generate");

        // Mock API responses to simulate a fast, successful generation
        await page.route("**/api/research", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: `data: {"type": "complete", "data": {"guest": {"name": "Test"}, "brand": {}}}\n\n`,
            });
        });
        await page.route("**/api/youtube-analysis", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({}),
            });
        });
        await page.route("**/api/generate", async (route) => {
            const MOCK_SSE = `
data: {"type": "pipeline_trace", "entry": {"timestamp": 123, "pass": "1", "event": "title_generated", "title": "Why 73% of Startups Fail Before Launch", "model": "mock", "platform": "youtube"}}

data: {"type": "pipeline_trace", "entry": {"timestamp": 124, "pass": "2", "event": "title_scored", "title": "Why 73% of Startups Fail Before Launch", "model": "mock", "platform": "youtube", "scoreTotal": 78, "scoreDimensions": {"total": 78}}}

data: {"type": "pipeline_trace", "entry": {"timestamp": 125, "pass": "2", "event": "title_rejected", "title": "Expert Reveals Shocking Startup Secrets", "reason": "AI slop detected", "platform": "youtube"}}

data: {"type": "pipeline_trace", "entry": {"timestamp": 126, "pass": "3", "event": "title_selected", "title": "Why 73% of Startups Fail Before Launch", "scoreTotal": 78, "pairwiseRank": 1, "pairwiseWins": 4, "platform": "youtube"}}

data: {"type": "pipeline_trace", "entry": {"timestamp": 127, "pass": "3", "event": "guardrail_violation", "title": "The Truth About Why Startups Fail", "reason": "Banned phrase", "platform": "youtube"}}
`;
            // Do not complete immediately so it stays "LIVE" and "isRunning" for tests to assert
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: MOCK_SSE,
            });
        });
    });

    async function triggerGeneration(page: any) {
        await page.locator('#guestName').fill("Test Guest");
        await page.locator('#podcastName').fill("Test Podcast");
        await page.locator('#episodeDescription').fill("Test description for mocking.");
        await page.locator('#transcript-input').setInputFiles({
            name: 'transcript.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from("Test transcript with enough length so the form validation passes easily. ".repeat(10))
        });
        await page.locator('button[type="submit"]').click();
    }

    test("panel renders when trace entries exist", async ({ page }) => {
        await triggerGeneration(page);
        const tracePanel = page.getByText("Pipeline Trace");
        const count = await tracePanel.count();
        expect(count).toBeGreaterThan(0);
        await expect(tracePanel).toBeAttached({ timeout: 5000 });
    });

    test("collapsible behavior works", async ({ page }) => {
        await triggerGeneration(page);
        const collapsibleTrigger = page.locator("text=Pipeline Trace").first();
        await expect(collapsibleTrigger).toBeVisible({ timeout: 5000 });

        await collapsibleTrigger.click();
        const content = page.getByTestId("pipeline-trace-collapsible").locator("[data-state='closed']").first();
        await expect(content).toBeVisible({ timeout: 2000 });

        await collapsibleTrigger.click();
        await expect(page.getByTestId("pipeline-trace-collapsible").locator("[data-state='open']").first()).toBeVisible({ timeout: 2000 });
    });

    test("color-coded event badges display correctly", async ({ page }) => {
        await triggerGeneration(page);

        const badgeLabels = [
            "GENERATED", "SCORED", "REJECTED", "REWRITTEN", "SELECTED",
            "GUARDRAIL", "DEDUP", "THUMBNAIL", "PAIRWISE", "SUMMARY", "WARNING",
        ];

        const badges = page.locator("[data-slot='badge']").filter({ hasText: /GENERATED|SCORED|REJECTED|REWRITTEN|SELECTED|GUARDRAIL/ });
        await expect(badges.first()).toBeVisible({ timeout: 5000 });

        const badgeCount = await badges.count();
        expect(badgeCount).toBeGreaterThan(0);

        const renderedTexts: string[] = [];
        for (let i = 0; i < badgeCount; i++) {
            const text = await badges.nth(i).textContent();
            if (text) renderedTexts.push(text.trim());
        }

        for (const text of renderedTexts) {
            expect(badgeLabels).toContain(text);
        }
    });

    test("LIVE indicator shows during generation", async ({ page }) => {
        // Because our mocked generation doesn't send "complete", it hangs in running state
        await triggerGeneration(page);
        const liveIndicator = page.locator("text=LIVE").first();
        await expect(liveIndicator).toBeVisible({ timeout: 5000 });
    });
});
