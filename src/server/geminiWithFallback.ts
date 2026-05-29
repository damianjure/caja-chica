import type { GenAILike } from "./app.ts";

export class GeminiUnavailableError extends Error {
  constructor() {
    super("Gemini AI unavailable — quota exhausted on all configured keys");
    this.name = "GeminiUnavailableError";
  }
}

export function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; message?: string };
  return (
    e.status === 429 ||
    (typeof e.message === "string" && e.message.includes("RESOURCE_EXHAUSTED"))
  );
}

/**
 * Wraps a text-only generateContent call with fallback to a second API key.
 * For media calls (photos/audio) pass null as fallback — those can't reuse
 * uploaded files across keys.
 */
export async function geminiGenerateText(
  primary: GenAILike,
  fallback: GenAILike | null,
  args: Parameters<GenAILike["models"]["generateContent"]>[0],
): Promise<Awaited<ReturnType<GenAILike["models"]["generateContent"]>>> {
  try {
    return await primary.models.generateContent(args);
  } catch (err) {
    if (!isQuotaError(err)) throw err;
    console.warn("[gemini] Primary key quota exhausted — trying fallback key");
    if (!fallback) throw new GeminiUnavailableError();
    try {
      return await fallback.models.generateContent(args);
    } catch (err2) {
      if (isQuotaError(err2)) throw new GeminiUnavailableError();
      throw err2;
    }
  }
}
