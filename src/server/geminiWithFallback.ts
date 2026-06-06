import type { GenAILike } from "./app.ts";
import { alertSuperadmin } from "./alertSuperadmin.ts";

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
    alertSuperadmin({
      code: "gemini:primary-quota-exhausted",
      title: "Gemini: cuota de la key primaria agotada",
      problem: "La key primaria de Gemini devolvió 429/RESOURCE_EXHAUSTED. El backend está intentando con la key de fallback.",
      impact: fallback
        ? "Servicio degradado: dependés de la key de fallback. Si también se agota, la extracción por IA (texto/foto/voz) deja de funcionar."
        : "No hay key de fallback configurada: la extracción por IA fallará hasta que se restablezca la cuota.",
      context: { hasFallback: fallback ? "sí" : "no" },
      steps: [
        "Revisar el uso/cuota en Google AI Studio para la key primaria (GEMINI_API_KEY).",
        "Si es recurrente, subir el límite de cuota o configurar/rotar GEMINI_API_KEY_2 (fallback) en Cloud Run.",
        "Verificar que no haya un loop o volumen anómalo de extracciones disparando el consumo.",
      ],
    });
    if (!fallback) throw new GeminiUnavailableError();
    try {
      return await fallback.models.generateContent(args);
    } catch (err2) {
      if (isGeminiCapacityError(err2)) throw new GeminiUnavailableError();
      throw err2;
    }
  }
}
