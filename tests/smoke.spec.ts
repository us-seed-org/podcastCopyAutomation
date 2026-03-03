import { test, expect } from "@playwright/test";

test.describe("Smoke Tests", () => {
  test("app loads and shows the main page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/podcast/i);
  });

  test("form renders with required inputs", async ({ page }) => {
    await page.goto("/");
    // Should have a textarea or input for transcript/URL
    const textInput = page.locator("textarea, input[type='text'], input[type='url']").first();
    await expect(textInput).toBeVisible();
  });

  test("generate button is present", async ({ page }) => {
    await page.goto("/");
    const generateBtn = page.getByRole("button", { name: /generate/i });
    await expect(generateBtn).toBeVisible();
  });
});
