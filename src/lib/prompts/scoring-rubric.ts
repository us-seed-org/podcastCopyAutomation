export const SCORING_RUBRIC = `
## SCORING RUBRIC (Externally Calibrated)

### Tier Definitions (for Authority Signal scoring)
- **Tier 1**: Household names that need no explanation (e.g., "Sam Altman", "Elon Musk", "Taylor Swift")
- **Tier 2**: Industry-recognized names within their field (e.g., "Dr. Andrew Huberman", "Lex Fridman")
- **Tier 3**: Niche experts or unknown guests — score the topic's inherent authority instead

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

### THE HONESTY CHECK
After scoring, ask: "If this title appeared next to the 95-score calibration
example in someone's feed, would it compete for the click?"
If no, your score is too high. Reduce by 10-15 points.
`;
