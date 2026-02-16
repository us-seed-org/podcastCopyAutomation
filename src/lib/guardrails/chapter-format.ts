import type { GuardrailResult } from "./ai-slop";

export function checkChapterFormat(
  chapters: Array<{ timestamp: string; title: string }>
): GuardrailResult {
  const violations: string[] = [];

  if (chapters.length === 0) {
    violations.push("No chapters provided");
    return { passed: false, violations };
  }

  // First chapter must start at 0:00 (accept any zero-equivalent timestamp)
  const firstTs = chapters[0].timestamp;
  if (!/^0+(?::0+)*(?:\.0+)?$/.test(firstTs)) {
    violations.push(`First chapter must start at 0:00, got "${firstTs}"`);
  }

  for (const chapter of chapters) {
    const { title, timestamp } = chapter;

    // No em dashes
    if (title.includes("\u2014")) {
      violations.push(`Chapter "${timestamp} ${title}" contains em dash`);
    }

    // No en dashes
    if (title.includes("\u2013")) {
      violations.push(`Chapter "${timestamp} ${title}" contains en dash`);
    }

    // No arrow characters
    if (/[\u2192\u279C\u2794]/.test(title)) {
      violations.push(`Chapter "${timestamp} ${title}" contains arrow character`);
    }

    // No semicolons
    if (title.includes(";")) {
      violations.push(`Chapter "${timestamp} ${title}" contains semicolon`);
    }

    // No parenthetical annotations
    if (/\([^)]*\)/.test(title)) {
      violations.push(`Chapter "${timestamp} ${title}" contains parenthetical annotation`);
    }

    // Length check: 25-50 characters
    if (title.length < 25) {
      violations.push(
        `Chapter "${timestamp} ${title}" is too short (${title.length} chars, need 25-50)`
      );
    }
    if (title.length > 50) {
      violations.push(
        `Chapter "${timestamp} ${title}" is too long (${title.length} chars, need 25-50)`
      );
    }
  }

  return { passed: violations.length === 0, violations };
}
