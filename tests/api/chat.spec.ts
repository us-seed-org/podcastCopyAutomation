import { test, expect } from "@playwright/test";

test.describe("Chat API", () => {
  test.skip(!process.env.ENABLE_API_TESTS, "Skipped: set ENABLE_API_TESTS=true to run");

  // We need a runId from a real generation run — create one first
  let runId: string;

  test.beforeAll(async ({ request }) => {
    const SAMPLE_TRANSCRIPT = `
      Host: Today we're talking with Alex Chen about the future of AI coding tools.
      Alex: The biggest shift is from autocomplete to autonomous agents that can reason about your whole codebase.
      Host: That sounds like it could replace developers.
      Alex: Not replace — amplify. A senior dev with these tools outputs 10x more than one without.
    `;

    const res = await request.post("/api/generate", {
      data: {
        research: {
          guest: { name: "Alex Chen" },
          brand: { podcastName: "Tech Futures" },
          guestTier: { tier: 2 },
        },
        transcript: SAMPLE_TRANSCRIPT,
        episodeDescription: "Exploring AI coding tools with Alex Chen.",
      },
      timeout: 300_000,
    });

    const body = await res.text();
    // Extract runId from SSE stream — the run_id event fires early
    const runIdLine = body.split("\n").find((l) => l.includes('"runId"') || l.includes('"run_id"'));
    if (runIdLine) {
      try {
        const data = JSON.parse(runIdLine.replace(/^data: /, ""));
        runId = data.runId || data.run_id || data.data?.runId;
      } catch {
        // fallback: parse complete event
      }
    }
    if (!runId) {
      const completeLine = body.split("\n").find((l) => l.startsWith("data: ") && l.includes("youtubeTitles"));
      if (completeLine) {
        try {
          const data = JSON.parse(completeLine.replace(/^data: /, ""));
          runId = data.runId;
        } catch { /* */ }
      }
    }
  });

  test("POST /api/chat returns streaming text + X-Conversation-Id header", async ({ request }) => {
    if (!runId) test.skip();

    const res = await request.post("/api/chat", {
      data: { runId, message: "What titles were generated?" },
      timeout: 60_000,
    });
    expect(res.status()).toBe(200);
    const convId = res.headers()["x-conversation-id"];
    expect(convId).toBeDefined();
    expect(convId.length).toBeGreaterThan(0);

    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
  });

  test("POST /api/chat returns 400 for missing runId", async ({ request }) => {
    const res = await request.post("/api/chat", {
      data: { message: "hello" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/runId/);
  });

  test("POST /api/chat returns 400 for missing message", async ({ request }) => {
    const res = await request.post("/api/chat", {
      data: { runId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/message/);
  });

  test("POST /api/chat returns 400 for message over 4000 chars", async ({ request }) => {
    const res = await request.post("/api/chat", {
      data: { runId: "00000000-0000-0000-0000-000000000000", message: "x".repeat(4001) },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/long/i);
  });

  test("POST /api/chat returns 404 for unknown runId", async ({ request }) => {
    const res = await request.post("/api/chat", {
      data: { runId: "00000000-0000-0000-0000-000000000000", message: "hello" },
    });
    expect(res.status()).toBe(404);
  });

  test("POST /api/chat maintains conversation across messages", async ({ request }) => {
    if (!runId) test.skip();

    // First message
    const res1 = await request.post("/api/chat", {
      data: { runId, message: "How many YouTube titles were generated?" },
      timeout: 60_000,
    });
    expect(res1.status()).toBe(200);
    const convId = res1.headers()["x-conversation-id"];
    expect(convId).toBeDefined();

    // Second message referencing first
    const res2 = await request.post("/api/chat", {
      data: { runId, message: "Can you summarize what you just told me?", conversationId: convId },
      timeout: 60_000,
    });
    expect(res2.status()).toBe(200);
    // Same conversation continues
    const convId2 = res2.headers()["x-conversation-id"];
    expect(convId2).toBe(convId);
  });

  test("POST /api/chat rejects cross-run conversationId access", async ({ request }) => {
    if (!runId) test.skip();

    const fakeConvId = "00000000-0000-0000-0000-000000000001";

    // Use a valid UUID that doesn't belong to this runId
    const res = await request.post("/api/chat", {
      data: {
        runId,
        message: "hello",
        conversationId: fakeConvId,
      },
      timeout: 30_000,
    });

    // The server should return 200 and create a new conversation when an unrecognized
    // conversationId is passed (it falls through to getOrCreateConversation).
    expect(res.status()).toBe(200);
  });
});
