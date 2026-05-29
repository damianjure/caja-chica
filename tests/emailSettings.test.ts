import test from "node:test";
import assert from "node:assert/strict";

// We need to test getActiveSender, which uses module-level cache.
// Import after setting up process.env so the ENV_FALLBACK constant captures test values.
process.env.FROM_EMAIL = "test@example.com";
process.env.FROM_NAME = "Test App";

// Dynamic import to get fresh module state per test where needed.
// Because the module has module-level cache, we reset it between tests via invalidateSenderCache.

function makeSupabaseMock(result: { data: unknown; error: unknown }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve(result),
        }),
      }),
    }),
  };
}

// -----------------------------------------------------------------------
// P2-T2: 3 failing tests for getActiveSender (RED phase)
// -----------------------------------------------------------------------

test("getActiveSender: empty DB response returns env fallback", async () => {
  const { getActiveSender, invalidateSenderCache } = await import("../src/server/emailSettings.ts");
  invalidateSenderCache();

  const supabase = makeSupabaseMock({ data: null, error: null });
  const result = await getActiveSender(supabase as any);

  assert.equal(result.fromEmail, "test@example.com");
  assert.equal(result.fromName, "Test App");
});

test("getActiveSender: DB error returns env fallback without throwing", async () => {
  const { getActiveSender, invalidateSenderCache } = await import("../src/server/emailSettings.ts");
  invalidateSenderCache();

  const supabase = makeSupabaseMock({ data: null, error: { message: "connection error" } });

  // Must not throw
  const result = await getActiveSender(supabase as any);

  assert.equal(result.fromEmail, "test@example.com");
  assert.equal(result.fromName, "Test App");
});

test("getActiveSender: second call within 5 minutes uses cache (DB called only once)", async () => {
  const { getActiveSender, invalidateSenderCache } = await import("../src/server/emailSettings.ts");
  invalidateSenderCache();

  let callCount = 0;
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => {
            callCount++;
            return Promise.resolve({
              data: { id: 1, from_email: "db@example.com", from_name: "DB Sender" },
              error: null,
            });
          },
        }),
      }),
    }),
  };

  await getActiveSender(supabase as any);
  await getActiveSender(supabase as any);

  assert.equal(callCount, 1, "Supabase should only be called once within cache TTL");
});
