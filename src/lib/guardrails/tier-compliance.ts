import type { GuardrailResult } from "./ai-slop";

export function checkTierCompliance(
  guestName: string,
  tier: number,
  credential: string | undefined,
  youtubeTitles: string[]
): GuardrailResult {
  const violations: string[] = [];
  const nameLower = guestName.toLowerCase();

  // Split on common separators to get individual name parts (first, last)
  const nameParts = guestName
    .split(/[\s,]+/)
    .filter((p) => p.length >= 2)
    .map((p) => p.toLowerCase());

  const credentialLower = credential?.toLowerCase();
  const credentialParts = credential
    ?.split(/[\s,]+/)
    .filter((p) => p.length >= 2)
    .map((p) => p.toLowerCase());

  for (const title of youtubeTitles) {
    const titleLower = title.toLowerCase();

    if (tier === 0) {
      // Tier 0: Same as Tier 3 — NO guest name or credential in YouTube titles
      const mentionsName = nameParts.some((part) => titleLower.includes(part));
      if (mentionsName) {
        violations.push(
          `Tier 0 violation: YouTube title "${title}" mentions guest name "${guestName}" — must be topic-only`
        );
      }
      if (credentialLower && credentialParts) {
        const mentionsCredential = credentialParts.some(
          (part) => titleLower.includes(part)
        );
        if (mentionsCredential) {
          violations.push(
            `Tier 0 violation: YouTube title "${title}" mentions guest credential "${credential}" — must be topic-only`
          );
        }
      }
    }

    if (tier === 3) {
      // Tier 3: NO guest name or credential in YouTube titles
      const mentionsName = nameParts.some((part) => titleLower.includes(part));
      if (mentionsName) {
        violations.push(
          `Tier 3 violation: YouTube title "${title}" mentions guest name "${guestName}" — must be topic-only`
        );
      }
      if (credentialLower && credentialParts) {
        const mentionsCredential = credentialParts.some(
          (part) => titleLower.includes(part)
        );
        if (mentionsCredential) {
          violations.push(
            `Tier 3 violation: YouTube title "${title}" mentions guest credential "${credential}" — must be topic-only`
          );
        }
      }
    }

    if (tier === 2) {
      // Tier 2: Use credential only, NOT the actual name
      const mentionsFullName = titleLower.includes(nameLower);
      if (mentionsFullName) {
        violations.push(
          `Tier 2 violation: YouTube title "${title}" uses guest's full name instead of credential`
        );
      }
    }
  }

  return { passed: violations.length === 0, violations };
}
