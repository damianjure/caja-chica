import test from "node:test";
import assert from "node:assert/strict";

// We import from the module under test — these will fail until implementation exists.
import {
  isWriteBlocked,
  getMaintenanceState,
  invalidateCache,
  setMaintenanceStatus,
  maintenanceCache,
} from "../src/server/maintenance.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSupabaseStub(status: string) {
  return {
    from(_table: string) {
      return {
        select(_cols?: string) {
          return this;
        },
        eq(_col: string, _val: unknown) {
          return this;
        },
        single() {
          return Promise.resolve({
            data: {
              id: 1,
              status,
              started_at: status === "active" ? new Date().toISOString() : null,
              scheduled_at: null,
              grace_ends_at: null,
              estimated_end_at: null,
              message: null,
            },
            error: null,
          });
        },
        upsert(_payload: unknown, _opts?: unknown) {
          return {
            select(_cols?: string) {
              return {
                single() {
                  return Promise.resolve({
                    data: { id: 1, status, started_at: null, scheduled_at: null, grace_ends_at: null, estimated_end_at: null, message: null },
                    error: null,
                  });
                },
              };
            },
          };
        },
      };
    },
  } as any;
}

// ---------------------------------------------------------------------------
// 1. isWriteBlocked() — pure state checks (use maintenanceCache directly)
// ---------------------------------------------------------------------------

test("isWriteBlocked() returns false when status is none", () => {
  maintenanceCache.state = { status: "none", started_at: null, scheduled_at: null, grace_ends_at: null, estimated_end_at: null, message: null };
  maintenanceCache.cachedAt = Date.now();
  assert.equal(isWriteBlocked(), false);
});

// Per spec: "During grace, new write operations MUST be rejected"
test("isWriteBlocked() returns true when status is grace (writes blocked per spec)", () => {
  maintenanceCache.state = { status: "grace", started_at: null, scheduled_at: null, grace_ends_at: null, estimated_end_at: null, message: null };
  maintenanceCache.cachedAt = Date.now();
  assert.equal(isWriteBlocked(), true);
});

test("isWriteBlocked() returns true when status is active", () => {
  maintenanceCache.state = { status: "active", started_at: new Date().toISOString(), scheduled_at: null, grace_ends_at: null, estimated_end_at: null, message: null };
  maintenanceCache.cachedAt = Date.now();
  assert.equal(isWriteBlocked(), true);
});

test("isWriteBlocked() returns false when status is scheduled", () => {
  maintenanceCache.state = { status: "scheduled", started_at: null, scheduled_at: new Date(Date.now() + 60_000).toISOString(), grace_ends_at: null, estimated_end_at: null, message: null };
  maintenanceCache.cachedAt = Date.now();
  assert.equal(isWriteBlocked(), false);
});

// ---------------------------------------------------------------------------
// 2. getMaintenanceState() — cache behaviour
// ---------------------------------------------------------------------------

test("getMaintenanceState() uses cache when fresh (< 30s)", async () => {
  const freshState = { status: "none" as const, started_at: null, scheduled_at: null, grace_ends_at: null, estimated_end_at: null, message: null };
  maintenanceCache.state = freshState;
  maintenanceCache.cachedAt = Date.now(); // just set

  // Stub whose single() would return a different status — should NOT be called
  let dbCalled = false;
  const stub = {
    from(_t: string) {
      return {
        select(_c?: string) { return this; },
        eq(_c: string, _v: unknown) { return this; },
        single() {
          dbCalled = true;
          return Promise.resolve({ data: { id: 1, status: "active", started_at: null, scheduled_at: null, grace_ends_at: null, estimated_end_at: null, message: null }, error: null });
        },
      };
    },
  } as any;

  const result = await getMaintenanceState(stub);
  assert.equal(dbCalled, false, "DB should not be called when cache is fresh");
  assert.equal(result.status, "none");
});

test("getMaintenanceState() re-fetches DB when cache is stale", async () => {
  // Force stale cache
  maintenanceCache.cachedAt = Date.now() - 60_000; // 60s ago = stale

  let dbCalled = false;
  const stub = {
    from(_t: string) {
      return {
        select(_c?: string) { return this; },
        eq(_c: string, _v: unknown) { return this; },
        single() {
          dbCalled = true;
          return Promise.resolve({ data: { id: 1, status: "scheduled", started_at: null, scheduled_at: new Date(Date.now() + 60_000).toISOString(), grace_ends_at: null, estimated_end_at: null, message: null }, error: null });
        },
      };
    },
  } as any;

  const result = await getMaintenanceState(stub);
  assert.equal(dbCalled, true, "DB should be called when cache is stale");
  assert.equal(result.status, "scheduled");
});

// ---------------------------------------------------------------------------
// 3. invalidateCache()
// ---------------------------------------------------------------------------

test("invalidateCache() forces next getMaintenanceState() to hit DB", async () => {
  maintenanceCache.state = { status: "none" as const, started_at: null, scheduled_at: null, grace_ends_at: null, estimated_end_at: null, message: null };
  maintenanceCache.cachedAt = Date.now();

  invalidateCache();

  let dbCalled = false;
  const stub = {
    from(_t: string) {
      return {
        select(_c?: string) { return this; },
        eq(_c: string, _v: unknown) { return this; },
        single() {
          dbCalled = true;
          return Promise.resolve({ data: { id: 1, status: "active", started_at: new Date().toISOString(), scheduled_at: null, grace_ends_at: null, estimated_end_at: null, message: null }, error: null });
        },
      };
    },
  } as any;

  await getMaintenanceState(stub);
  assert.equal(dbCalled, true, "DB should be called after cache invalidation");
});

// ---------------------------------------------------------------------------
// 4. setMaintenanceStatus() — upserts and invalidates cache
// ---------------------------------------------------------------------------

test("setMaintenanceStatus() upserts and returns updated state", async () => {
  const stub = makeSupabaseStub("active");
  const result = await setMaintenanceStatus(stub, { status: "active", started_at: new Date().toISOString() });
  assert.equal(result.status, "active");
});
