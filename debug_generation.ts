import { generateObject } from "ai";
import { generationModel, scoringModel } from "./src/lib/ai";
import { buildGenerationSystemPrompt, buildGenerationUserPrompt } from "./src/lib/prompts/generation-system";
import { buildScoringSystemPrompt, buildScoringUserPrompt } from "./src/lib/prompts/scoring-system";
import { titleGenerationOutputSchema } from "./src/lib/schemas/title-generation-output";
import { scoringOutputSchema } from "./src/lib/schemas/scoring-output";

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const transcript = `Aishwarya Reganti: I think one of the biggest misconceptions in AI right now is that you just build an agent, give it autonomy, and it works. But that's exactly why most AI products fail today. We've learned from over 50 AI deployments in enterprise that you actually have to start with zero autonomy.
Sai Kiriti Badam: Exactly. The reliable way to ship AI is what we call the CCCD framework—Continuous Calibration, Continuous Development. It's basically the AI version of CI/CD. You deploy it as a copilot first. The human does the work, the AI watches. Then the AI drafts, the human approves. Only once you have a massive dataset of human approvals taking place in production do you even consider giving it autonomous actions.
Aishwarya Reganti: To be honest, everyone focuses on the LLMs and the tech, but the tech is commoditized. The real advantage comes from owning the user's workflow and their specific problems. In other words, pain is the new moat. If you solve an incredibly unsexy, painful workflow, you have a moat. You don't have a moat just because you fine-tuned Llama.
Sai Kiriti Badam: The other thing is context collapse. We see these massive 300-page enterprise documents, and people try to just dump them into a vector DB and expect RAG to work perfectly. But agents break when the context hits that size. It's an architecture problem, not just a token limit problem.
Aishwarya Reganti: So if you're a founder right now, stop trying to build an autonomous agent out of the gate. Obsess over the problem first. Build the UI that captures the data. That's the only way to succeed.`;

async function run() {
    console.log("Generating...");
    const sys = buildGenerationSystemPrompt();
    const usr = buildGenerationUserPrompt({
        research: JSON.stringify({ guest: { name: "Aishwarya & Kiriti", guestTier: { tier: 3 } }, brand: { podcastName: "Lenny's Podcast" } }),
        youtubeAnalysis: "No YouTube channel data available.",
        transcript,
        episodeDescription: "A discussion on building reliable AI products, the CCCD framework, and why pain is the new moat."
    });

    const res = await generateObject({
        model: generationModel,
        schema: titleGenerationOutputSchema,
        system: sys,
        prompt: usr,
    });

    console.log("Generated Titles:");
    console.log(JSON.stringify(res.object.youtubeTitles, null, 2));

    console.log("\nScoring...");
    const ssys = buildScoringSystemPrompt();
    const susr = buildScoringUserPrompt({
        generatedTitles: JSON.stringify({ youtubeTitles: res.object.youtubeTitles, spotifyTitles: [] }, null, 2),
        research: "{}"
    });

    const scores = await generateObject({
        model: scoringModel,
        schema: scoringOutputSchema,
        system: ssys,
        prompt: susr,
    });

    console.log("Scored Titles:");
    // console.log(JSON.stringify(scores.object.youtubeTitles, null, 2));

    const fs = require('fs');
    fs.writeFileSync('debug_output.json', JSON.stringify({
        generated: res.object.youtubeTitles,
        scored: scores.object.youtubeTitles
    }, null, 2));
}

run().catch(console.error);
