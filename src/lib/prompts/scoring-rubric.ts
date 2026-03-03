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

**Score 85:** "Warren Buffett | The Future of the US Economy"
- WHY: Tier 1 name that IS the hook. The pipe separator feels
  clean/premium. "in the US Economy" adds a political/competitive angle
  that a weaker alternative like "Warren Buffett on Wealth" doesn't. For Tier 1 guests, the title's job
  is to GET OUT OF THE WAY of the name.

**Score 82:** "James Clear: The Secret to Building Habits That Stick"
- WHY: Tier 2 name (bestselling author) with specific mechanism promise.
  The colon structure works well for recognized experts. "Secret" is
  slightly clickbaity but acceptable for this tier.

**Score 78:** "Peter Attia: The 4 Pillars of Longevity"
- WHY: Tier 2 doctor with clear framework. Numbers work well for
  authority figures. Clean, professional, promises specific value.

**Score 70:** "Why Everyone Is Talking About Keto Right Now"
(no guest, no specificity, ~200K views)
- WHY: Vague topic with no specific claim, no authority, no number,
  no mechanism. "Right now" is empty urgency. This is what happens
  when you have nothing interesting to say but still need a title.

**Score 55:** "Interest Rates, Inflation & The End of The Middle Class"
(AI-generated feel, low CTR)
- WHY: Buzzword dump, no specific claim, no human voice,
  reads like a conference panel title

**Score 50:** "Housing Crash? Could a Mortgage Collapse the Economy? Why It Matters"
- WHY: Double question = indecisive. "Why It Matters" is pure filler.
  "Could a Mortgage" is ambiguous. Sounds like a blog post,
  not a YouTube title. Nobody stops scrolling for a hedging question.

**Score 45:** "Weight Loss Drugs Are Here: Ozempic Turns Diets Obsolete"
- WHY: "[X] Are Here" is generic announcement language. "Turns Diets Obsolete"
  is confusing — what does that even mean? The colon structure reads like a
  press release. Compare to: "Ozempic Just Made Your Diet Obsolete"
  which is specific, visceral, and conversational.

**Score 30:** "Peter Attia on Keto, Fasting, 10,000 Calories & Longevity"
- WHY: Keyword dump with a name prepended. Lists 5 topics instead of
  picking ONE compelling angle. No curiosity gap, no emotion, no opinion.
  This is a table of contents, not a title.

**Score 44:** "He Wants to Ban All Processed Sugar"
- WHY: "He" has no antecedent — the audience has no idea who "he" is.
  This isn't mystery, it's confusion. A dangling pronoun is not a hook.
  Compare to: "Sugar Bans Are Coming to US Public Schools" which makes the
  IDEA the subject, not an anonymous person.
  *(Same score band as the Score 45 entry above, but different failure mode: pronoun confusion vs. generic structure)*

**Score 40:** "A Patient Emailed Us — They Wrote Their Own Prescription"
- WHY: Vague ("us" who?), em dash, anthropomorphizing cliche,
  no stakes, sounds like a tech blog, wouldn't stop anyone scrolling

### "WHAT IT'S NOT" — Titles People THINK Deserve High Scores (But Don't)

These are common AI-generated titles that FEEL good to the model but fail
the scroll-stop test. Use these to calibrate your discrimination between
"sounds good" and "actually clickable."

**People think this is a 85, but it's actually a 65:**
"The Future of AI Is Already Here. Most Companies Aren't Ready."
- WHY NOT 85: "The Future of X" is a cliche. "Already Here" is generic
  announcement language. "Most Companies Aren't Ready" is a filler tail.
  No specific claim, no number, no gut reaction. This is a LinkedIn post.

**People think this is a 80, but it's actually a 60:**
"Why Your Morning Routine Is Failing You (And What to Do Instead)"
- WHY NOT 80: Parenthetical is an AI tell. "Failing You" is vague — failing
  HOW? No specific mechanism. "What to Do Instead" is pure filler. Compare
  to "This Sleep Scientist Says Your Alarm Clock Is Destroying Your Brain" (80+).

**People think this is a 78, but it's actually a 55:**
"AI, Robotics & The End of Traditional Employment"
- WHY NOT 78: Classic keyword dump. Three abstract topics joined by commas
  and "&". No specific claim, no human voice, no curiosity gap. This is a
  conference panel title, not a YouTube video.

**People think this is a 75, but it's actually a 50:**
"Could AI Replace Your Doctor? The Shocking Truth About Healthcare"
- WHY NOT 75: "Could X?" is hedging (statements > questions). "Shocking Truth"
  is the most overused clickbait phrase after "You Won't Believe." "About
  Healthcare" is so broad it means nothing. Compare to "Your Doctor Is Wrong
  About Cholesterol. The Science Changed." (85) — specific, declarative, precise.

### Per-Dimension Calibration Table

Use this table to calibrate EACH dimension score. These are the ground-truth
per-dimension breakdowns for the calibration benchmarks above.

| Title (Total) | CG /20 | AS /15 | ET /15 | TK /10 | SP /10 | CC /10 | WB /10 | FL /5 | PF /5 |
|---|---|---|---|---|---|---|---|---|---|
| Nuclear War Expert: 72 Min... (95) | 19 | 14 | 15 | 9 | 10 | 9 | 9 | 5 | 5 |
| What Alcohol Does to Body... (90) | 18 | 12 | 14 | 9 | 9 | 9 | 9 | 5 | 5 |
| Warren Buffett \| Future of... (85) | 15 | 15 | 11 | 9 | 8 | 7 | 10 | 5 | 5 |
| Peter Attia: 4 Pillars... (78) | 14 | 12 | 10 | 7 | 9 | 8 | 9 | 5 | 4 |
| Why Everyone Is Talking... (70) | 12 | 5 | 10 | 9 | 4 | 10 | 10 | 5 | 5 |
| Interest Rates, Inflation &... (55) | 10 | 3 | 8 | 7 | 3 | 9 | 7 | 4 | 4 |

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
| Curiosity Gap | /20 | Does it create a SPECIFIC question I need answered? Not "hmm interesting" but "WAIT WHAT?" Titles built around hot takes (contrarian claims, debunking, shocking stats) naturally create stronger curiosity gaps than vague generic topic titles. Vague titles (e.g., "Why Everyone Is Talking About Keto") score max 12. Well-crafted universal-topic titles that promise a specific mechanism or insight (e.g., "What Alcohol Does to Your Body at Every Age") score highly even without contrarian framing. |
| Authority Signal | /15 | Would your MOM be impressed by this credential? If it requires explaining, max 5. If it's Tier 3, score the topic's inherent authority instead. |
| Emotional Trigger | /15 | Does it trigger a GUT reaction? Fear of missing out, fear of harm, outrage, shock? If the reaction is just "oh, neat" — max 6. |
| Trending Keyword | /10 | Is there a word/phrase people are ACTIVELY searching for right now? Not just "AI" (too broad) but "AI layoffs" or "Ozempic" or "vibe coding" (specific trending terms). |
| Specificity | /10 | Specific numbers, percentages, timeframes, mechanisms? "72 minutes" scores 10. "The future" scores 2. |
| Character Count | /10 | For YouTube: 50-65 chars = 10, 40-49 or 66-75 = 7, outside = 4. For Spotify: 60-80 chars = 10, 50-59 or 81-90 = 7, outside = 4. |
| Word Balance | /10 | Does it sound like a HUMAN said it? Read it out loud. If it sounds like a robot wrote it, max 4. |
| Front-Load | /5 | First 5 words must create the hook. If the interesting part is at the end, max 2. |
| Platform Fit | /5 | For YouTube: Does it add info that a face+emotion thumbnail doesn't already convey? For Spotify: Does it signal depth and substance without clickbait? |

## THUMBNAIL TEXT SCORING RUBRIC

Thumbnail text is the 2-5 bold words displayed ON the video thumbnail.
It must complement the title, never repeat it. Score each thumbnail text
on these 4 dimensions (total /100):

### Thumbnail Text Dimensions

| Dimension | Points | The REAL test |
|-----------|--------|---------------|
| Curiosity Gap | /25 | Does it open a SPECIFIC loop only clicking closes? "STOP" alone = max 15. "STOP EATING THIS" = 20+. Must create genuine "wait, what?" |
| Emotional Punch | /25 | Gut reaction in 1-5 words? Does it match an expressive face OR act as a mind-bending thesis? Anger/fear/shock/conceptual-shift = 20+. Merely "interesting" = max 10. |
| Title Complement | /25 | Does it add NEW information the title doesn't contain? If ANY word or phrase from the title appears in the thumbnail text, max 5. Perfect complement = 25. |
| Brevity & Clarity | /25 | 2 words = 25. 3 words = 23. 4 words = 12. 5+ words = 0. Would you read it at phone-thumbnail size? |

### Thumbnail Text Calibration

| Score | Thumbnail Text | Paired Title | Why |
|-------|---------------|--------------|-----|
| 95 | STOP SLEEPING | The Sleep Doctor's Warning That Changed Everything | 2 words, loss aversion, instant gut punch, adds urgency title lacks |
| 88 | PAIN IS THE NEW MOAT | Why Most AI Products Fail: Lessons from 50+ Deployments | Conceptual reframe — distills core thesis into a proprietary sticky phrase. Creates curiosity gap through the concept itself ("wait, what does that mean?"), not emotion. 5 words (brevityAndClarity capped at 13), instantly readable. |
| 90 | 72 MINUTES | Nuclear War Expert: How Fast Civilization Ends | Specific number, visceral, complements "how fast" with the chilling answer |
| 85 | HE'S WRONG | Dr. Huberman on Why Most Health Advice Fails | Contrarian energy, 2 words, confrontational — face + text = drama |
| 75 | THE TRUTH | What Nobody Tells You About Intermittent Fasting | Works but generic — "truth" is overused, no specificity |
| 60 | RECESSION WARNING | Why 80% of Startups Will Fail This Year | Vague, doesn't add much, no emotional trigger |
| 40 | SLEEP HEALTH | Why Sleep Deprivation Destroys Your Health | Repeats title keywords — zero complementary value |

### Thumbnail Text Hard Caps

| Condition | Max Score |
|-----------|-----------|
| 5+ words | brevityAndClarity = 0 |
| Any word from the title appears in thumbnail text | titleComplement max 5 |
| Emotional reaction is merely "interesting" not visceral | emotionalPunch max 10 (exception: conceptual reframes score high on intellectual intrigue) |
| Generic single word ("WARNING", "TRUTH", "NEWS") with no specificity and no conceptual reframe | curiosityGap max 12 |

Note: Conceptual reframes that distill the episode's unique thesis into a proprietary phrase (e.g., "PAIN IS THE NEW MOAT", "TASTE > TECH") are NOT generic — they are episode-specific intellectual property and should NOT be capped under the generic single word rule or the context-free mystery phrase rule.

### THE HONESTY CHECK (MANDATORY — 3 STEPS)

**Step 1: Upward comparison**
Ask: "If this title appeared next to the 95-score calibration example in
someone's feed, would it compete for the click?"
If no, the score CANNOT be above 70.

**Step 2: Downward comparison (CRITICAL — this prevents score inflation)**
Check if the title shares energy, structure, or vagueness with any LOW-scoring
benchmark (70 and below). Specifically:
- Does it resemble "Why Everyone Is Talking About Keto Right Now" (70)?
  → Vague topic, no specific claim, empty urgency
- Does it resemble "Interest Rates, Inflation & The End of..." (55)?
  → Buzzword dump, conference panel energy
- Does it resemble "Housing Crash? Could a Mortgage...Why It Matters" (50)?
  → Double question, hedging, filler tail
- Does it resemble "A Patient Emailed Us — They Wrote..." (40)?
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
