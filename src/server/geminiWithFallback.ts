import type { GenAILike } from "./app.ts";

export class GeminiUnavailableError extends Error {
  constructor() {
    super("Gemini AI unavailable — quota exhausted on all configured keys");
    this.name = "GeminiUnavailableError";
  }
}

/**
 * True when Gemini cannot serve the request due to capacity limits:
 *   - 429 / RESOURCE_EXHAUSTED → quota exhausted (key-specific; fallback key may help)
 *   - 503 / UNAVAILABLE / "model is overloaded" → transient overload (model-wide)
 * Both cases should degrade gracefully into a GeminiUnavailableError rather than
 * bubbling up as a generic 500.
 */
export function isGeminiCapacityError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; message?: string };
  if (e.status === 429 || e.status === 503) return true;
  if (typeof e.message !== "string") return false;
  return /RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded/i.test(e.message);
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
    if (!isGeminiCapacityError(err)) throw err;
    console.warn("[gemini] Primary key quota exhausted — trying fallback key");
    if (!fallback) throw new GeminiUnavailableError();
    try {
      return await fallback.models.generateContent(args);
    } catch (err2) {
      if (isGeminiCapacityError(err2)) throw new GeminiUnavailableError();
      throw err2;
    }
  }
}
