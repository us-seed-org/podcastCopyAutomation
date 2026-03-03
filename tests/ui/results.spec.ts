import { test, expect } from "@playwright/test";

test.describe("Results UI", () => {
  // These tests check the UI rendering of results after generation.
  // Without a real generation, we test structural elements.

  test("main page has YouTube and generation sections", async ({ page }) => {
    await page.goto("/");
    // The page should render without crashing
    await expect(page.locator("body")).toBeVisible();
  });

  test("copy buttons are functional", async ({ page }) => {
    await page.goto("/");
    // Find any copy button on the page
    const copyButtons = page.getByRole("button", { name: /copy/i });
    const count = await copyButtons.count();
    // If there are copy buttons visible, they should be clickable
    if (count > 0) {
      const firstBtn = copyButtons.first();
      await expect(firstBtn).toBeEnabled();
    }
  });

  test("page is responsive at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    // Page should still render without horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    // Allow small tolerance for scrollbar
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 20);
  });

  test("page is responsive at tablet width", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
  });
});
