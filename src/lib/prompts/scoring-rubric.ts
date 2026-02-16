export const SCORING_RUBRIC = `
## SCORING RUBRIC (Externally Calibrated)

### Tier Definitions (for Authority Signal scoring)
- **Tier 1**: Household names that need no explanation (e.g., "Sam Altman", "Elon Musk", "Taylor Swift")
- **Tier 2**: Industry-recognized names within their field. This covers a WIDE range:
  - Podcast hosts (e.g., "Lex Fridman", "Joe Rogan", "Tim Ferriss")
  - NYT Bestselling authors (e.g., "James Clear", "Brené Brown")
  - Recognized founders/CEOs (e.g., "Marc Benioff", "Reshma Saujani")
  - Niche influencers (10K-500K subscribers in specific domains)
  - Academic experts (e.g., "Dr. Andrew Huberman", "Dr. Peter Attia")
  - **IMPORTANT**: Most podcast guests fall into Tier 2. Don't penalize them for not being Elon Musk.
- **Tier 3**: Truly unknown guests with no online presence — score the topic's inherent authority instead

CRITICAL: You are NOT scoring your own homework. You are comparing your
titles against REAL titles with KNOWN performance. If your title wouldn't
perform as well as the calibration example, it CANNOT score as high.

### Calibration Benchmarks (these are GROUND TRUTH):

**Score 95:** "Nuclear War Expert: 72 Minutes To Wipe Out 60% Of Humans!"
(DOAC, 16M views)
- WHY: Extreme specificity (72 minutes, 60%), visceral fear, universal
  stakes, authority label that needs no explanation

**Score 90:** "What Alcohol Does to Your Body, Brain & Health"
(Huberman, 18M views)
- WHY: Universally relevant topic, specific mechanism promise,
  clean/searchable, no gimmicks needed

**Score 85:** "Sam Altman | The Future of AI in America"
- WHY: Tier 1 name that IS the hook. The pipe separator feels
  clean/premium. "in America" adds a political/competitive angle
  that "of AI" alone doesn't. For Tier 1 guests, the title's job
  is to GET OUT OF THE WAY of the name.

**Score 82:** "James Clear: The Secret to Building Habits That Stick"
- WHY: Tier 2 name (bestselling author) with specific mechanism promise.
  The colon structure works well for recognized experts. "Secret" is
  slightly clickbaity but acceptable for this tier.

**Score 78:** "Peter Attia: The 4 Pillars of Longevity"
- WHY: Tier 2 doctor with clear framework. Numbers work well for
  authority figures. Clean, professional, promises specific value.

**Score 70:** "Why Everyone Is Talking About AI Right Now"
(no guest, no specificity, ~200K views)
- WHY: Vague topic with no specific claim, no authority, no number,
  no mechanism. "Right now" is empty urgency. This is what happens
  when you have nothing interesting to say but still need a title.

**Score 55:** "AI Agents, Robot CEOs & The End of Middle Management"
(AI-generated feel, low CTR)
- WHY: Buzzword dump, no specific claim, no human voice,
  reads like a conference panel title

**Score 50:** "AI CEOs? Could a Model Run a $1B Company Today? Why It Matters"
- WHY: Double question = indecisive. "Why It Matters" is pure filler.
  "Could a Model" is ambiguous (fashion model?). Sounds like a blog post,
  not a YouTube title. Nobody stops scrolling for a hedging question.

**Score 45:** "Vision Agents Are Here: Ray-Ban Glasses Turn AI First-Person"
- WHY: "[X] Are Here" is generic announcement language. "Turn AI First-Person"
  is confusing — what does that even mean? The colon structure reads like a
  press release. Compare to: "Ray-Ban Just Put an AI Agent in Your Glasses"
  which is specific, visceral, and conversational.

**Score 30:** "Peter Diamandis on Agents, AI CEOs, 108K Layoffs & Solve Everything"
- WHY: Keyword dump with a name prepended. Lists 5 topics instead of
  picking ONE compelling angle. No curiosity gap, no emotion, no opinion.
  This is a table of contents, not a title.

**Score 45:** "He Wants to Replace Every CEO With an AI"
- WHY: "He" has no antecedent — the audience has no idea who "he" is.
  This isn't mystery, it's confusion. A dangling pronoun is not a hook.
  Compare to: "AI CEOs Are Coming to the Fortune 500" which makes the
  IDEA the subject, not an anonymous person.

**Score 40:** "An AI Agent Emailed Us — They Wrote Their Own Ethics"
- WHY: Vague ("us" who?), em dash, anthropomorphizing cliché,
  no stakes, sounds like a tech blog, wouldn't stop anyone scrolling

### Per-Dimension Calibration Table

Use this table to calibrate EACH dimension score. These are the ground-truth
per-dimension breakdowns for the calibration benchmarks above.

| Title (Total) | CG /20 | AS /15 | ET /15 | TK /10 | SP /10 | CC /10 | WB /10 | FL /5 | TC /5 |
|---|---|---|---|---|---|---|---|---|---|
| Nuclear War Expert: 72 Min... (95) | 19 | 14 | 15 | 9 | 10 | 9 | 9 | 5 | 5 |
| What Alcohol Does to Body... (90) | 18 | 12 | 14 | 9 | 9 | 9 | 9 | 5 | 5 |
| Sam Altman \| Future of AI... (85) | 15 | 15 | 11 | 9 | 8 | 7 | 10 | 5 | 5 |
| Peter Attia: 4 Pillars... (78) | 14 | 12 | 10 | 7 | 9 | 8 | 9 | 5 | 4 |
| Why Everyone Is Talking... (70) | 12 | 5 | 10 | 9 | 4 | 10 | 10 | 5 | 5 |
| AI Agents, Robot CEOs &... (55) | 10 | 3 | 8 | 7 | 3 | 9 | 7 | 4 | 4 |

**HOW TO USE THIS TABLE:**
- Before assigning a dimension score, find the benchmark title closest in
  quality for THAT dimension and use its score as your anchor.
- A curiosityGap of 16+ requires specificity comparable to "72 Minutes to
  Wipe Out 60% of Humans." Generic topic questions with no specific claim
  or number max at 12.
- An authoritySignal of 12+ requires a name or credential that a general
  audience would instantly recognize and be impressed by. Niche credentials
  with no topic authority max at 5.
- An emotionalTrigger of 12+ requires a visceral gut reaction (fear of death,
  outrage, shock). If the reaction is merely "concern" or "interesting," max 9.
- A specificity of 8+ requires concrete numbers, percentages, or timeframes.
  "The future" or "everything" = max 3.

### Hard Dimension Caps (NON-NEGOTIABLE)

These caps override any other scoring logic. If a condition is true, the
dimension score CANNOT exceed the stated maximum, period.

| Condition | Capped Dimension | Max Score |
|---|---|---|
| Generic topic with no specific claim, number, or mechanism | Curiosity Gap | 12 |
| Emotional reaction is "concern" or "interesting," not visceral shock/fear/outrage | Emotional Trigger | 9 |
| No specific number, percentage, timeframe, or mechanism named | Specificity | 4 |
| Only broad-category keyword (e.g., just "AI" not "AI layoffs" or "Ozempic") | Trending Keyword | 5 |
| Tier 3 guest with no inherent topic authority | Authority Signal | 5 |
| First 5 words do not independently create intrigue (the hook is buried) | Front-Load Hook | 3 |

**ENFORCEMENT**: After scoring each dimension, check each cap condition.
If a cap applies, reduce the score to the cap value. This is mechanical,
not subjective — if the title says "AI" but not a specific AI trend, TK cap is 5.

### Scoring Dimensions (same weights, but CALIBRATED):

| Dimension | Points | The REAL test |
|-----------|--------|---------------|
| Curiosity Gap | /20 | Does it create a SPECIFIC question I need answered? Not "hmm interesting" but "WAIT WHAT?" If the question is vague, max 8. |
| Authority Signal | /15 | Would your MOM be impressed by this credential? If it requires explaining, max 5. If it's Tier 3, score the topic's inherent authority instead. |
| Emotional Trigger | /15 | Does it trigger a GUT reaction? Fear of missing out, fear of harm, outrage, shock? If the reaction is just "oh, neat" — max 6. |
| Trending Keyword | /10 | Is there a word/phrase people are ACTIVELY searching for right now? Not just "AI" (too broad) but "AI layoffs" or "Ozempic" or "vibe coding" (specific trending terms). |
| Specificity | /10 | Specific numbers, percentages, timeframes, mechanisms? "72 minutes" scores 10. "The future" scores 2. |
| Character Count | /10 | 50-65 chars = 10, 40-50 or 66-75 = 7, outside that = 4. |
| Word Balance | /10 | Does it sound like a HUMAN said it? Read it out loud. If it sounds like a robot wrote it, max 4. |
| Front-Load | /5 | First 5 words must create the hook. If the interesting part is at the end, max 2. |
| Thumbnail Complement | /5 | Does it add info that a face+emotion thumbnail doesn't already convey? |

### THE HONESTY CHECK (MANDATORY — 3 STEPS)

**Step 1: Upward comparison**
Ask: "If this title appeared next to the 95-score calibration example in
someone's feed, would it compete for the click?"
If no, the score CANNOT be above 70.

**Step 2: Downward comparison (CRITICAL — this prevents score inflation)**
Check if the title shares energy, structure, or vagueness with any LOW-scoring
benchmark (70 and below). Specifically:
- Does it resemble "Why Everyone Is Talking About AI Right Now" (70)?
  → Vague topic, no specific claim, empty urgency
- Does it resemble "AI Agents, Robot CEOs & The End of..." (55)?
  → Buzzword dump, conference panel energy
- Does it resemble "AI CEOs? Could a Model Run...Why It Matters" (50)?
  → Double question, hedging, filler tail
- Does it resemble "An AI Agent Emailed Us — They Wrote..." (40)?
  → Vague, anthropomorphizing cliche, no stakes

If the title shares the ENERGY of a low-scoring benchmark, cap the total
at that benchmark's score + 8 points. A title that resembles the 55-score
example cannot score above 63, regardless of dimension scores.

**Step 3: Sum sanity check**
After dimension scoring AND applying hard caps AND the comparisons above,
verify the total. If the total exceeds the nearest calibration benchmark
by more than 5 points, you MUST justify which specific quality makes it
better than the benchmark, or reduce the score to benchmark + 5.
`;
