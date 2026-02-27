import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TRANSCRIPT_PATH = process.env.TRANSCRIPT_PATH || path.join(__dirname, "test-data", "transcript.txt");

async function run() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // Navigate to the app
  await page.goto("http://localhost:3000/generate");
  await page.waitForLoadState("networkidle");
  console.log("Page loaded");

  // 1. Upload transcript via the hidden file input
  const fileInput = page.locator("#transcript-input");
  await fileInput.setInputFiles(TRANSCRIPT_PATH);
  console.log("Transcript uploaded");

  // Wait for transcript to be parsed
  await page.waitForSelector("text=Transcript loaded successfully", { timeout: 10000 });
  console.log("Transcript parsed successfully");

  // 2. Fill Guest Name
  await page.fill("#guestName", "Aishwarya Reganti & Sai Kiriti Badam");
  console.log("Guest name filled");

  // 3. Fill Podcast Name
  await page.fill("#podcastName", "Lenny's Podcast");
  console.log("Podcast name filled");

  // 4. Fill Episode Description
  await page.fill(
    "#episodeDescription",
    "Aish and Kiriti share a practical framework for building AI products that actually work, centered on starting with low agent autonomy and high human control, then graduating incrementally as trust is earned. They introduce their CCCD framework (Continuous Calibration, Continuous Development) as the AI equivalent of CI/CD, emphasizing that production monitoring and evals must work together. The core message: obsess over the problem and your workflows first — AI is just the tool."
  );
  console.log("Episode description filled");

  // 5. Open Advanced Options
  await page.click("text=Advanced Options");
  await page.waitForSelector("#youtubeChannelUrl", { timeout: 5000 });
  console.log("Advanced options opened");

  // 6. Fill YouTube Channel URL
  await page.fill("#youtubeChannelUrl", "https://www.youtube.com/@LennysPodcast/videos");
  console.log("YouTube URL filled");

  // 7. Fill Target Audience
  await page.fill(
    "#targetAudience",
    "Product managers, engineers, and founders at companies actively building or planning to build AI products — particularly those in enterprise or mid-market settings. It's especially relevant for teams struggling with reliability, autonomy, and structuring their AI development process."
  );
  console.log("Target audience filled");

  // Screenshot before submit
  await page.screenshot({ path: "screenshot-form-filled.png", fullPage: true });
  console.log("Screenshot taken: screenshot-form-filled.png");

  // 8. Submit the form
  await page.click('button:has-text("Generate Copy")');
  console.log("Form submitted - waiting for pipeline to complete...");

  // Wait for the pipeline to complete (up to 8 minutes)
  try {
    // Wait a moment for form to process
    await page.waitForTimeout(2000);
    console.log("Pipeline should be running...");

    // Poll for results - check every 15 seconds for up to 8 minutes
    let found = false;
    for (let i = 0; i < 32; i++) {
      await page.waitForTimeout(15000);

      // Take a progress screenshot every minute
      if ((i + 1) % 4 === 0) {
        await page.screenshot({ path: `screenshot-progress-${(i + 1) * 15}s.png`, fullPage: true });
        console.log(`Progress screenshot at ${(i + 1) * 15}s`);
      }

      const pageText = await page.textContent("body");
      if (pageText && pageText.includes("YouTube Titles")) {
        found = true;
        console.log(`Results appeared after ~${(i + 1) * 15} seconds!`);
        break;
      }

      // Log any status text we can find
      const statusEls = await page.locator('[class*="status"], [class*="progress"], [role="status"]').allTextContents();
      if (statusEls.length > 0) {
        console.log(`Status indicators: ${statusEls.join(', ')}`);
      }

      // Check if the button is still in loading state
      const btnText = await page.locator('button[type="submit"]').textContent().catch(() => 'unknown');
      console.log(`Still waiting... ${(i + 1) * 15}s elapsed (button: "${btnText}")`);
    }

    if (found) {
      // Wait for all results to finish rendering
      await page.waitForTimeout(5000);

      // Screenshot results
      await page.screenshot({ path: "screenshot-results.png", fullPage: true });
      console.log("Results screenshot taken: screenshot-results.png");

      // Get page content for analysis
      const bodyText = await page.textContent("body");
      console.log("\n=== PAGE TEXT (truncated) ===");
      console.log(bodyText?.substring(0, 5000));
    } else {
      console.log("Timed out waiting for results");
      await page.screenshot({ path: "screenshot-timeout.png", fullPage: true });
    }
  } catch (err) {
    console.error("Error during pipeline wait:", err.message);
    await page.screenshot({ path: "screenshot-error.png", fullPage: true });
  }

  // Keep browser open for manual inspection
  console.log("\nBrowser left open for inspection. Press Ctrl+C to close.");
  await new Promise(() => { }); // Keep alive
}

run().catch(console.error);
