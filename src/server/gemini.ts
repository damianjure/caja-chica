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

export const RECEIPT_SYSTEM_PROMPT = `Extraé datos financieros de una factura, recibo o ticket de compra.
Retorná SIEMPRE un JSON con:
{ "items": [{ "monto": number, "tipo": "egreso", "moneda": "ARS"|"USD", "categoria": string, "empresa": string, "descripcion": string, "confidence": number }] }
"confidence" es 0.0-1.0 según claridad de los datos en la imagen.`;

export const HANDWRITTEN_SYSTEM_PROMPT = `Extraé datos de un registro manuscrito de gastos o ingresos.
Retorná SIEMPRE un JSON con:
{ "items": [{ "monto": number, "tipo": "ingreso"|"egreso", "moneda": "ARS"|"USD", "categoria": string, "empresa": string, "descripcion": string, "confidence": number }] }
"confidence" es 0.0-1.0 según legibilidad de la letra.`;

export const MULTI_RECEIPT_SYSTEM_PROMPT = `Extraé múltiples transacciones de múltiples recibos o facturas en la imagen.
Retorná SIEMPRE un JSON con:
{ "items": [{ "monto": number, "tipo": "egreso"|"ingreso", "moneda": "ARS"|"USD", "categoria": string, "empresa": string, "descripcion": string, "confidence": number }, ...] }
"confidence" es 0.0-1.0 por item. Incluí TODOS los recibos visibles.`;

export interface PhotoExtractionResult {
  items: Array<{
    monto: number;
    tipo: "ingreso" | "egreso";
    moneda: "ARS" | "USD";
    categoria: string;
    empresa: string;
    descripcion: string;
    confidence: number;
  }>;
}

export function parsePhotoExtractionResult(value: string): PhotoExtractionResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.replace(/```json|```/g, "").trim());
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const items = (parsed as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;

  const valid = items.every((item: unknown) => {
    if (!item || typeof item !== "object") return false;
    const obj = item as Record<string, unknown>;
    return (
      typeof obj.monto === "number" &&
      (obj.tipo === "ingreso" || obj.tipo === "egreso") &&
      (obj.moneda === "ARS" || obj.moneda === "USD") &&
      typeof obj.categoria === "string" &&
      typeof obj.empresa === "string" &&
      typeof obj.descripcion === "string" &&
      typeof obj.confidence === "number" &&
      obj.confidence >= 0 &&
      obj.confidence <= 1
    );
  });

  return valid ? (parsed as PhotoExtractionResult) : null;
}

export function parseMultiPhotoExtractionResult(value: string): PhotoExtractionResult | null {
  return parsePhotoExtractionResult(value);
}
