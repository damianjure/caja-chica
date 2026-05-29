import test from "node:test";
import assert from "node:assert/strict";

// -----------------------------------------------------------------------
// P2-T8: RED tests for brevoSenders proxy (REQ-S1.3, REQ-S1.7)
// -----------------------------------------------------------------------

function mockBrevoSendersResponse(senders: unknown[]): typeof globalThis.fetch {
  return () =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ senders }),
    } as Response);
}

test("listVerifiedSenders returns mapped [{id, name, email, active}] from Brevo response", async () => {
  const { listVerifiedSenders, invalidateSendersCache } = await import("../src/server/brevoSenders.ts");
  invalidateSendersCache();

  const brevoSenders = [
    { id: 1, name: "Test Sender", email: "test@example.com", active: true },
    { id: 2, name: "Other Sender", email: "other@example.com", active: false },
  ];

  const origFetch = globalThis.fetch;
  globalThis.fetch = mockBrevoSendersResponse(brevoSenders);

  try {
    const result = await listVerifiedSenders("test-api-key");

    assert.equal(result.length, 2);
    assert.equal(result[0].id, 1);
    assert.equal(result[0].name, "Test Sender");
    assert.equal(result[0].email, "test@example.com");
    assert.equal(result[0].active, true);
    assert.equal(result[1].id, 2);
    assert.equal(result[1].active, false);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("listVerifiedSenders second call within 5 minutes does not re-fetch (cache hit)", async () => {
  const { listVerifiedSenders, invalidateSendersCache } = await import("../src/server/brevoSenders.ts");
  invalidateSendersCache();

  let fetchCount = 0;
  const origFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    fetchCount++;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ senders: [{ id: 1, name: "Cached", email: "c@example.com", active: true }] }),
    } as Response);
  }) as typeof globalThis.fetch;

  try {
    await listVerifiedSenders("test-api-key");
    await listVerifiedSenders("test-api-key");
    assert.equal(fetchCount, 1, "Brevo fetch should only be called once within cache TTL");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("listVerifiedSenders throws when Brevo fetch fails", async () => {
  const { listVerifiedSenders, invalidateSendersCache } = await import("../src/server/brevoSenders.ts");
  invalidateSendersCache();

  const origFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error("Network error"))) as typeof globalThis.fetch;

  try {
    await assert.rejects(
      () => listVerifiedSenders("test-api-key"),
      (err) => {
        assert.ok(err instanceof Error, "Should throw an Error");
        return true;
      },
      "listVerifiedSenders should throw when Brevo is unreachable",
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});
