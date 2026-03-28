# PR #4 — Architectural Decisions & Known Limitations

> Documenting decisions made during pre-landing review of the `dev` → `main` PR for channel configs + chat panel.

**Date:** 2026-03-27
**PR:** #4 — channel configurations + interactive chat panel
**Branch:** `dev`

---

## DECISIONS MADE

### 1. Rate Limit Fix — Atomic PostgreSQL RPC
**Status:** ✅ Fixed
**Issue:** Rate limiter had three bugs: invalid `supabase.rpc()` usage as UPDATE value, invalid `.onConflict()` on insert builder, and TOCTOU race allowing burst-through.
**Decision:** Implemented atomic `INSERT ... ON CONFLICT DO UPDATE` via a dedicated PostgreSQL function `check_and_increment_rate_limit`. Added debug logging throughout.
**Files changed:** `supabase/migrations/005_rate_limit_atomic.sql`, `src/lib/rate-limit.ts`
**Testing:** Run 10 concurrent requests with `limit=5` — all should be rejected.

---

### 2. Silent DB Error Handling in `appendConversationMessage`
**Status:** ⚠️ Kept as-is (warn-only)
**Issue:** `appendConversationMessage` swallows all DB errors with `console.warn` instead of throwing.
**Decision:** Keep the warn-only behavior. DB errors in chat appends are non-fatal for the user-facing response. Enhanced with additional debug logging for observability.
**Files changed:** `src/lib/supabase.ts`
**Risk:** Silent data loss if DB fails — acceptable for non-critical chat persistence.
**Test:** Monitor server logs for `[DB]` warnings in production.

---

### 3. Authentication on Chat & Channel-Config Routes
**Status:** ⚠️ Skipped — documented as security constraint
**Issue (CODEX finding):** All chat and channel-config routes use the Supabase service-role client with no user ownership check. Anyone who knows a `runId` or `conversationId` can read/write any conversation and trigger `regenerate`/`rescore`/`rerank`/`recontent` actions.
**Decision:** Skipped for this PR. Auth integration requires broader architectural decision (Supabase Auth setup, session management). Documented as a known production security constraint.
**Files affected:** `src/app/api/chat/route.ts`, `src/app/api/chat/actions/route.ts`, `src/app/api/channel-configs/route.ts`, `src/app/api/channel-configs/[id]/route.ts`
**Impact:** Do not expose these routes publicly without auth. Restrict to internal use or behind an auth proxy.
**Recommended fix:** Add user ownership validation — verify the current user owns `runId`/`conversationId` before any operation.

---

### 4. Detached Background Task / `in_progress` Deadlock
**Status:** 🔍 Debugging & testing added
**Issue (CODEX finding):** `POST /api/chat/actions` returns `202 Accepted` immediately after spawning an unawaited IIFE. On serverless platforms, the runtime can suspend after the HTTP response is sent but before the background task completes. This leaves `conversation_actions` stuck at `in_progress` forever, and the partial unique index blocks all future actions for that conversation.
**Decision:** Add debug logging and test coverage for the background task lifecycle. Deferred full fix (queuing mechanism or timeout cleanup) to a follow-up.
**Files changed:** `src/app/api/chat/actions/route.ts`
**Risk:** Actions can become stuck in `in_progress` on serverless platforms. New actions for that conversation are blocked until the stuck record is manually cleared.
**Recommended fix:** Add a scheduled cleanup that marks stale `in_progress` actions (>30min) as `failed`, or migrate to a proper job queue (Supabase Edge Functions + pg_jobs).

---

### 5. Channel Config Retroactive Mutation
**Status:** ⚠️ Skipped — documented
**Issue (CODEX finding):** `generation_runs` stores only `channel_config_id` FK. Editing a config retroactively changes behavior on future re-runs of old generations. Deleting a config nulls the FK silently — runs then use the default prompt with no indication in the UI.
**Decision:** Skipped for this PR. Config snapshotting requires schema migration and broader discussion.
**Files affected:** `src/app/api/generate/route.ts`, `supabase/migrations/`
**Impact:** Re-running an old generation after editing its linked config picks up the new config. The UI shows "Custom context active" even when the linked config has been deleted.
**Recommended fix:** Snapshot the full channel config into `generation_runs.config_snapshot` at generation time.

---

## AUTO-FIXED ISSUES (already resolved)

| Issue | File | Fix |
|-------|------|-----|
| Orphaned if-body parse error | `tests/api/chat.spec.ts` | Removed orphaned lines 144-153 |
| Unused `generation` prop | `src/components/chat-panel.tsx` | Removed from props + call site |
| `onActionTriggered` never called | `src/components/chat-panel.tsx` | Added `onActionTriggered?.()` after confirmation |
| Missing `CardHeader,CardTitle` imports | `src/components/chat-panel.tsx` | Added to import |
| Unused `CardHeader,CardTitle` imports | `src/app/channel-configs/page.tsx` | Removed from import |
| Unused `Card,CardContent,CardHeader,CardTitle` imports | `src/components/channel-config-form.tsx` | Removed all 4 |
| Unused `Conversation` import | `src/hooks/use-chat.ts` | Removed from import |
| IP extraction inverted priority | `src/app/api/chat/actions/route.ts` | Fixed: `realIp` preferred over `forwarded` |
| IP extraction inverted priority | `src/app/api/chat/route.ts` | Fixed: `realIp` preferred over `forwarded` |
| `maxLength` not validated client-side | `src/components/channel-config-form.tsx` | Added length checks to `validate()` |
| Unbounded messages array | `src/hooks/use-chat.ts` | Trim to `slice(-200)` when length > 200 |
| No error handling in `onFinish` | `src/app/api/chat/route.ts` | Added try/catch around `appendConversationMessage` |
| Silent success on missing conversation | `supabase/migrations/002_conversations.sql` | Added `RAISE` after UPDATE returns 0 rows |

---

## SECURITY CONSTRAINTS (production exposure)

These routes use the Supabase service-role client with no authentication layer:

- `POST /api/chat` — Any caller with a `runId` can read/write any conversation
- `POST /api/chat/actions` — Any caller can trigger `regenerate`/`rescore`/`rerank`/`recontent` on any conversation
- `GET/POST/PUT/DELETE /api/channel-configs` — No access control on channel config CRUD

**Until auth is added:** Deploy behind an authentication proxy or restrict network access.
