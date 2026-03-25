import { test, expect } from "@playwright/test";

test.describe("Channel Config API", () => {
  test.skip(!process.env.ENABLE_API_TESTS, "Skipped: set ENABLE_API_TESTS=true to run");

  let createdId: string;

  test("GET /api/channel-configs returns array", async ({ request }) => {
    const res = await request.get("/api/channel-configs");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("POST /api/channel-configs creates a config", async ({ request }) => {
    const res = await request.post("/api/channel-configs", {
      data: {
        name: `test-config-${Date.now()}`,
        system_prompt: "You are a test channel. Write punchy, direct titles.",
        voice_guidelines: { tone: "assertive", style: "minimal" },
        banned_phrases: ["limited time", "you won't believe"],
        preferred_archetypes: ["curiosity_gap", "negative_contrarian"],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBeDefined();
    expect(body.data.name).toMatch(/^test-config-/);
    expect(body.data.preferred_archetypes).toContain("curiosity_gap");
    createdId = body.data.id;
  });

  test("POST /api/channel-configs rejects missing name", async ({ request }) => {
    const res = await request.post("/api/channel-configs", {
      data: { system_prompt: "no name provided" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("POST /api/channel-configs rejects invalid archetype", async ({ request }) => {
    const res = await request.post("/api/channel-configs", {
      data: {
        name: `invalid-arch-${Date.now()}`,
        system_prompt: "test",
        preferred_archetypes: ["not_a_real_archetype"],
      },
    });
    expect(res.status()).toBe(400);
  });

  test("GET /api/channel-configs/[id] returns single config", async ({ request }) => {
    if (!createdId) test.skip();
    const res = await request.get(`/api/channel-configs/${createdId}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(createdId);
  });

  test("GET /api/channel-configs/[id] returns 404 for unknown id", async ({ request }) => {
    const res = await request.get("/api/channel-configs/00000000-0000-0000-0000-000000000000");
    expect(res.status()).toBe(404);
  });

  test("PUT /api/channel-configs/[id] updates config", async ({ request }) => {
    if (!createdId) test.skip();
    const res = await request.put(`/api/channel-configs/${createdId}`, {
      data: {
        voice_guidelines: { tone: "playful" },
        preferred_archetypes: ["authority_shocking"],
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.voice_guidelines.tone).toBe("playful");
    expect(body.data.preferred_archetypes).toContain("authority_shocking");
  });

  test("DELETE /api/channel-configs/[id] removes config", async ({ request }) => {
    if (!createdId) test.skip();
    const res = await request.delete(`/api/channel-configs/${createdId}`);
    expect(res.status()).toBe(204);

    // Verify it's gone
    const check = await request.get(`/api/channel-configs/${createdId}`);
    expect(check.status()).toBe(404);
  });

  test("POST /api/channel-configs rejects system_prompt over 4000 chars", async ({ request }) => {
    const res = await request.post("/api/channel-configs", {
      data: {
        name: `toolong-${Date.now()}`,
        system_prompt: "x".repeat(4001),
      },
    });
    expect(res.status()).toBe(400);
  });
});
