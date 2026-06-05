/**
 * Tests for POST /api/telegram/self-link
 *
 * Strict TDD: tests written first (RED), then implementation (GREEN).
 *
 * Covers:
 * - mints a pre_authorized token for the caller
 * - revokes prior active/pending_owner_confirm telegram_links for caller+dashboard
 * - expires prior pending telegram_invite_tokens for caller+dashboard
 * - 403 when caller has no dashboard scope
 */

import test from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { createApp, type AppDeps, type AppSession } from "../src/server/app.ts";

// ---------------------------------------------------------------------------
// Stub builder
// ---------------------------------------------------------------------------

type SelfLinkSeed = {
  dashboardMembers?: unknown[];
  telegramLinks?: unknown[];
  telegramInviteTokens?: unknown[];
};

function createSelfLinkStub(seed: SelfLinkSeed = {}) {
  let dashboardMembersRows = (seed.dashboardMembers ?? []) as any[];
  let telegramLinksRows = (seed.telegramLinks ?? []) as any[];
  let telegramInviteTokensRows = (seed.telegramInviteTokens ?? []) as any[];

  const inserted: Record<string, unknown[]> = {};
  const updated: Record<string, unknown[]> = {};

  const builder = (table: string) => {
    const getRows = () => {
      if (table === "dashboard_members") return [...dashboardMembersRows];
      if (table === "telegram_links") return [...telegramLinksRows];
      if (table === "telegram_invite_tokens") return [...telegramInviteTokensRows];
      return [] as any[];
    };

    let rows: any[] = getRows();
    let pendingUpdate: unknown = null;

    const api: any = {
      select(..._args: unknown[]) { rows = getRows(); return api; },
      eq(col: string, val: unknown) {
        rows = rows.filter((r: any) => r[col] === val);
        return api;
      },
      neq(col: string, val: unknown) {
        rows = rows.filter((r: any) => r[col] !== val);
        return api;
      },
      not(col: string, op: string, val: unknown) {
        if (op === "is") {
          rows = rows.filter((r: any) => r[col] !== null && r[col] !== undefined);
        }
        return api;
      },
      is(col: string, val: unknown) {
        rows = rows.filter((r: any) => {
          if (val === null) return r[col] === null || r[col] === undefined;
          return r[col] === val;
        });
        return api;
      },
      order(..._args: unknown[]) { return api; },
      limit(n: number) {
        const sliced = rows.slice(0, n);
        const p: any = Promise.resolve({ data: sliced, error: null });
        p.single = () => Promise.resolve({ data: sliced[0] ?? null, error: null });
        return p;
      },
      single() {
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      then(resolve: (v: unknown) => void) {
        resolve({ data: rows, error: null });
      },
      insert(payload: unknown) {
        if (!inserted[table]) inserted[table] = [];
        inserted[table].push(payload);
        const newRow = { id: `gen-${table}-${inserted[table].length}`, ...(payload as object) };
        return {
          select() {
            return {
              single() { return Promise.resolve({ data: newRow, error: null }); },
            };
          },
          single() { return Promise.resolve({ data: newRow, error: null }); },
        };
      },
      update(payload: unknown) {
        pendingUpdate = payload;
        if (!updated[table]) updated[table] = [];
        updated[table].push({ payload, matchedRows: rows });
        const ub: any = {
          eq(col: string, val: unknown) {
            rows = rows.filter((r: any) => r[col] === val);
            return ub;
          },
          neq(col: string, val: unknown) {
            rows = rows.filter((r: any) => r[col] !== val);
            return ub;
          },
          select() { return ub; },
          limit(n: number) { return Promise.resolve({ data: rows.slice(0, n), error: null }); },
          then(resolve: (v: unknown) => void) { resolve({ data: rows, error: null }); },
        };
        return ub;
      },
    };
    return api;
  };

  return {
    client: {
      from(table: string) { return builder(table); },
      rpc(_fn: string, _args?: unknown) { return Promise.resolve({ data: null, error: null }); },
      auth: {
        admin: {
          deleteUser(_id: string) { return Promise.resolve({ error: null }); },
        },
      },
    },
    getInserted: (table: string) => inserted[table] ?? [],
    getUpdated: (table: string) => updated[table] ?? [],
  };
}

// ---------------------------------------------------------------------------
// Server helper
// ---------------------------------------------------------------------------

async function withSelfLinkServer(
  seed: SelfLinkSeed,
  session: AppSession,
  fn: (baseUrl: string, stub: ReturnType<typeof createSelfLinkStub>) => Promise<void>,
) {
  const stub = createSelfLinkStub(seed);

  const app = createApp({
    supabase: stub.client as AppDeps["supabase"],
    genAI: {
      models: {
        async generateContent() {
          return { text: '{"intent":"REGISTRAR","items":[]}' };
        },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    telegramBotUsername: "cajachicabot",
    resolveSession: async () => session,
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address() as AddressInfo;
    await fn(`http://127.0.0.1:${port}`, stub);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

function bearer(): { Authorization: string } {
  return { Authorization: "Bearer valid-token" };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ownerSession: AppSession = {
  userId: "user-1",
  email: "owner@example.com",
  role: "member",
  status: "active",
};

const ownerMember = {
  id: "dm-1",
  dashboard_id: "dash-1",
  user_id: "user-1",
  role: "owner",
  status: "active",
  invited_by_user_id: null,
};

const editorSession: AppSession = {
  userId: "editor-1",
  email: "editor@example.com",
  role: "member",
  status: "active",
};

const editorMember = {
  id: "dm-2",
  dashboard_id: "dash-1",
  user_id: "editor-1",
  role: "editor",
  status: "active",
  invited_by_user_id: "user-1",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("POST /api/telegram/self-link — 403 when caller has no dashboard membership", async () => {
  // No dashboard_members rows at all → resolveDataAccessScope returns dashboardId=null
  await withSelfLinkServer(
    { dashboardMembers: [] },
    ownerSession,
    async (base) => {
      const res = await fetch(`${base}/api/telegram/self-link`, {
        method: "POST",
        headers: { ...bearer(), "Content-Type": "application/json" },
      });
      assert.equal(res.status, 403);
      const body = await res.json() as any;
      assert.ok(body.error, "should return error field");
    },
  );
});

test("POST /api/telegram/self-link — mints pre_authorized token for caller", async () => {
  await withSelfLinkServer(
    { dashboardMembers: [ownerMember] },
    ownerSession,
    async (base, stub) => {
      const res = await fetch(`${base}/api/telegram/self-link`, {
        method: "POST",
        headers: { ...bearer(), "Content-Type": "application/json" },
      });
      assert.equal(res.status, 201);
      const body = await res.json() as any;
      assert.ok(body.token, "should return token");
      assert.ok(body.telegramDeepLink, "should return telegramDeepLink");
      assert.ok(body.telegramDeepLink.includes("cajachicabot"), "deep link should include bot username");
      assert.ok(body.expiresAt, "should return expiresAt");
      assert.ok(body.manualStartCode, "should return manualStartCode");
      assert.ok(body.manualStartCode.startsWith("/start "), "manualStartCode format");

      const tokenRows = stub.getInserted("telegram_invite_tokens");
      assert.equal(tokenRows.length, 1, "should insert exactly one token");
      const row = tokenRows[0] as any;
      assert.equal(row.pre_authorized, true, "token must be pre_authorized");
      assert.equal(row.dashboard_id, "dash-1");
      assert.equal(row.target_user_id, "user-1");
      assert.equal(row.created_by_user_id, "user-1");
      assert.equal(row.status, "pending");

      // TTL ~30 min
      const diffMs = new Date(row.expires_at).getTime() - Date.now();
      assert.ok(diffMs > 25 * 60 * 1000 && diffMs < 35 * 60 * 1000, `TTL should be ~30min, got ${diffMs}ms`);
    },
  );
});

test("POST /api/telegram/self-link — also works for editor role", async () => {
  await withSelfLinkServer(
    { dashboardMembers: [editorMember] },
    editorSession,
    async (base, stub) => {
      const res = await fetch(`${base}/api/telegram/self-link`, {
        method: "POST",
        headers: { ...bearer(), "Content-Type": "application/json" },
      });
      assert.equal(res.status, 201);
      const tokenRows = stub.getInserted("telegram_invite_tokens");
      assert.equal(tokenRows.length, 1);
      const row = tokenRows[0] as any;
      assert.equal(row.target_user_id, "editor-1");
      assert.equal(row.pre_authorized, true);
    },
  );
});

test("POST /api/telegram/self-link — revokes existing non-revoked telegram_links for caller+dashboard", async () => {
  const existingLink = {
    id: "tl-existing",
    app_user_id: "user-1",
    dashboard_id: "dash-1",
    status: "active",
    telegram_user_id: 111111,
  };

  await withSelfLinkServer(
    {
      dashboardMembers: [ownerMember],
      telegramLinks: [existingLink],
    },
    ownerSession,
    async (base, stub) => {
      const res = await fetch(`${base}/api/telegram/self-link`, {
        method: "POST",
        headers: { ...bearer(), "Content-Type": "application/json" },
      });
      assert.equal(res.status, 201);

      // Verify an update to telegram_links was issued
      const updates = stub.getUpdated("telegram_links");
      assert.ok(updates.length > 0, "should have updated telegram_links to revoke");
      const revokeUpdate = updates.find((u: any) => (u.payload as any)?.status === "revoked");
      assert.ok(revokeUpdate, "update payload should set status=revoked");
    },
  );
});

test("POST /api/telegram/self-link — expires prior pending telegram_invite_tokens for caller+dashboard", async () => {
  const pendingToken = {
    id: "token-old",
    target_user_id: "user-1",
    dashboard_id: "dash-1",
    status: "pending",
    token: "old-token-hex",
  };

  await withSelfLinkServer(
    {
      dashboardMembers: [ownerMember],
      telegramInviteTokens: [pendingToken],
    },
    ownerSession,
    async (base, stub) => {
      const res = await fetch(`${base}/api/telegram/self-link`, {
        method: "POST",
        headers: { ...bearer(), "Content-Type": "application/json" },
      });
      assert.equal(res.status, 201);

      const updates = stub.getUpdated("telegram_invite_tokens");
      assert.ok(updates.length > 0, "should have updated telegram_invite_tokens");
      const expireUpdate = updates.find((u: any) => (u.payload as any)?.status === "expired");
      assert.ok(expireUpdate, "should set prior pending tokens to expired");
    },
  );
});
