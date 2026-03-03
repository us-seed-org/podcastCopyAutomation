# Refactor Prompt — COMPLETED

> **Status**: This task has been completed. The prompt refactoring described below was implemented and verified.

## What Was Done

The generation prompt (`src/lib/prompts/generation-system.ts`) was refactored to close the quality gap between our AI-generated titles/thumbnails and ground-truth publisher copy (e.g., "Pain is the new moat" + "Why most AI products fail").

### Changes Made

1. **Thumbnail text**: Added conceptual reframe category alongside emotional verdicts. The prompt now teaches three categories: emotional verdicts, conceptual reframes (highest ceiling), and specific revelations.
2. **Title archetypes**: Four archetypes (authority_shocking, mechanism_outcome, curiosity_gap, negative_contrarian) with calibration examples showing good vs. bad execution.
3. **Pre-flight self-check**: 5 mandatory quality tests before output.
4. **Scoring rubric**: 9-dimension scoring (100 points total) with cross-family dual-scorer panel to eliminate self-enhancement bias.
5. **Guardrails preserved**: AI slop detection, tier compliance, banned structural patterns all intact.

### Verification

- Build passes (`npm run build`)
- Rewrite rate targets < 30% with calibration examples active
- Thumbnail text diversity includes conceptual reframes, not just emotional reactions

## Current State

See `readme.md` for full project documentation and `CLAUDE.md` for development conventions.
