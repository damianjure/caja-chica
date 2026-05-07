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

export const RECEIPT_SYSTEM_PROMPT = `Sos un extractor de datos de tickets y facturas para el mercado argentino.
Analizá la imagen y extraé la información financiera principal.

Retorná SIEMPRE un objeto JSON con esta estructura exacta:
{
  "monto": <número total del ticket, sin signos>,
  "moneda": "ARS" | "USD",
  "tipo": "egreso",
  "empresa": <nombre del comercio o null>,
  "cuit": <CUIT del emisor sin guiones o null>,
  "categoria": <categoría apropiada>,
  "descripcion": <descripción breve del gasto>,
  "fecha": <fecha en formato YYYY-MM-DD o null>,
  "confidence": <número entre 0 y 1 indicando confianza en la extracción>
}

Si no podés extraer el monto con seguridad, usá confidence menor a 0.5.
Respondé SOLO con el JSON, sin markdown, sin explicaciones.`;

export const HANDWRITTEN_SYSTEM_PROMPT = `Sos un extractor permisivo de datos financieros de notas manuscritas o imágenes poco claras para el mercado argentino.
ENTENDÉ JERGA: "lucas/k" (1000), "gamba" (100), "palo" (1.000.000), "pe" (pesos).

Intentá extraer lo que puedas. Si algo no está claro, inferí con sentido común.

Retorná SIEMPRE un objeto JSON con esta estructura exacta:
{
  "monto": <número o null si no podés determinarlo>,
  "moneda": "ARS" | "USD",
  "tipo": "egreso" | "ingreso",
  "empresa": <nombre o null>,
  "cuit": null,
  "categoria": <categoría apropiada o "Varios">,
  "descripcion": <descripción breve>,
  "fecha": null,
  "confidence": <número entre 0 y 1>
}

Respondé SOLO con el JSON, sin markdown, sin explicaciones.`;

export const MULTI_RECEIPT_SYSTEM_PROMPT = `Sos un extractor de datos de múltiples tickets o facturas para el mercado argentino.
Se te enviarán varias imágenes. Extraé los datos de CADA UNA por separado.

Retorná SIEMPRE un array JSON donde cada elemento tiene:
{
  "monto": <número total del ticket, sin signos>,
  "moneda": "ARS" | "USD",
  "tipo": "egreso",
  "empresa": <nombre del comercio o null>,
  "cuit": <CUIT del emisor sin guiones o null>,
  "categoria": <categoría apropiada>,
  "descripcion": <descripción breve del gasto>,
  "fecha": <fecha en formato YYYY-MM-DD o null>,
  "confidence": <número entre 0 y 1>
}

Respondé SOLO con el array JSON, sin markdown, sin explicaciones.`;

export interface PhotoExtractionResult {
  monto: number | null;
  moneda: "ARS" | "USD";
  tipo: "ingreso" | "egreso";
  empresa: string | null;
  cuit: string | null;
  categoria: string;
  descripcion: string;
  fecha: string | null;
  confidence: number;
}

export function parsePhotoExtractionResult(value: string): PhotoExtractionResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.replace(/```json|```/g, "").trim());
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;

  const moneda = obj.moneda === "USD" ? "USD" : "ARS";
  const tipo = obj.tipo === "ingreso" ? "ingreso" : "egreso";
  const confidence = typeof obj.confidence === "number" ? Math.max(0, Math.min(1, obj.confidence)) : 0;
  const monto = typeof obj.monto === "number" && Number.isFinite(obj.monto) && obj.monto > 0 ? obj.monto : null;

  return {
    monto,
    moneda,
    tipo,
    empresa: typeof obj.empresa === "string" && obj.empresa.trim() ? obj.empresa.trim() : null,
    cuit: typeof obj.cuit === "string" && obj.cuit.trim() ? obj.cuit.trim() : null,
    categoria: typeof obj.categoria === "string" && obj.categoria.trim() ? obj.categoria.trim() : "Varios",
    descripcion: typeof obj.descripcion === "string" && obj.descripcion.trim() ? obj.descripcion.trim() : "Gasto registrado desde foto",
    fecha: typeof obj.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(obj.fecha) ? obj.fecha : null,
    confidence,
  };
}

export function parseMultiPhotoExtractionResult(value: string): PhotoExtractionResult[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.replace(/```json|```/g, "").trim());
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const results: PhotoExtractionResult[] = [];
  for (const item of parsed) {
    const result = parsePhotoExtractionResult(JSON.stringify(item));
    if (result) results.push(result);
  }
  return results.length > 0 ? results : null;
}
