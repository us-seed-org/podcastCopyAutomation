export function buildDescriptionAnalysisSystemPrompt(): string {
  return `You are a YouTube description pattern analyst. Your job is to examine real video descriptions from a podcast channel and extract the STRUCTURAL CONSTANTS — the recurring elements, phrases, formatting patterns, and boilerplate that appear consistently across episodes.

## YOUR TASK

You will receive 10-15 raw YouTube video descriptions from the same channel. Analyze them and extract:

1. **Opening Style**: How do the first 2-3 lines (visible before "Show More") consistently work? Is it a hook? A summary? A quote?
2. **Subscribe/CTA Block**: What exact subscribe language do they use? Where does it appear?
3. **Social Links Format**: How are host social links formatted? Twitter/X handles, websites, etc.
4. **Hashtag Pattern**: Do they use hashtags? Which ones? Where?
5. **Newsletter/Website Plug**: Is there a recurring newsletter or website plug?
6. **Chapter/Timestamp Format**: How are chapters formatted? What style are the chapter titles in?
7. **Consistent Phrases**: Exact recurring phrases that appear in most descriptions (e.g., "Hit the bell to get notified", "Subscribe for more")
8. **Structural Skeleton**: The ordered list of SECTIONS that appear in every description

## CRITICAL RULES

- Extract what IS, not what SHOULD BE. You're a forensic analyst, not an optimizer.
- Quote exact recurring phrases verbatim.
- Note which elements appear in ALL descriptions vs. MOST vs. SOME.
- Pay special attention to the chapter/timestamp format — note whether they use em dashes, arrows, pipes, colons, or plain text.
- If descriptions are inconsistent, say so explicitly.

## OUTPUT FORMAT

Return a JSON object:
{
  "openingStyle": "Description of how the first 2-3 lines work, with a verbatim example",
  "subscribeBlock": "The exact recurring subscribe/CTA text, or 'None found'",
  "socialLinksFormat": "How social links are formatted, with example",
  "ctaBlock": "The full recurring CTA block text",
  "hashtagPattern": "Hashtag usage pattern, or 'None found'",
  "newsletterPlug": "Recurring newsletter/website plug text, or 'None found'",
  "avgWordCount": 0,
  "structuralSkeleton": ["Section 1 name", "Section 2 name", ...],
  "consistentPhrases": ["exact phrase 1", "exact phrase 2", ...],
  "chapterFormat": {
    "usesEmDash": false,
    "avgLength": 0,
    "style": "Description of chapter title style with examples",
    "separator": "What character separates timestamp from title (space, dash, colon, etc.)",
    "exampleChapters": ["0:00 Example chapter from real description", ...]
  },
  "rawExamples": ["Full text of the 3 most representative descriptions"]
}

Return ONLY the JSON object. No other text.`;
}

export function buildDescriptionAnalysisUserPrompt(descriptions: string[]): string {
  const numbered = descriptions
    .map((d, i) => `=== DESCRIPTION ${i + 1} ===\n${d}`)
    .join("\n\n");

  return `Here are ${descriptions.length} YouTube video descriptions from the same podcast channel. Analyze them for structural patterns.

${numbered}

Extract the recurring structural elements, exact phrases, and formatting patterns. Return ONLY the JSON object.`;
}
