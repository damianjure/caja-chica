/**
 * voiceIntent.ts — pure helpers for the bot voice/text intent router.
 *
 * The Telegram bot already extracts MOVEMENTS from voice/free text. This module
 * lets a single Gemini call ALSO classify the utterance into an action intent
 * (crear_empresa, informe, saldos, ...) so spoken/typed phrases trigger the same
 * actions as the inline menu — without a second model call.
 *
 * All functions here are pure (no I/O) so they can be tested in isolation.
 * The Gemini call and the actual handler dispatch live in the bot wiring.
 */

export type BotIntent =
  | "movimiento" // default — dictate/load a movement (existing behavior)
  | "crear_empresa"
  | "crear_categoria"
  | "informe"
  | "saldos"
  | "buscar"
  | "listar_empresas"
  | "listar_categorias"
  | "recurrente_nuevo"
  | "listar_recurrentes"
  | "editar_ultimo"
  | "borrar_ultimo"
  | "abrir_dashboard"
  | "desconocido"; // sentinel — unrecognized utterance, ask the user to repeat

/**
 * Intents the router will act on. `desconocido` is the sentinel for anything else.
 *
 * NOTE: `borrar_empresa` is deliberately ABSENT (user decision). Deleting a company
 * has cascading impact, so it stays manual via the "Gestionar" keyboard and is never
 * triggerable by voice — a spoken "borrá la empresa X" resolves to `desconocido`.
 */
export const KNOWN_INTENTS: BotIntent[] = [
  "movimiento",
  "crear_empresa",
  "crear_categoria",
  "informe",
  "saldos",
  "buscar",
  "listar_empresas",
  "listar_categorias",
  "recurrente_nuevo",
  "listar_recurrentes",
  "editar_ultimo",
  "borrar_ultimo",
  "abrir_dashboard",
];

/**
 * Legacy intent strings the bot's extraction prompt historically emitted.
 * Mapped to the new vocabulary so behavior is preserved even if the model
 * (or a cached prompt) still returns the old labels.
 */
const LEGACY_INTENT_MAP: Record<string, BotIntent> = {
  REGISTRAR: "movimiento",
  GESTIONAR_EMPRESA: "crear_empresa",
  ELIMINAR_MOVIMIENTO: "borrar_ultimo",
};

/** Below this confidence we ask the user to confirm what they said (ASR/intent guard). */
export const INTENT_CONFIRM_THRESHOLD = 0.6;

/** Intents that ALWAYS require an explicit confirmation step before executing. */
export const CONFIRM_INTENTS: BotIntent[] = ["borrar_ultimo"];

export type IntentSlots = Record<string, string | number | null>;

export interface IntentResult {
  intent: BotIntent;
  /** 0..1 — combined ASR + intent confidence reported by the model. */
  confidence: number;
  slots: IntentSlots;
  /** Best guess of what the user said — echoed back when we need to clarify. */
  transcript: string;
}

export type IntentDecision =
  | { action: "execute"; result: IntentResult }
  | { action: "confirm"; result: IntentResult; reason: "destructive" }
  | { action: "clarify"; result: IntentResult; reason: "low_confidence" | "unknown" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampConfidence(raw: unknown): number {
  if (typeof raw !== "number" || Number.isNaN(raw)) return 0;
  if (raw < 0) return 0;
  if (raw > 1) return 1;
  return raw;
}

function normalizeIntent(raw: unknown): BotIntent {
  if (raw === undefined || raw === null || raw === "") return "movimiento";
  if (typeof raw !== "string") return "desconocido";
  if (raw in LEGACY_INTENT_MAP) return LEGACY_INTENT_MAP[raw];
  return (KNOWN_INTENTS as string[]).includes(raw) ? (raw as BotIntent) : "desconocido";
}

/**
 * Normalize a raw model response into a typed IntentResult.
 * Defensive: garbage/missing fields collapse to a safe default (movimiento, conf 0)
 * so the caller can decide to clarify rather than act on noise.
 */
export function parseIntentResult(raw: unknown, fallbackTranscript: string): IntentResult {
  if (!isRecord(raw)) {
    return { intent: "movimiento", confidence: 0, slots: {}, transcript: fallbackTranscript };
  }

  const transcript =
    typeof raw.transcript === "string" && raw.transcript.trim().length > 0
      ? raw.transcript
      : fallbackTranscript;

  return {
    intent: normalizeIntent(raw.intent),
    confidence: clampConfidence(raw.confidence),
    slots: isRecord(raw.slots) ? (raw.slots as IntentSlots) : {},
    transcript,
  };
}

/**
 * Pure 3-way decision. Order matters:
 *  1. unknown intent           → clarify (we did not understand)
 *  2. confidence below floor   → clarify (noisy / mispronounced — confirm before acting)
 *  3. destructive intent       → confirm (explicit confirmation card)
 *  4. otherwise                → execute
 *
 * Low confidence is checked BEFORE the destructive gate on purpose: we never confirm
 * a destructive action we are not sure was even requested.
 */
export function resolveIntentAction(result: IntentResult): IntentDecision {
  if (result.intent === "desconocido") {
    return { action: "clarify", result, reason: "unknown" };
  }
  if (result.confidence < INTENT_CONFIRM_THRESHOLD) {
    return { action: "clarify", result, reason: "low_confidence" };
  }
  if (CONFIRM_INTENTS.includes(result.intent)) {
    return { action: "confirm", result, reason: "destructive" };
  }
  return { action: "execute", result };
}
