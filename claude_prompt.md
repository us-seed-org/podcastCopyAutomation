# Claude Code — Podcast Copy Automation

> **Status**: This file was previously a one-time task prompt for refactoring the generation prompt. That work is complete. See `CLAUDE.md` for current project instructions and `readme.md` for full documentation.

## What Was Done

The generation prompt (`src/lib/prompts/generation-system.ts`) was refactored to:

1. **Expand thumbnail text categories** — Added conceptual reframes and specific revelations alongside emotional verdicts. Thumbnail text like "PAIN IS THE NEW MOAT" is now a valid and encouraged pattern.
2. **Add calibration examples** — 16 examples (4 archetypes x 2 GOOD + 2 BAD) with explicit WHY IT WORKS/FAILS reasoning.
3. **Add pre-flight self-check** — 5 mandatory tests (Scroll, AI Slop, Tier Compliance, Specificity, Thumbnail Harmony) that every title must pass before output.
4. **Diversify title angles** — Reduced over-reliance on single stats by encouraging varied authority signals, mechanisms, and curiosity hooks.
5. **Preserve guardrails** — Anti-hallucination rules, tier system, AI slop detection, and banned patterns all remain intact.

## Current Development Workflow

See `CLAUDE.md` for project conventions, build commands, and architecture decisions.
