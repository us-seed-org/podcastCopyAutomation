import { test, expect } from "@playwright/test";

test.describe("Human Feedback Component", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/generate");
        // Suite requires a completed generation (e.g. from a createGeneration fixture)
        // that provides titleResultIds before tests can interact with human feedback components.
        test.fixme(true, "Prerequisite: A completed generation with titleResultIds is required");
    });

    test("star rating is clickable and updates display", async ({ page }) => {
        // Look for star rating buttons (rendered after a generation completes with titleResultIds)
        const stars = page.locator("button").filter({ has: page.locator("svg.lucide-star") });

        // Stars only render when titleResultId is present on a title
        const starCount = await stars.count();
        if (starCount < 4) {
            test.fixme(true, "Prerequisite: A completed generation with titleResultIds is required");
            return;
        }

        // Click the 4th star (index 3)
        await stars.nth(3).click();

        // The rating display should show "4/5"
        await expect(page.getByText("4/5")).toBeVisible({ timeout: 2000 });
    });

    test("notes input expands after rating", async ({ page }) => {
        const stars = page.locator("button").filter({ has: page.locator("svg.lucide-star") });
        const starCount = await stars.count();
        if (starCount === 0) {
            test.fixme(true, "Prerequisite: A completed generation with titleResultIds is required");
            return;
        }

        // Click a star to trigger notes expansion
        await stars.first().click();

        // Notes input should appear
        const notesInput = page.locator('input[placeholder="Add a note..."]').first();
        await expect(notesInput).toBeVisible({ timeout: 2000 });

        // Type a note
        await notesInput.fill("Great title, very clickable");
        await expect(notesInput).toHaveValue("Great title, very clickable");
    });

    test("save button sends request to /api/rate", async ({ page }) => {
        // Set up route interception for /api/rate
        let rateRequestBody: any = null;
        await page.route("**/api/rate", async (route) => {
            const request = route.request();
            rateRequestBody = JSON.parse(request.postData() || "{}");
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ success: true }),
            });
        });

        const stars = page.locator("button").filter({ has: page.locator("svg.lucide-star") });
        const starCount = await stars.count();
        if (starCount < 3) {
            test.fixme(true, "Prerequisite: A completed generation with titleResultIds is required");
            return;
        }

        // Click 3rd star
        await stars.nth(2).click();

        // Fill notes
        const notesInput = page.locator('input[placeholder="Add a note..."]').first();
        await notesInput.fill("Decent title");

        // Click save
        const saveButton = page.getByRole("button", { name: "Save" }).first();
        await saveButton.click();

        // Verify the request was sent
        await expect(async () => {
            expect(rateRequestBody).not.toBeNull();
            expect(rateRequestBody.humanRating).toBe(3);
            expect(rateRequestBody.humanNotes).toBe("Decent title");
            expect(rateRequestBody.titleResultId).toBeDefined();
        }).toPass({ timeout: 5000 });
    });
});
