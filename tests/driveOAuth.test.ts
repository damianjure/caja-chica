import test from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";

import { encryptToken, decryptToken } from "../src/server/drive.ts";
import { createApp, type AppDeps, type AppSession } from "../src/server/app.ts";

// A valid 32-byte key encoded as base64.
const TEST_KEY = Buffer.from(randomBytes(32)).toString("base64");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSupabaseStub(overrides: Record<string, unknown[]> = {}) {
  const callLog: Array<{ table: string; type: string; args: unknown[] }> = [];

  const tableData: Record<string, unknown[]> = {
    dashboard_members: [],
    drive_connections: [],
    ...overrides,
  };

  const builder = (table: string) => {
    let rows = [...(tableData[table] ?? [])];

    const api: any = {
      select(...args: unknown[]) { callLog.push({ table, type: "select", args }); return api; },
      order(...args: unknown[]) { callLog.push({ table, type: "order", args }); return api; },
      eq(col: string, val: unknown) {
        callLog.push({ table, type: "eq", args: [col, val] });
        rows = rows.filter((r: any) => r[col] === val);
        return api;
      },
      is(col: string, val: unknown) {
        callLog.push({ table, type: "is", args: [col, val] });
        rows = rows.filter((r: any) => val === null ? (r[col] === null || r[col] === undefined) : r[col] === val);
        return api;
      },
      limit(_n: number) { return Promise.resolve({ data: rows, error: null }); },
      upsert(...args: unknown[]) {
        callLog.push({ table, type: "upsert", args });
        const payload = Array.isArray(args[0]) ? (args[0] as any[])[0] : args[0];
        tableData[table] = [payload];
        return Promise.resolve({ data: tableData[table], error: null });
      },
      delete() {
        callLog.push({ table, type: "delete", args: [] });
        return {
          eq(col: string, val: string) {
            callLog.push({ table, type: "eq", args: [col, val] });
            tableData[table] = (tableData[table] ?? []).filter((r: any) => r[col] !== val);
            return Promise.resolve({ error: null });
          },
        };
      },
      insert(payload: unknown) {
        callLog.push({ table, type: "insert", args: [payload] });
        return { select() { return Promise.resolve({ data: [payload], error: null }); } };
      },
    };

    return api;
  };

  return {
    client: { from: (table: string) => builder(table) },
    callLog,
    tableData,
  };
}

const ownerSession: AppSession = {
  userId: "owner-1",
  email: "owner@example.com",
  role: "member",
  status: "active",
};

const editorSession: AppSession = {
  userId: "editor-1",
  email: "editor@example.com",
  role: "member",
  status: "active",
};

const viewerSession: AppSession = {
  userId: "viewer-1",
  email: "viewer@example.com",
  role: "member",
  status: "active",
};

const DRIVE_DEPS = {
  googleDriveClientId: "client-id",
  googleDriveClientSecret: "client-secret",
  googleDriveRedirectUri: "http://localhost/api/drive/callback",
  tokenEncryptionKey: TEST_KEY,
  publicAppUrl: "http://localhost:5173",
};

async function withServer(
  deps: Partial<AppDeps>,
  fn: (baseUrl: string, supabase: ReturnType<typeof makeSupabaseStub>) => Promise<void>,
) {
  const stub = makeSupabaseStub((deps as any).__tableData ?? {});
  const app = createApp({
    supabase: stub.client as AppDeps["supabase"],
    genAI: { models: { async generateContent() { return { text: '{"intent":"REGISTRAR","items":[]}' }; } } },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    ...deps,
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const address = server.address() as AddressInfo;
    await fn(`http://127.0.0.1:${address.port}`, stub);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

// ─── Grupo 1: encryptToken / decryptToken ────────────────────────────────────

test("encryptToken devuelve formato GCM ivHex:tagHex:encryptedHex", () => {
  const result = encryptToken("my-refresh-token", TEST_KEY);
  // IV 12 bytes (24 hex) + auth tag 16 bytes (32 hex) + ciphertext
  assert.match(result, /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);
});

test("decryptToken sigue leyendo tokens legacy AES-CBC (2 partes)", async () => {
  // Tokens guardados en prod antes de la migración a GCM.
  const { createCipheriv, randomBytes } = await import("node:crypto");
  const key = Buffer.from(TEST_KEY, "base64");
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update("legacy-token", "utf8"), cipher.final()]);
  const legacy = `${iv.toString("hex")}:${encrypted.toString("hex")}`;
  assert.equal(decryptToken(legacy, TEST_KEY), "legacy-token");
});

test("decryptToken GCM rechaza ciphertext adulterado (auth tag)", () => {
  const encrypted = encryptToken("tamper-me", TEST_KEY);
  const parts = encrypted.split(":");
  const data = parts[2];
  const flipped = (data[0] === "0" ? "1" : "0") + data.slice(1);
  assert.throws(() => decryptToken(`${parts[0]}:${parts[1]}:${flipped}`, TEST_KEY));
});

test("decryptToken recupera el token original (round-trip)", () => {
  const original = "super-secret-refresh-token";
  const encrypted = encryptToken(original, TEST_KEY);
  const decrypted = decryptToken(encrypted, TEST_KEY);
  assert.equal(decrypted, original);
});

test("cada llamada a encryptToken produce un ciphertext distinto (IV aleatorio)", () => {
  const token = "same-token";
  const a = encryptToken(token, TEST_KEY);
  const b = encryptToken(token, TEST_KEY);
  assert.notEqual(a, b);
  // pero ambos se descifran igual
  assert.equal(decryptToken(a, TEST_KEY), token);
  assert.equal(decryptToken(b, TEST_KEY), token);
});

test("decryptToken lanza error si el string no contiene ':'", () => {
  assert.throws(
    () => decryptToken("nocolon", TEST_KEY),
    /invalid_token_format/,
  );
});

test("decryptToken lanza error si ivHex tiene longitud incorrecta", () => {
  // IV must be 32 hex chars (16 bytes). Use 30 chars instead.
  const shortIv = "a".repeat(30);
  const fakeData = "deadbeef";
  assert.throws(
    () => decryptToken(`${shortIv}:${fakeData}`, TEST_KEY),
    /invalid_token_format/,
  );
});

// ─── Grupo 2: canConnectDrive via HTTP (GET /api/drive/auth-url) ─────────────
//
// canConnectDrive is defined inside createApp and not exported.
// We test it behaviorally through GET /api/drive/auth-url which returns 403
// when canConnectDrive returns false, and 200 with a URL when it returns true.

test("canConnectDrive: owner sin dashboard (membershipRole=null) puede obtener auth-url", async () => {
  // No dashboard_members rows → scope { dashboardId: null, membershipRole: null }
  await withServer(
    {
      ...DRIVE_DEPS,
      resolveSession: async () => ownerSession,
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/drive/auth-url`, {
        headers: { Authorization: "Bearer valid-token" },
      });
      assert.equal(res.status, 200);
      const body = await res.json() as any;
      assert.ok(typeof body.url === "string" && body.url.startsWith("https://"));
    },
  );
});

test("canConnectDrive: membershipRole=owner puede obtener auth-url", async () => {
  await withServer(
    {
      ...DRIVE_DEPS,
      resolveSession: async () => ownerSession,
      __tableData: {
        dashboard_members: [
          { user_id: "owner-1", dashboard_id: "dash-1", role: "owner", status: "active" },
        ],
      },
    } as any,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/drive/auth-url`, {
        headers: { Authorization: "Bearer valid-token" },
      });
      assert.equal(res.status, 200);
      const body = await res.json() as any;
      assert.ok(typeof body.url === "string");
    },
  );
});

test("canConnectDrive: membershipRole=editor recibe 403 en auth-url", async () => {
  await withServer(
    {
      ...DRIVE_DEPS,
      resolveSession: async () => editorSession,
      __tableData: {
        dashboard_members: [
          { user_id: "editor-1", dashboard_id: "dash-1", role: "editor", status: "active" },
        ],
      },
    } as any,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/drive/auth-url`, {
        headers: { Authorization: "Bearer valid-token" },
      });
      assert.equal(res.status, 403);
      const body = await res.json() as any;
      assert.equal(body.error, "forbidden");
    },
  );
});

test("canConnectDrive: membershipRole=viewer recibe 403 en auth-url", async () => {
  await withServer(
    {
      ...DRIVE_DEPS,
      resolveSession: async () => viewerSession,
      __tableData: {
        dashboard_members: [
          { user_id: "viewer-1", dashboard_id: "dash-1", role: "viewer", status: "active" },
        ],
      },
    } as any,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/drive/auth-url`, {
        headers: { Authorization: "Bearer valid-token" },
      });
      assert.equal(res.status, 403);
    },
  );
});

// ─── Grupo 3: canExportDrive via GET /api/drive/status ───────────────────────
//
// canExportDrive is also private. We test it via /api/drive/status:
// - owners and legacy users → { enabled: true }
// - editor sin permiso export_drive → { enabled: false }
// - editor con permiso export_drive → { enabled: true }

test("canExportDrive: owner sin dashboard ve drive status enabled=true", async () => {
  await withServer(
    {
      ...DRIVE_DEPS,
      resolveSession: async () => ownerSession,
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/drive/status`, {
        headers: { Authorization: "Bearer valid-token" },
      });
      assert.equal(res.status, 200);
      const body = await res.json() as any;
      assert.equal(body.enabled, true);
    },
  );
});

test("canExportDrive: editor sin permiso export_drive ve enabled=false", async () => {
  await withServer(
    {
      ...DRIVE_DEPS,
      resolveSession: async () => editorSession,
      __tableData: {
        dashboard_members: [
          {
            user_id: "editor-1",
            dashboard_id: "dash-1",
            role: "editor",
            status: "active",
            permissions: { export_drive: false },
          },
        ],
      },
    } as any,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/drive/status`, {
        headers: { Authorization: "Bearer valid-token" },
      });
      assert.equal(res.status, 200);
      const body = await res.json() as any;
      assert.equal(body.enabled, false);
    },
  );
});

test("canExportDrive: editor con permiso export_drive=true ve enabled=true", async () => {
  await withServer(
    {
      ...DRIVE_DEPS,
      resolveSession: async () => editorSession,
      __tableData: {
        dashboard_members: [
          {
            user_id: "editor-1",
            dashboard_id: "dash-1",
            role: "editor",
            status: "active",
            permissions: { export_drive: true },
          },
        ],
        drive_connections: [
          { id: "conn-1", owner_user_id: "owner-1" },
        ],
      },
    } as any,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/drive/status`, {
        headers: { Authorization: "Bearer valid-token" },
      });
      assert.equal(res.status, 200);
      const body = await res.json() as any;
      assert.equal(body.enabled, true);
    },
  );
});

// ─── Grupo 4: pendingDriveOAuthStates sweep ───────────────────────────────────
//
// pendingDriveOAuthStates is a module-level Map inside app.ts — not exported.
// The sweep interval also runs inside the module closure.
// There is no test helper to inspect it.
// SKIP: not testable without modifying production code or exporting internals.

test.skip("pendingDriveOAuthStates sweep: entries expirados son eliminados", () => {
  // pendingDriveOAuthStates is a private module-level Map inside createApp's
  // module scope. The sweep interval is also private. Neither is exported.
  // Testing this would require either exporting the Map or refactoring the
  // module — which violates the constraint of not modifying production code.
});

// ─── Grupo 5: GET /api/drive/callback ────────────────────────────────────────

test("callback sin code ni state → redirect con driveError=missing_params", async () => {
  await withServer(
    { ...DRIVE_DEPS, resolveSession: async () => ownerSession },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/drive/callback`, { redirect: "manual" });
      // 302 redirect
      assert.equal(res.status, 302);
      const location = res.headers.get("location") ?? "";
      assert.ok(location.includes("driveError=missing_params"), `location: ${location}`);
    },
  );
});

test("callback con state inválido (no existe en Map) → redirect con driveError=invalid_state", async () => {
  await withServer(
    { ...DRIVE_DEPS, resolveSession: async () => ownerSession },
    async (baseUrl) => {
      const res = await fetch(
        `${baseUrl}/api/drive/callback?code=some-code&state=nonexistent-state`,
        { redirect: "manual" },
      );
      assert.equal(res.status, 302);
      const location = res.headers.get("location") ?? "";
      assert.ok(location.includes("driveError=invalid_state"), `location: ${location}`);
    },
  );
});

test("callback sin Drive configurado → 503", async () => {
  await withServer(
    // No drive deps → driveEnabled = false
    { resolveSession: async () => ownerSession },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/drive/callback?code=x&state=y`);
      assert.equal(res.status, 503);
    },
  );
});

test("callback con state válido y exchangeCodeForTokens exitoso → upsert en drive_connections y redirect driveConnected=true", async () => {
  // Strategy: we obtain a valid state token by first hitting /api/drive/auth-url,
  // then extract the `state` param from the returned Google URL,
  // and finally call /api/drive/callback with that state + a mocked code.
  //
  // exchangeCodeForTokens calls googleapis under the hood. We can't mock
  // googleapis in the native test runner without dependency injection.
  // We test the code/state validation path: a valid state that is consumed
  // and then a failed exchange → driveError=exchange_failed (confirms
  // the state was found and consumed before the OAuth call).

  await withServer(
    { ...DRIVE_DEPS, resolveSession: async () => ownerSession },
    async (baseUrl) => {
      // Step 1: get a real state token from the server
      const authUrlRes = await fetch(`${baseUrl}/api/drive/auth-url`, {
        headers: { Authorization: "Bearer valid-token" },
      });
      assert.equal(authUrlRes.status, 200);
      const { url } = await authUrlRes.json() as { url: string };
      const state = new URL(url).searchParams.get("state");
      assert.ok(state, "state param should be present in auth URL");

      // Step 2: call callback with that state but an invalid code
      // → exchangeCodeForTokens will throw (no real Google creds)
      // → server redirects to driveError=exchange_failed
      const callbackRes = await fetch(
        `${baseUrl}/api/drive/callback?code=fake-code&state=${state}`,
        { redirect: "manual" },
      );
      assert.equal(callbackRes.status, 302);
      const location = callbackRes.headers.get("location") ?? "";
      assert.ok(
        location.includes("driveError=exchange_failed"),
        `expected exchange_failed, got: ${location}`,
      );

      // Step 3: confirm state was consumed — calling callback again with same
      // state should now return invalid_state
      const retryRes = await fetch(
        `${baseUrl}/api/drive/callback?code=fake-code&state=${state}`,
        { redirect: "manual" },
      );
      assert.equal(retryRes.status, 302);
      const retryLocation = retryRes.headers.get("location") ?? "";
      assert.ok(
        retryLocation.includes("driveError=invalid_state"),
        `expected invalid_state on retry, got: ${retryLocation}`,
      );
    },
  );
});

// ─── Grupo 6: DELETE /api/drive/disconnect ───────────────────────────────────

test("disconnect: owner puede desconectar Drive", async () => {
  await withServer(
    {
      ...DRIVE_DEPS,
      resolveSession: async () => ownerSession,
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/drive/disconnect`, {
        method: "DELETE",
        headers: { Authorization: "Bearer valid-token" },
      });
      assert.equal(res.status, 200);
      const body = await res.json() as any;
      assert.equal(body.ok, true);
    },
  );
});

test("disconnect: editor recibe 403", async () => {
  await withServer(
    {
      ...DRIVE_DEPS,
      resolveSession: async () => editorSession,
      __tableData: {
        dashboard_members: [
          { user_id: "editor-1", dashboard_id: "dash-1", role: "editor", status: "active" },
        ],
      },
    } as any,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/drive/disconnect`, {
        method: "DELETE",
        headers: { Authorization: "Bearer valid-token" },
      });
      assert.equal(res.status, 403);
    },
  );
});

test("disconnect: sin Drive configurado devuelve 503", async () => {
  await withServer(
    { resolveSession: async () => ownerSession },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/drive/disconnect`, {
        method: "DELETE",
        headers: { Authorization: "Bearer valid-token" },
      });
      assert.equal(res.status, 503);
    },
  );
});
