export const SCORING_RUBRIC = `
## TITLE SCORING RUBRIC (100 points total)

You MUST score every title against this rubric. Every title must achieve 80+ or be internally rewritten until it does.

### 1. Curiosity Gap (0-20 points)
- 18-20: Creates a SPECIFIC unanswered question the viewer MUST click to resolve. Uses open loops, incomplete information, or counterintuitive claims.
  Example: "The Sleep Trick That Reversed My Diabetes" (What trick? How?)
- 14-17: Creates moderate curiosity but the gap could be more specific.
- 8-13: Mild curiosity. Viewer can guess the answer.
- 0-7: No curiosity gap. Title is purely descriptive.

### 2. Authority Signal (0-15 points)
- 13-15: Leverages recognizable expert name, credential, or brand that instantly signals credibility.
  Example: "Harvard Neuroscientist", "Navy SEAL", "Billionaire CEO"
- 9-12: Has authority but it's not instantly recognizable to most viewers.
- 5-8: Weak authority signal. Generic title like "Doctor" or "Expert."
- 0-4: No authority signal.

### 3. Emotional Trigger (0-15 points)
- 13-15: Triggers a STRONG primary emotion — fear, shock, outrage, deep curiosity, or urgent aspiration.
  Words that score high: "destroyed", "ruined", "secret", "banned", "warning", "shocking truth"
- 9-12: Moderate emotional response. Interesting but not compelling.
- 5-8: Mild emotional engagement.
- 0-4: Emotionally flat. Purely informational.

KEY INSIGHT: Negative sentiment titles get 22% more views on average. Loss aversion ("What you're losing") outperforms gain framing ("What you could gain") by 2-3x in CTR.

### 4. Trending Keyword (0-10 points)
- 8-10: Contains a currently trending or high-search-volume keyword in the niche.
- 5-7: Contains an evergreen keyword with consistent search volume.
- 2-4: Keyword present but low search relevance.
- 0-1: No relevant keywords.

### 5. Specificity (0-10 points)
- 8-10: Contains specific numbers, percentages, timeframes, or mechanisms.
  Example: "3 Foods That Kill 90% of Cancer Cells" vs "Foods That Fight Cancer"
- 5-7: Some specificity but could be more concrete.
- 2-4: Vague. Uses words like "some", "many", "things".
- 0-1: Completely generic.

INSIGHT: Specific numbers signal credibility. "7 habits" outperforms "habits" by 3x in CTR.

### 6. Character Count (0-10 points)
**YouTube**: Optimal 50-65 characters (visible without truncation)
- 10: 50-65 characters
- 7: 66-80 characters
- 5: 40-49 characters
- 3: 81+ characters (gets truncated)

**Spotify**: Optimal 60-80 characters
- 10: 60-80 characters
- 7: 50-59 characters
- 5: 81-100 characters
- 3: 100+ characters

### 7. Word Balance (0-10 points)
Optimal mix: 20-30% common words, 10-20% uncommon words, 10-15% emotional words, 1+ power words.
- 8-10: Perfect balance. Title flows naturally while using power/emotional words.
  Power words: "secret", "shocking", "devastating", "ultimate", "proven", "hidden"
  Emotional words: "heartbreaking", "terrifying", "incredible", "life-changing"
- 5-7: Decent balance but could improve one category.
- 2-4: Imbalanced. Too many common words or too forced.
- 0-1: All common words or incomprehensible word salad.

### 8. Front-Load Hook (0-5 points)
- 4-5: The hook/intrigue is in the FIRST 50 characters (visible in search results and notifications).
- 2-3: Hook appears but is buried in the middle/end.
- 0-1: No clear hook, or hook is cut off in previews.

### 9. Thumbnail Complement (0-5 points)
- 4-5: Title adds information that a thumbnail CANNOT show. Title + thumbnail tell different parts of the story.
  Good: Thumbnail shows shocked face, title reveals WHY they're shocked.
- 2-3: Title partially overlaps with likely thumbnail content.
- 0-1: Title and thumbnail would be redundant.

## SCORE CALIBRATION
- 95-100: Viral potential. Would perform in top 1% of niche.
- 85-94: Strong performer. Expect above-average CTR.
- 75-84: Decent. Will perform at or slightly above average.
- Below 75: REWRITE. Do not output any title scoring below 80.
`;
