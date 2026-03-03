export interface GuardrailResult {
  passed: boolean;
  violations: string[];
}

const BANNED_PUNCTUATION: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\u2014/, label: "Em dash (\u2014)" },
  { pattern: /;/, label: "Semicolon" },
  { pattern: /!.*!/, label: "Multiple exclamation marks" },
  { pattern: /\u2013/, label: "En dash (\u2013)" },
  { pattern: /\u2192|\u279C|\u2794/, label: "Arrow character" },
];

const BANNED_PHRASES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bdelve\b/i, label: '"delve"' },
  { pattern: /\bdive deep\b/i, label: '"dive deep"' },
  { pattern: /\bunpack\b/i, label: '"unpack"' },
  { pattern: /\blandscape\b/i, label: '"landscape"' },
  { pattern: /\bparadigm shift\b/i, label: '"paradigm shift"' },
  { pattern: /\bwhy it matters\b/i, label: '"Why It Matters"' },
  { pattern: /\bwhy you should care\b/i, label: '"Why You Should Care"' },
  { pattern: /\bwhat you need to know\b/i, label: '"What You Need to Know"' },
  { pattern: /\bwhat comes next\b/i, label: '"What Comes Next"' },
  { pattern: /\bwhat it means for\b/i, label: '"What It Means For"' },
  { pattern: /\bare here\b/i, label: '"Are Here" (generic announcement)' },
  { pattern: /\bhas arrived\b/i, label: '"Has Arrived"' },
  { pattern: /\bjust changed everything\b/i, label: '"Just Changed Everything"' },
  { pattern: /\bhere'?s what they'?re not telling you\b/i, label: '"Here\'s What They\'re Not Telling You"' },
  { pattern: /& co\./i, label: '"& Co."' },
  { pattern: /\bwrote their own\b/i, label: '"Wrote Their Own" (anthropomorphizing)' },
];

// Check for keyword dump patterns: 3+ topics with commas and &
const KEYWORD_DUMP_PATTERN = /[A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z][a-z]+(?:\s[A-Z][a-z]+)*(?:\s*(?:,|&)\s*[A-Z][a-z]+(?:\s[A-Z][a-z]+)*)+/;

function truncateText(text: string, maxLength = 100): string {
  return text.length > maxLength ? text.slice(0, maxLength) + "\u2026" : text;
}

export function checkAiSlop(texts: string[]): GuardrailResult {
  const violations: string[] = [];

  for (const text of texts) {
    for (const { pattern, label } of BANNED_PUNCTUATION) {
      if (pattern.test(text)) {
        violations.push(`"${truncateText(text)}" contains banned punctuation: ${label}`);
      }
    }

    for (const { pattern, label } of BANNED_PHRASES) {
      if (pattern.test(text)) {
        violations.push(`"${truncateText(text)}" contains banned phrase: ${label}`);
      }
    }

    if (KEYWORD_DUMP_PATTERN.test(text)) {
      violations.push(`"${truncateText(text)}" looks like a keyword dump (3+ comma-separated topics)`);
    }

    // Double question check
    const questionMarks = (text.match(/\?/g) || []).length;
    if (questionMarks >= 2) {
      violations.push(`"${truncateText(text)}" contains double questions (${questionMarks} question marks)`);
    }
  }

  return { passed: violations.length === 0, violations };
}

export function checkChapterTitles(chapterTitles: string[]): GuardrailResult {
  const violations: string[] = [];

  for (const title of chapterTitles) {
    // Ban em dashes
    if (/\u2014/.test(title)) {
      violations.push(`Chapter "${title}" contains em dash`);
    }
    // Ban en dashes
    if (/\u2013/.test(title)) {
      violations.push(`Chapter "${title}" contains en dash`);
    }
    // Ban semicolons
    if (/;/.test(title)) {
      violations.push(`Chapter "${title}" contains semicolon`);
    }
    // Ban arrow characters
    if (/[\u2192\u279C\u2794]/.test(title)) {
      violations.push(`Chapter "${title}" contains arrow character`);
    }
    // Ban parenthetical annotations
    if (/\(.*\)/.test(title)) {
      violations.push(`Chapter "${title}" contains parenthetical annotation`);
    }
    // Ban meta-references like "9 chapters of X"
    if (/\d+\s*chapters?\s*of/i.test(title)) {
      violations.push(`Chapter "${title}" contains meta-reference`);
    }
    // Ban vague labels
    const vaguePatterns = [
      /^discussion about/i,
      /^wrap\s*[+&]/i,
      /^intro\s*[&+]/i,
      /^closing thoughts/i,
      /^final thoughts/i,
      /^overview of/i,
    ];
    for (const pattern of vaguePatterns) {
      if (pattern.test(title)) {
        violations.push(`Chapter "${title}" is a vague label, not a hook`);
        break;
      }
    }
    // Character count check (10-60 target)
    if (title.length > 60) {
      violations.push(`Chapter "${title}" is ${title.length} chars (max 60)`);
    }
    if (title.length < 10) {
      violations.push(`Chapter "${title}" is only ${title.length} chars (too short to be a hook)`);
    }
  }

  return { passed: violations.length === 0, violations };
}

export function checkThumbnailText(
  thumbnailTexts: Array<{ thumbnailText: string; title: string }>
): GuardrailResult {
  const violations: string[] = [];

  for (const { thumbnailText, title } of thumbnailTexts) {
    const words = thumbnailText.trim().split(/\s+/);

    if (words.length > 4) {
      violations.push(
        `Thumbnail text "${thumbnailText}" has ${words.length} words (max 4)`
      );
    }

    if (words.length < 2 && thumbnailText.trim().length > 0) {
      violations.push(
        `Thumbnail text "${thumbnailText}" has only ${words.length} word (min 2)`
      );
    }

    if (thumbnailText.length > 25) {
      violations.push(
        `Thumbnail text "${thumbnailText}" is ${thumbnailText.length} chars (max 25)`
      );
    }

    // Check for title repetition — any word 4+ chars from title appearing in thumbnail text
    const titleWords = title
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 4);
    const thumbWords = thumbnailText
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 4);
    const repeated = thumbWords.filter((tw) => titleWords.includes(tw));
    if (repeated.length > 0) {
      violations.push(
        `Thumbnail text "${thumbnailText}" repeats word(s) from title: ${repeated.join(", ")}`
      );
    }

    // Check banned punctuation
    if (/\u2014/.test(thumbnailText)) {
      violations.push(`Thumbnail text "${thumbnailText}" contains em dash`);
    }
    if (/;/.test(thumbnailText)) {
      violations.push(`Thumbnail text "${thumbnailText}" contains semicolon`);
    }
  }

  return { passed: violations.length === 0, violations };
}
