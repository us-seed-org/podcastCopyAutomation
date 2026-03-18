# Repository Guidelines

## Project Structure & Module Organization
Core code lives in `src/`:
- `src/app/`: Next.js App Router pages and API routes (`src/app/api/**/route.ts`).
- `src/components/`: UI and feature components (shadcn/ui primitives under `src/components/ui`).
- `src/hooks/`: client hooks (`use-*.ts`) for pipeline state and orchestration.
- `src/lib/`: AI providers, prompts, schemas, guardrails, and shared utilities.
- `src/types/`: shared TypeScript domain types.

Tests are in `tests/`:
- `tests/ui/` for browser flows
- `tests/api/` for endpoint-level checks
- `tests/smoke.spec.ts` for basic app health

Static assets are in `public/`. One-off scripts live in `scripts/`.

## Build, Test, and Development Commands
- `npm install`: install dependencies (Node `20.x` required).
- `npm run dev`: start local app at `http://localhost:3000`.
- `npm run build`: production build (`LIGHTNING_CSS_USE_WASM=1` set by script).
- `npm run start`: run production server.
- `npm run lint`: run ESLint (Next.js + TypeScript config).
- `npx playwright test`: run all Playwright tests.
- `npx playwright test tests/ui/`: run UI suite only.
- `ENABLE_API_TESTS=true npx playwright test tests/api/`: run live API tests.

## Coding Style & Naming Conventions
Use TypeScript with strict typing (`tsconfig.json` has `"strict": true`). Follow existing ESLint rules and run lint before opening a PR.
- Prefer `@/*` imports (configured path alias) over deep relative paths.
- Use double quotes and semicolons to match current code style.
- Keep component files in kebab-case (for example, `results-dashboard.tsx`) and export PascalCase React components.
- Keep tests named `*.spec.ts`.

## Testing Guidelines
Playwright is the test framework for both UI and API coverage. Prefer deterministic UI tests with route mocking, and gate network-dependent API tests behind `ENABLE_API_TESTS=true`. Add tests next to the relevant suite (`tests/ui` or `tests/api`) when behavior changes.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commit prefixes (`feat:`, `fix:`, `chore:`, `refactor:`, `ci:`). Continue that pattern and write specific, imperative summaries.

For PRs, include:
- a short problem/solution description,
- linked issue (if any),
- test evidence (commands run),
- screenshots or recordings for UI changes,
- notes for env var or schema changes.

## Security & Configuration Tips
Never commit secrets. `.env*` and `client_secret_*.json` are ignored; keep credentials in local env files. At minimum, configure `OPENAI_API_KEY`, `MINIMAX_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY` before running full pipelines.
