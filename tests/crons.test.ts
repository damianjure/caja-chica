import test from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { createApp, type AppDeps, type AppSession } from "../src/server/app.ts";

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

function makeSupabase() {
  const stub = {
    from(_table: string) {
      const self: any = {
        select: () => self,
        eq: () => self,
        not: () => self,
        is: () => self,
        in: () => Promise.resolve({ data: [], error: null }),
        insert: () => Promise.resolve({ data: null, error: null }),
        update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
        limit: (n: number) => {
          const p: any = Promise.resolve({ data: [], error: null });
          p.single = () => Promise.resolve({ data: null, error: null });
          return p;
        },
        single: () => Promise.resolve({ data: null, error: null }),
        then(resolve: Function) {
          return Promise.resolve({ data: [], error: null }).then(resolve as any);
        },
      };
      return self;
    },
    auth: {
      getUser: async (_token: string) => ({ data: { user: null }, error: null }),
    },
  };
  return stub;
}

function makeBot() {
  const calls: unknown[] = [];
  return {
    api: {
      async sendMessage(chatId: unknown, text: unknown, _opts?: unknown) {
        calls.push({ chatId, text });
        return {};
      },
    },
    calls,
  };
}

function makeSession(): AppSession {
  return { userId: "user-1", email: "owner@example.com", role: "member", status: "active" };
}

async function startServer(deps: Partial<AppDeps>) {
  const fullDeps: AppDeps = {
    supabase: makeSupabase() as any,
    genAI: null as any,
    allowedOrigins: ["*"],
    botActive: false,
    resolveSession: async () => makeSession(),
    ...deps,
  };
  const app = createApp(fullDeps);
  return new Promise<{ port: number; close: () => void }>((res) => {
    const srv = app.listen(0, () => {
      const { port } = srv.address() as AddressInfo;
      res({ port, close: () => srv.close() });
    });
  });
}

async function post(port: number, path: string, headers: Record<string, string> = {}) {
  const res = await fetch(`http://localhost:${port}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// ---------------------------------------------------------------------------
// Auth middleware tests
// ---------------------------------------------------------------------------

test("crons: cronSecret undefined → 401 cron_disabled even with valid header", async () => {
  const { port, close } = await startServer({ cronSecret: undefined });
  try {
    const { status, data } = await post(port, "/api/crons/reminders", { "X-Cron-Secret": "anything" });
    assert.strictEqual(status, 401);
    assert.strictEqual(data.error, "cron_disabled");
  } finally {
    close();
  }
});

test("crons: missing X-Cron-Secret header → 401 invalid_secret", async () => {
  const { port, close } = await startServer({ cronSecret: "mysecret" });
  try {
    const { status, data } = await post(port, "/api/crons/reminders");
    assert.strictEqual(status, 401);
    assert.strictEqual(data.error, "invalid_secret");
  } finally {
    close();
  }
});

test("crons: wrong secret value → 401 invalid_secret", async () => {
  const { port, close } = await startServer({ cronSecret: "mysecret" });
  try {
    const { status, data } = await post(port, "/api/crons/reminders", { "X-Cron-Secret": "wrongvalue" });
    assert.strictEqual(status, 401);
    assert.strictEqual(data.error, "invalid_secret");
  } finally {
    close();
  }
});

test("crons: unequal-length secret → 401 no RangeError", async () => {
  const { port, close } = await startServer({ cronSecret: "short" });
  try {
    const { status, data } = await post(port, "/api/crons/reminders", { "X-Cron-Secret": "a-much-longer-value-than-expected" });
    assert.strictEqual(status, 401);
    assert.ok(data.error === "invalid_secret" || data.error === "cron_disabled");
  } finally {
    close();
  }
});

// ---------------------------------------------------------------------------
// Endpoint delegation tests
// ---------------------------------------------------------------------------

test("crons: valid secret on POST /api/crons/reminders → 200 {ok:true, sent:N}", async () => {
  const { port, close } = await startServer({ cronSecret: "test-secret" });
  try {
    const { status, data } = await post(port, "/api/crons/reminders", { "X-Cron-Secret": "test-secret" });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.ok, true);
    assert.ok("sent" in data, "response should have sent field");
  } finally {
    close();
  }
});

test("crons: valid secret on POST /api/crons/recurrentes → 200 {ok:true, processed:N}", async () => {
  const { port, close } = await startServer({ cronSecret: "test-secret" });
  try {
    const { status, data } = await post(port, "/api/crons/recurrentes", { "X-Cron-Secret": "test-secret" });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.ok, true);
    assert.ok("processed" in data, "response should have processed field");
  } finally {
    close();
  }
});

test("crons: valid secret on POST /api/crons/maintenance → 200 {ok:true}", async () => {
  const { port, close } = await startServer({ cronSecret: "test-secret" });
  try {
    const { status, data } = await post(port, "/api/crons/maintenance", { "X-Cron-Secret": "test-secret" });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.ok, true);
  } finally {
    close();
  }
});

test("crons: valid secret on POST /api/crons/invite-reminders → 200 {ok:true, sent:N}", async () => {
  const { port, close } = await startServer({ cronSecret: "test-secret" });
  try {
    const { status, data } = await post(port, "/api/crons/invite-reminders", { "X-Cron-Secret": "test-secret" });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.ok, true);
    assert.ok("sent" in data, "response should have sent field");
  } finally {
    close();
  }
});

test("crons: bot=null passed to router → reminders returns 200 {ok:true, sent:0}", async () => {
  const { port, close } = await startServer({ cronSecret: "test-secret", bot: null });
  try {
    const { status, data } = await post(port, "/api/crons/reminders", { "X-Cron-Secret": "test-secret" });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.sent, 0);
  } finally {
    close();
  }
});
