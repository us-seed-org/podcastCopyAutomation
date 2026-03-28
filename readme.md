# Podcast Copy Automation

AI-powered pipeline that generates optimized YouTube titles, Spotify titles, thumbnail text, descriptions, and chapter timestamps for podcast episodes. Uses multi-model generation with scoring guardrails, pairwise ranking, and human feedback loops.

## Quick Start

```bash
npm install
cp .env.example .env.local   # fill in API keys
npm run dev                   # http://localhost:3000
```

## Architecture

```
User uploads transcript + metadata
        ↓
  Research Phase (guest/podcast context)
        ↓
  YouTube Analysis (competitive data)
        ↓
  Multi-Model Generation (4 archetypes × N models)
        ↓
  Dual-Scorer Panel (GPT + Gemini cross-family scoring)
        ↓
  Guardrails (AI slop detection, tier compliance, dedup)
        ↓
  Pairwise Tournament (head-to-head ranking)
        ↓
  Description & Chapter Generation
        ↓
  Results Dashboard + Human Feedback
```

### Pipeline Passes

| Pass | What Happens |
|------|-------------|
| 1 | Multi-model title generation (Gemini 3.1 Pro, Gemini Flash, Minimax, Kimi) |
| 2 | Scoring + guardrail filtering + thumbnail refinement |
| 3 | Pairwise tournament ranking |
| 4 | Description, chapters, and SEO keyword generation |

### Title Archetypes

- **Authority + Shocking** — Credential + contrarian claim
- **Mechanism + Outcome** — Specific method + result
- **Curiosity Gap** — Unanswered question the viewer must click to resolve
- **Negative Contrarian** — Commands against a trend + backs it with evidence

### Thumbnail Archetypes

- **Gut Punch** — Emotional reaction text
- **Label** — Category or identity label
- **Alarm** — Urgency/warning text
- **Confrontation** — Direct challenge

## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript 5
- **AI**: Vercel AI SDK (`ai` v6) with OpenAI, Google Gemini, Minimax, Nvidia/Kimi
- **Database**: Supabase (Postgres) — stores runs, title results, ratings, pipeline logs
- **UI**: Tailwind CSS 4, shadcn/ui, Radix primitives, Lucide icons
- **Testing**: Playwright (E2E + API tests)

## Project Structure

```
src/
├── app/
│   ├── generate/page.tsx              # Main generation UI
│   ├── runs/                          # Historical runs browser
│   └── api/
│       ├── generate/route.ts          # Pipeline orchestrator (SSE streaming)
│       ├── export/route.ts            # Export as JSON, CSV, or Markdown
│       ├── rate/route.ts              # Human feedback (star ratings + notes)
│       ├── research/route.ts          # Guest/podcast research
│       ├── runs/route.ts              # List/fetch saved runs
│       └── youtube-analysis/route.ts  # YouTube competitive analysis
├── components/
│   ├── input-form.tsx                 # Transcript + metadata input
│   ├── results-dashboard.tsx          # Title cards, scores, descriptions
│   ├── title-card.tsx                 # Individual title with score breakdown
│   ├── human-feedback.tsx             # Star rating + notes per title
│   ├── pipeline-trace.tsx             # Real-time pipeline event log
│   ├── pipeline-summary.tsx           # Post-run statistics dashboard
│   ├── pipeline-status.tsx            # Progress indicator
│   └── ui/                            # shadcn/ui primitives
├── hooks/
│   └── use-generation-pipeline.ts     # Client-side state management (useReducer)
├── lib/
│   ├── ai.ts                          # Model provider configuration
│   ├── supabase.ts                    # Database client
│   ├── pipeline-logger.ts             # Structured pipeline event logging
│   ├── pairwise-tournament.ts         # Head-to-head title ranking
│   ├── prompts/
│   │   ├── generation-system.ts       # Title generation prompt (archetypes, calibration examples, pre-flight checks)
│   │   ├── scoring-system.ts          # Scoring prompt (9-dimension rubric)
│   │   ├── scoring-rubric.ts          # Shared rubric definition
│   │   ├── description-chapter-system.ts
│   │   ├── thumbnail-refinement-system.ts
│   │   ├── pairwise-system.ts
│   │   └── research-system.ts
│   ├── schemas/                       # Zod schemas for structured AI output
│   └── guardrails/
│       ├── ai-slop.ts                 # Banned phrase / pattern detection
│       ├── tier-compliance.ts         # Guest tier → name usage rules
│       └── chapter-format.ts          # Timestamp format validation
└── types/
    ├── generation.ts                  # TitleOption, ScoreBreakdown, GenerationOutput
    ├── pipeline.ts                    # Pipeline state, actions, reducer types
    ├── pipeline-trace.ts              # PipelineTraceEntry, PipelineSummary
    ├── research.ts                    # Research output types
    └── youtube.ts                     # YouTube analysis types
```

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key (GPT scoring) |
| `MINIMAX_API_KEY` | Minimax API key (generation model) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_API_KEY` | — | Enables Gemini models (generation, scoring, pairwise, descriptions) |
| `NVIDIA_API_KEY` | — | Enables Kimi model via Nvidia |
| `GENERATION_MODEL` | `gemini-3.0-flash` | Primary generation model |
| `GEMINI_GENERATION_MODEL` | `gemini-3.1-pro-preview` | Premium Gemini generation |
| `MINIMAX_GENERATION_MODEL` | `minimax-m2.7` | Minimax generation model |
| `KIMI_MODEL` | `kimi-k2.5` | Kimi generation model |
| `SCORING_MODEL` | `gpt-5.2` | Primary scorer |
| `GEMINI_SCORING_MODEL` | `gemini-3.1-pro-preview` | Secondary scorer (dual-panel) |
| `PAIRWISE_JUDGE_MODEL` | `gemini-3.1-pro-preview` | Pairwise tournament judge |
| `DESCRIPTION_MODEL_GOOGLE` | `gemini-3.1-pro-preview` | Description generation |
| `RESEARCH_MODEL` | `gemini-3.0-flash` | Research phase model |

## API Endpoints

### `POST /api/generate`

Streams SSE events through the full pipeline. Request body:

```json
{
  "research": { "guest": { "name": "..." }, "brand": { "podcastName": "..." }, "guestTier": { "tier": 3 } },
  "transcript": "...",
  "episodeDescription": "...",
  "youtubeAnalysis": "..."  // optional
}
```

SSE event types: `status`, `pipeline_trace`, `pipeline_summary`, `pipeline_warning`, `complete`, `error`

The `complete` event payload includes `titleResultId` on each title for use with the `/api/rate` endpoint.

### `POST /api/rate`

Save human feedback for a title.

```json
{ "titleResultId": "uuid", "humanRating": 4, "humanNotes": "Great hook" }
```

### `GET /api/export?runId=X&format=json|csv|markdown`

Export a saved run. Formats:
- **json** (default): Full structured copy sheet
- **csv**: Flat table of all titles with scores
- **markdown**: Structured document with titles, descriptions, chapters, and pipeline summary

### `GET /api/runs`

List saved generation runs.

### `POST /api/research`

Run the research phase independently.

### `POST /api/youtube-analysis`

Run YouTube competitive analysis independently.

## Scoring System

Titles are scored on 9 dimensions (0-100 total):

| Dimension | Max | What It Measures |
|-----------|-----|-----------------|
| Curiosity Gap | 20 | Does it create an unanswered question? |
| Authority Signal | 15 | Credential, brand, or famous name? |
| Emotional Trigger | 15 | Fear, shock, curiosity, aspiration? |
| Trending Keyword | 10 | Currently trending buzzword? |
| Specificity | 10 | Specific numbers, mechanisms? |
| Character Count | 10 | Optimal 50-65 chars |
| Word Balance | 10 | Common/uncommon/emotional/power word mix |
| Front-Load Hook | 5 | Hook in first 50 characters? |
| Platform Fit | 5 | Appropriate for YouTube vs Spotify? |

Thumbnail text is separately scored on: Curiosity Gap, Emotional Punch, Title Complement, Brevity & Clarity.

## Guest Tier System

| Tier | Who | YouTube Title Strategy |
|------|-----|----------------------|
| 0 | Unknown guest | Topic-only, no name/credentials |
| 1 | Niche expert | Lead with name |
| 2 | Industry known | Use credential, not name |
| 3 | Household name | Name is the hook |

## Quality Guardrails

- **AI Slop Detection**: Blocks banned phrases ("reveals", "shocking", "mind-blowing", "game-changing", "you need to know", "the truth about")
- **Tier Compliance**: Validates guest name usage matches their tier
- **Thumbnail Text Validation**: Enforces length limits and banned patterns
- **Chapter Format Validation**: Ensures proper timestamp formatting
- **Pre-flight Self-Check**: 5 mandatory tests before output (Scroll, AI Slop, Tier Compliance, Specificity, Thumbnail Harmony)
- **Calibration Examples**: 16 examples (4 archetypes x 2 GOOD + 2 BAD) guide the model

## Pipeline Observability

The generation pipeline emits structured trace events in real-time via SSE:

- **Pipeline Trace Panel**: Color-coded event log (generated, scored, rejected, rewritten, selected, guardrail violations, dedup, thumbnail refined, pairwise results)
- **Pipeline Summary**: Post-run statistics (total generated/selected, rewrite rate, duration, weak dimensions, model breakdown)
- **LIVE indicator**: Animated badge during active generation
- **Database logging**: All trace entries and summaries persisted to Supabase

## Human Feedback

Each title card includes a star rating (1-5) and optional notes field. Feedback is saved to the `title_results` table via `/api/rate`. The `titleResultId` is populated from the database insert during the generation pipeline.

## Testing

```bash
# UI tests
npx playwright test tests/ui/

# API tests (requires running server + API keys)
ENABLE_API_TESTS=true npx playwright test tests/api/

# All tests
npx playwright test

# Build check
npm run build
```

## Database Schema (Supabase)

Key tables:
- `generation_runs` — Run metadata (guest, podcast, status, duration, summaries)
- `title_results` — Individual titles with scores, ratings, and selection status
- `model_performance` — Per-model generation stats
- `pipeline_logs` — Structured trace entries per run
