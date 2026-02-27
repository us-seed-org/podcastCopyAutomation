# Prompt: Refactor the Podcast Copy Generation Prompt

## YOUR OBJECTIVE

Refactor `src/lib/prompts/generation-system.ts` so the AI generates **insight-driven conceptual hooks** instead of generic emotional clickbait. The current prompt produces titles like "WE KEEP BREAKING IT" and "IT BREAKS IN PROD" when the ground truth for this episode is the brilliant conceptual thumbnail "Pain is the new moat" paired with "Why most AI products fail: Lessons from 50+ AI deployments at Open..."

---

## THE PROBLEM (with evidence)

We ran the pipeline on a real Lenny's Podcast episode (Aish & Kiriti on building AI products / CCCD framework). Here's what happened:

**Ground truth (what the publisher actually used):**
- Title: "Why most AI products fail: Lessons from 50+ AI deployments at Open..."
- Thumbnail: "Pain is the new moat"

**What our system generated:**
| # | Title | Score | Thumbnail | Thumb Score |
|---|-------|-------|-----------|-------------|
| 1 | 74% of Enterprise AI Fails on Reliability. Fix the Shipping Loop | 70 | WE KEEP BREAKING IT | 84 |
| 2 | 74% of Enterprises Say AI Fails on Reliability. Here's the Fix | 70 | IT BREAKS IN PROD | 87 |
| 3 | CCCD Is the AI Version of CI/CD. Use It to Stop Hotfix Hell | 57 | HOTFIXES NEVER END | 84 |
| 4 | Agents Break When Docs Hit 300 Pages. Here's the Fix | 72 | CONTEXT COLLAPSES | 77 |

**Why this is bad:**
1. Thumbnail texts are all **generic emotional reactions** — "WE KEEP BREAKING IT", "IT BREAKS IN PROD" could go on ANY engineering video. Compare to "Pain is the new moat" which is a **proprietary conceptual insight** that creates a massive curiosity gap.
2. The "74% stat" is over-leveraged (appears in 3 of 6 titles) — the system latches onto a single stat and hammers it.
3. None of the titles capture the **authority signal** the way "Lessons from 50+ AI deployments" does.
4. The titles all follow the same "[Problem Statement]. Here's the Fix" pattern — no variety in angle or energy.
5. "Pain is the new moat" is exactly the kind of text our current rules would REJECT as "abstract" — but it's the single best thumbnail text possible for this episode.

**Root cause in the prompt:**
The thumbnail text section (lines ~222-297 of generation-system.ts) forces "emotional verdicts" and "natural human reactions" like "STOP DOING THIS", "THEY'RE LYING", "ORGANS ARE GIVING UP". It explicitly bans what it considers "raw data snippets" and "vague mystery phrases." But "Pain is the new moat" is neither — it's a **conceptual reframe** that distills the episode's core thesis into a proprietary phrase. The current rules have no category for this and would likely reject it.

---

## THE FILES YOU NEED TO MODIFY

### Primary file: `src/lib/prompts/generation-system.ts`
This is the main generation prompt (~566 lines). Key sections to rework:

1. **Thumbnail Text section (lines ~222-297):** The "GOLDEN RULE" forces thumbnail text to be an "emotional reaction" — verdict, warning, confession, accusation. This is too narrow. Great thumbnail text can also be a **conceptual reframe** or **proprietary insight** extracted from the episode. Add this as a valid category alongside emotional reactions.

2. **Thumbnail Text Examples (lines ~246-256):** All examples are emotional reactions ("IT CAN DO IT", "STOP DOING THIS", "THEY'RE LYING"). Add examples of conceptual insight thumbnails:
   - "PAIN IS THE NEW MOAT" (paired with AI products failing title)
   - "TASTE > TECH" (paired with a design-thinking episode)
   - "HIRE THE PROBLEM" (paired with a hiring strategy episode)
   These are NOT emotional reactions — they're distilled proprietary concepts from the episode.

3. **Title Archetypes (lines ~156-220):** The archetypes are fine structurally but they don't include a "Core Thesis Reframe" archetype — where the title distills the episode's central argument into a single contrarian statement. "Why most AI products fail" is this pattern. Add it.

4. **Step Zero / Mandatory Generation Process (lines ~394-404):** The pre-writing checklist asks "What would you text a friend?" — good. But it should also ask: "What is the single conceptual phrase or reframe that captures this episode's unique intellectual contribution?" This is how you get "Pain is the new moat."

### Secondary file: `src/lib/prompts/scoring-rubric.ts`
The scoring rubric may need minor updates to properly score conceptual thumbnail text (currently, "PAIN IS THE NEW MOAT" might get penalized under the "generic single word" or "context-free mystery" caps).

### Secondary file: `src/lib/prompts/scoring-system.ts`
The scoring system's thumbnail text rules may need to accommodate conceptual reframes without penalizing them as "vague."

---

## WHAT GREAT THUMBNAIL TEXT ACTUALLY LOOKS LIKE

There are THREE valid categories of great thumbnail text (the current prompt only teaches category 1):

### Category 1: Emotional Verdicts (what we currently generate)
- "STOP DOING THIS" — loss aversion
- "THEY'RE LYING" — contrarian accusation
- "HE'S WRONG" — confrontational

### Category 2: Conceptual Reframes (what we're MISSING — highest ceiling)
- "PAIN IS THE NEW MOAT" — distills core thesis into a proprietary phrase
- "CONTEXT IS THE PRODUCT" — reframes what the episode argues
- "SHIP TRUST NOT FEATURES" — contrarian operating principle from the episode
These work because they make the viewer think "wait, what does that mean?" — the curiosity gap comes from the CONCEPT, not from emotion.

### Category 3: Specific Revelations
- "72 MINUTES" — a specific shocking number
- "$0 CAC" — a specific counterintuitive metric

The prompt needs to teach all three categories and encourage Category 2 when the episode contains a strong conceptual thesis.

---

## HOW TO TEST YOUR CHANGES

There is a working Playwright test script at `test-playwright.mjs` that automates the full pipeline. After making prompt changes:

### Step 1: Run the test
```bash
node test-playwright.mjs
```

This will:
1. Open a browser to `localhost:3000/generate`
2. Upload the transcript file from `~/Downloads/Rough Draft_Aish Nr + Sai Kiriti Badam.txt`
3. Fill in all form fields (podcast name: "Lenny's Podcast", guest: "Aishwarya Reganti & Sai Kiriti Badam", YouTube URL, target audience, episode description)
4. Click "Generate Copy" and wait for the pipeline to complete (~2 minutes)
5. Take screenshots of the results

### Step 2: Evaluate against ground truth
Compare the generated output to:
- **Title benchmark:** "Why most AI products fail: Lessons from 50+ AI deployments at Open..."
- **Thumbnail benchmark:** "Pain is the new moat"

Ask yourself:
- Does at least ONE thumbnail text contain a conceptual reframe (not just an emotional reaction)?
- Do the titles have variety in angle (not all using the same stat)?
- Does at least ONE title capture the authority signal ("50+ AI deployments" or equivalent)?
- Would any of these titles/thumbnails make you stop scrolling?

### Step 3: Iterate
If the output still doesn't hit the benchmark:
1. Re-read the generation prompt to find what's constraining the model
2. Make targeted edits
3. Re-run `node test-playwright.mjs`
4. Compare again

**Keep iterating until at least one generated thumbnail is in the same league as "Pain is the new moat."**

### Step 4: Run the build to ensure no TypeScript errors
```bash
npm run build
```

---

## REFINEMENT LOOP PROTOCOL

After each test run, follow this exact loop:

1. **Capture**: Screenshot the results (the script does this automatically to `screenshot-results.png`)
2. **Diagnose**: For each generated title+thumbnail pair, identify which prompt rule caused it to be mediocre. Was it the emotional-reaction-only constraint? The banned-phrases list catching conceptual text? The archetype templates being too rigid?
3. **Hypothesize**: What single change to the prompt would most improve the weakest output?
4. **Edit**: Make that ONE targeted change to `generation-system.ts`
5. **Re-run**: `node test-playwright.mjs` again
6. **Compare**: Did the change improve output quality? Did it introduce regressions (e.g., now generating vague mystery bait)?
7. **Repeat** until satisfied, then run `npm run build` to verify no errors.

Do NOT make sweeping rewrites. Make surgical, testable changes and verify each one. The prompt is ~530 lines of carefully tuned rules — a nuclear rewrite will break things that currently work.

---

## CONSTRAINTS

- Do NOT remove the anti-hallucination rules — they prevent real failures
- Do NOT remove the tier system — it correctly handles guest name strategy
- Do NOT remove the AI slop detection rules (banned punctuation, banned phrasing) — they catch real problems
- DO preserve the scoring rubric structure and dimension weights
- The key change is EXPANDING what counts as great thumbnail text and great title framing, not removing existing guardrails
- Keep all existing TypeScript types and function signatures intact

---

## SUCCESS CRITERIA

The refactored prompt should generate output where:
1. At least 1 of 4 YouTube thumbnail texts is a **conceptual reframe** (not just an emotional reaction)
2. Titles use **diverse angles** (not all anchored on the same stat)
3. At least 1 title captures **authority/credential signal** naturally
4. The build passes (`npm run build`)
5. Output quality is measurably closer to "Pain is the new moat" + "Why most AI products fail..." caliber
