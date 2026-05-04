import { existsSync } from "node:fs";
import { resolve } from "node:path";

import dotenv from "dotenv";

export function getRuntimeEnvPaths(cwd = process.cwd()) {
  return [resolve(cwd, ".env"), resolve(cwd, ".env.local")].filter((path) =>
    existsSync(path),
  );
}

export function loadRuntimeEnv(cwd = process.cwd()) {
  for (const path of getRuntimeEnvPaths(cwd)) {
    dotenv.config({ path, override: false });
  }
}
