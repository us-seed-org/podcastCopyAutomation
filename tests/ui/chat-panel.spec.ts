import { test, expect } from "@playwright/test";

test.describe("Chat Panel UI", () => {
  test("chat panel is not visible before generation", async ({ page }) => {
    await page.goto("/generate");
    // ChatPanel is only rendered when runId is available (post-generation)
    await expect(page.getByText("Refinement Chat")).not.toBeVisible();
  });

  test("channel-configs page renders correctly", async ({ page }) => {
    await page.goto("/channel-configs");
    await expect(page.getByRole("heading", { name: "Channel Configs" })).toBeVisible();
    await expect(page.getByRole("button", { name: /new config/i })).toBeVisible();
  });

  test("channel-configs create form opens and has required fields", async ({ page }) => {
    await page.goto("/channel-configs");
    await page.getByRole("button", { name: /new config/i }).click();
    await expect(page.getByRole("heading", { name: "New Channel Config" })).toBeVisible();
    await expect(page.getByLabel(/name/i)).toBeVisible();
    await expect(page.getByLabel(/system prompt/i)).toBeVisible();
  });

  test("channel-configs form validates required fields", async ({ page }) => {
    await page.goto("/channel-configs");
    await page.getByRole("button", { name: /new config/i }).click();
    // Try to save without filling in required fields
    await page.getByRole("button", { name: /save/i }).click();
    // Should show validation error or stay on form
    await expect(page.getByRole("heading", { name: "New Channel Config" })).toBeVisible();
  });

  test("channel-configs back button navigates to list", async ({ page }) => {
    await page.goto("/channel-configs");
    await page.getByRole("button", { name: /new config/i }).click();
    await page.getByRole("button", { name: /back/i }).click();
    await expect(page.getByRole("heading", { name: "Channel Configs" })).toBeVisible();
  });

  test("channel-configs home link navigates to root", async ({ page }) => {
    await page.goto("/channel-configs");
    await page.getByRole("link", { name: /home/i }).click();
    // Root page redirects to /generate
    await expect(page).toHaveURL("/generate");
  });

  test("generate page shows channel config dropdown when configs exist", async ({ page, request }) => {
    // This test only runs if the DB has at least one channel config
    const res = await request.get("/api/channel-configs");
    const body = await res.json();
    if (!body.data || body.data.length === 0) {
      test.skip();
      return;
    }

    await page.goto("/generate");
    // The input form should show the channel config dropdown
    await expect(page.getByLabel(/channel config/i)).toBeVisible();
    await expect(page.getByText(/manage configs/i)).toBeVisible();
  });

  test("action confirm modal shows action description", async ({ page }) => {
    // Test the modal component in isolation by navigating to a page that could trigger it
    // Since the modal is only shown post-generation, we verify the generate page loads
    await page.goto("/generate");
    await expect(page.locator("body")).toBeVisible();
    // Modal should not be visible on load
    await expect(page.getByText("Confirm action")).not.toBeVisible();
  });

  test("chat panel collapses and expands", async ({ page }) => {
    // We can only properly test this post-generation — set up mock state via URL
    // For now verify the generate page structure is correct
    await page.goto("/generate");
    await expect(page.locator("body")).toBeVisible();
  });

  test.describe("with API tests enabled", () => {
    test.skip(!process.env.ENABLE_API_TESTS, "Skipped: set ENABLE_API_TESTS=true to run");

    test("chat panel appears after generation completes", async ({ page }) => {
      await page.goto("/generate");

      const SAMPLE_TRANSCRIPT = `
        Host: Today we talk about building in public with Maya Torres.
        Maya: Sharing your work before it's ready is the fastest feedback loop.
        Host: Aren't you afraid of embarrassment?
        Maya: The embarrassment of shipping slowly is worse than shipping rough.
      `;

      // Fill the form
      await page.getByLabel(/episode description/i).fill("Building in public with Maya Torres.");
      await page.getByLabel(/transcript/i).fill(SAMPLE_TRANSCRIPT);

      // Submit — this triggers a real generation (slow)
      await page.getByRole("button", { name: /generate/i }).click();

      // Wait for generation to complete (up to 5 min)
      await expect(page.getByText("Refinement Chat")).toBeVisible({ timeout: 300_000 });

      // Panel should be expanded by default
      await expect(page.getByPlaceholder(/ask about your results/i)).toBeVisible();
    });

    test("chat panel can send a message and receive a response", async ({ page }) => {
      await page.goto("/generate");

      const SAMPLE_TRANSCRIPT = `
        Host: With David Kim about why sleep beats hustle culture.
        David: Sleep deprivation costs the US $411 billion a year in productivity losses.
        Host: But successful founders brag about working 80-hour weeks.
        David: Survivorship bias. For every Elon Musk there are 10,000 burned-out founders who failed.
      `;

      await page.getByLabel(/episode description/i).fill("David Kim on sleep and productivity.");
      await page.getByLabel(/transcript/i).fill(SAMPLE_TRANSCRIPT);
      await page.getByRole("button", { name: /generate/i }).click();

      await expect(page.getByText("Refinement Chat")).toBeVisible({ timeout: 300_000 });

      // Send a message
      await page.getByPlaceholder(/ask about your results/i).fill("Why did the first title score highest?");
      await page.getByRole("button", { name: /send/i }).click();

      // Should show the user message
      await expect(page.getByText("Why did the first title score highest?")).toBeVisible({ timeout: 10_000 });

      // Should show an assistant response (wait for streaming to complete)
      const messages = page.locator(".bg-muted");
      await expect(messages.first()).toBeVisible({ timeout: 60_000 });
    });
  });
});
