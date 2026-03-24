# CLAUDE.md

## Project Overview

Podcast Copy Automation — an AI pipeline that generates optimized YouTube/Spotify titles, thumbnail text, descriptions, and chapters for podcast episodes. Next.js 16 App Router, React 19, TypeScript, Supabase, multi-model AI (OpenAI, Gemini, Minimax, Kimi).

## Build & Run

```bash
npm install
npm run dev          # Dev server at http://localhost:3000
npm run build        # Production build (must pass before committing)
npm run lint         # ESLint
```

## Testing

```bash
npx playwright test tests/ui/                           # UI tests
ENABLE_API_TESTS=true npx playwright test tests/api/    # API tests (needs running server + keys)
npx playwright test                                     # All tests
```

Playwright config: `playwright.config.ts` — chromium, base URL `http://localhost:3000`, 120s timeout.

## Key Architecture Decisions

- **SSE streaming**: `/api/generate` streams events (`status`, `pipeline_trace`, `pipeline_summary`, `complete`, `error`) — do NOT convert to REST
- **Multi-model generation**: Titles generated from 4+ models in parallel, then cross-family scored to eliminate self-enhancement bias
- **Dual scorer panel**: GPT scores Gemini-generated titles and vice versa
- **Pairwise tournament**: Final ranking via head-to-head LLM judging (not just score)
- **Guest tier system (0-3)**: Hard constraint on whether guest name appears in YouTube title — do NOT bypass
- **Guardrails are mandatory**: AI slop detection, tier compliance, and pre-flight checks are quality gates, not optional

## Request Format for /api/generate

```json
{
  "research": { "guest": { "name": "..." }, "brand": { "podcastName": "..." }, "guestTier": { "tier": 3 } },
  "transcript": "...",
  "episodeDescription": "...",
  "youtubeAnalysis": "..."
}
```

Required fields: `research`, `transcript`, `episodeDescription`. The `guestName`/`podcastName` are extracted from the `research` object, not sent as top-level fields.

## Database

Supabase (Postgres). Key tables: `generation_runs`, `title_results`, `model_performance`, `pipeline_logs`.

`insertTitleResults()` returns inserted IDs — these are attached to titles as `titleResultId` before the `complete` SSE event, enabling the human feedback component.

## Prompt System

All prompts live in `src/lib/prompts/`. The generation prompt (`generation-system.ts`) includes:
- Tier classification rules
- 4 title archetypes with calibration examples (16 total: 8 GOOD + 8 BAD)
- Banned structural patterns and AI slop phrases
- Channel-specific voice instructions
- Pre-flight self-check (5 mandatory tests before output)

Do NOT remove guardrails, tier system, or anti-hallucination rules. Expand constraints rather than remove them.

## Export Formats

`/api/export?runId=X&format=json|csv|markdown` — all three formats supported.

## File Conventions

- API routes: `src/app/api/[name]/route.ts`
- Components: `src/components/[name].tsx` (UI primitives in `src/components/ui/`)
- Types: `src/types/[domain].ts`
- Schemas (Zod): `src/lib/schemas/[name].ts`
- Prompts: `src/lib/prompts/[name]-system.ts`
- Guardrails: `src/lib/guardrails/[name].ts`
- Tests: `tests/api/` and `tests/ui/`

## gstack Skills — Auto-Use Policy

Skills are installed at `~/.claude/skills/`. Use the `Skill` tool to invoke them. **Do NOT wait for the user to type a slash command — invoke proactively whenever the trigger condition is met.**

### ALWAYS invoke automatically (no user prompt needed)

| Skill | Invoke when |
|---|---|
| `/investigate` | Any bug, error, unexpected behavior, or "why isn't this working" — never attempt a fix without root cause first |
| `/careful` | Any destructive operation: `DROP TABLE`, migrations, `rm -rf`, `git reset --hard`, prod data changes |
| `/review` | After completing any set of code changes, before suggesting a commit or PR |
| `/qa` | After implementing or fixing any UI feature — verify it actually works in the browser |
| `/design-review` | After any component or UI change — visual QA before declaring done |
| `/plan-eng-review` | Whenever a plan or architecture is being discussed before writing code — catch issues early |
| `/cso` | When adding auth, API endpoints, handling user data, modifying env vars, or any security-adjacent change |

### Proactively suggest (confirm with user before running)

| Skill | Suggest when |
|---|---|
| `/ship` | User signals code is ready, says "done", or asks about deploying/merging |
| `/autoplan` | Starting a multi-step feature — full review pipeline before coding |
| `/plan-ceo-review` | Strategic or product-level decisions being made |
| `/plan-design-review` | UI feature planned but not yet built |
| `/canary` | After a deployment — suggest post-deploy monitoring |
| `/retro` | After completing a significant feature or sprint |
| `/document-release` | After shipping — suggest updating docs |
| `/codex` | Complex architectural decision — suggest second opinion |
| `/benchmark` | Performance-sensitive code changes |
| `/office-hours` | User is stuck on strategy, direction, or product decisions |

### Manual-only (only run when user explicitly invokes)

`/gstack`, `/browse`, `/land-and-deploy`, `/freeze`, `/unfreeze`, `/guard`, `/setup-deploy`, `/setup-browser-cookies`, `/gstack-upgrade`

### Rules

1. **Every conversation**: At the start of each session, scan the context for any applicable auto-invoke triggers above and run them before proceeding with other work.
2. **Never skip `/review`** after code changes — it is mandatory before any commit suggestion.
3. **Never skip `/investigate`** when debugging — no fixes without root cause.
4. **Skill files**: `/Users/rohan/.claude/skills/<skillname>/SKILL.md` — read these if you need to understand what a skill does before invoking.

## Environment Variables

Required: `OPENAI_API_KEY`, `MINIMAX_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Optional (enable additional models): `GOOGLE_API_KEY`, `NVIDIA_API_KEY`

Model overrides: `GENERATION_MODEL`, `SCORING_MODEL`, `GEMINI_GENERATION_MODEL`, `GEMINI_SCORING_MODEL`, `PAIRWISE_JUDGE_MODEL`, `DESCRIPTION_MODEL_GOOGLE`, `RESEARCH_MODEL`, `MINIMAX_GENERATION_MODEL`, `KIMI_MODEL`
