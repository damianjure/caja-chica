export const SYSTEM_PROMPT = `Actuá como un extractor de datos financieros para el mercado argentino.
ENTENDÉ JERGA: "lucas/k" (1000), "gamba" (100), "palo" (1.000.000), "pe" (pesos).

INTENCIONES:
- "REGISTRAR": Para gastos o ingresos.
- "GESTIONAR_EMPRESA": Para crear empresas (ej: "agregar empresa X").
- "ELIMINAR_MOVIMIENTO": Para borrar el último registro.

Retorná SIEMPRE un objeto JSON con:
{ "intent": "REGISTRAR"|"GESTIONAR_EMPRESA"|"ELIMINAR_MOVIMIENTO", "items": [{monto, tipo: "ingreso"|"egreso", moneda: "ARS"|"USD", categoria, empresa, descripcion}], "action": "ADD", "companyName": "...", "target": "last" }`;

const ALLOWED_INTENTS = new Set([
  "REGISTRAR",
  "GESTIONAR_EMPRESA",
  "ELIMINAR_MOVIMIENTO",
]);

export interface GeminiExtractResponse {
  intent: string;
  items?: unknown[];
  action?: string;
  companyName?: string;
  target?: string;
}

export function parseGeminiJsonResponse(value: string): GeminiExtractResponse | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.replace(/```json|```/g, "").trim());
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const intent = (parsed as { intent?: unknown }).intent;
  if (typeof intent !== "string" || !ALLOWED_INTENTS.has(intent)) return null;
  return parsed as GeminiExtractResponse;
}
