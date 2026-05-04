import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getRuntimeEnvPaths } from "../src/server/env.ts";

test("detecta .env.local cuando no existe .env", () => {
  const dir = mkdtempSync(join(tmpdir(), "boteado-env-"));
  writeFileSync(join(dir, ".env.local"), "VITE_API_URL=http://localhost:8080\n");

  const paths = getRuntimeEnvPaths(dir);

  assert.deepEqual(paths, [join(dir, ".env.local")]);
});

test("mantiene orden .env y luego .env.local", () => {
  const dir = mkdtempSync(join(tmpdir(), "boteado-env-"));
  writeFileSync(join(dir, ".env"), "SUPABASE_URL=https://example.supabase.co\n");
  writeFileSync(join(dir, ".env.local"), "VITE_API_URL=http://localhost:8080\n");

  const paths = getRuntimeEnvPaths(dir);

  assert.deepEqual(paths, [join(dir, ".env"), join(dir, ".env.local")]);
});
