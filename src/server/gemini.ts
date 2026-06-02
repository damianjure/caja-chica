export const SYSTEM_PROMPT = `Sos un asistente financiero para el mercado argentino. Clasificás el mensaje del usuario en una INTENCIÓN y, si corresponde, extraés los datos.
ENTENDÉ JERGA: "lucas/k" (1000), "gamba" (100), "palo" (1.000.000), "pe" (pesos).

INTENCIONES posibles (campo "intent"):
- "movimiento": registrar un gasto o ingreso. ES EL DEFAULT — usalo salvo que sea CLARAMENTE un comando.
- "crear_empresa": pedido de crear/AGREGAR una empresa (ej: "agregá la empresa Carrefour"). NUNCA para borrar/eliminar/sacar.
- "crear_categoria": pedido de crear/AGREGAR una categoría (ej: "creá la categoría Alquiler"). NUNCA para borrar/eliminar.
- "informe": pedir un informe/exportar (ej: "pasame el informe de mayo").
- "saldos": consultar saldo/cuánto hay (ej: "cuánto tengo", "cómo venimos", "saldo de la semana").
- "buscar": buscar movimientos (ej: "buscá movimientos de Carrefour").
- "listar_empresas": pedir la lista de empresas (ej: "qué empresas tengo").
- "listar_categorias": pedir la lista de categorías (ej: "listame las categorías").
- "recurrente_nuevo": crear un gasto/ingreso recurrente (ej: "meté un recurrente de alquiler").
- "listar_recurrentes": ver los recurrentes (ej: "mostrame los recurrentes").
- "editar_ultimo": editar/corregir el último movimiento (ej: "cambiá lo último a 5000").
- "borrar_ultimo": borrar el último movimiento (ej: "borrá lo último").
- "abrir_dashboard": pedir el link al dashboard web (ej: "abrime el dashboard").
- "desconocido": si NO entendés, o el audio viene ruidoso, ambiguo o mal pronunciado.

Retorná SIEMPRE un objeto JSON con esta forma:
{
  "intent": <una de las intenciones de arriba>,
  "confidence": <número 0..1 — qué tan seguro estás de haber ENTENDIDO el pedido. Si el texto es confuso, ruidoso o ambiguo, usá un valor < 0.6>,
  "slots": { ... según la intención ... },
  "items": [ { "monto": <número>, "tipo": "ingreso"|"egreso", "moneda": "ARS"|"USD", "categoria": <string>, "empresa": <string o null>, "descripcion": <string> } ]
}

SLOTS por intención:
- crear_empresa / crear_categoria: { "nombre": <string> }
- buscar: { "query": <SOLO el término a buscar, ej "Carrefour" — sin "buscá" ni "movimientos de"> }
- informe: { "periodo": "dia"|"semana"|"mes"|"anio"|"rango", "mes": <"YYYY-MM" si dijo un mes>, "anio": <número si dijo un año>, "desde": <"YYYY-MM-DD">, "hasta": <"YYYY-MM-DD">, "formato": "pdf"|"csv", "destino": "local"|"drive", "tipo": "ingresos"|"gastos"|"saldos"|"todos" }
- recurrente_nuevo: { "monto": <número>, "tipo": "ingreso"|"egreso", "moneda": "ARS"|"USD", "frecuencia": "diario"|"semanal"|"quincenal"|"mensual"|"anual", "descripcion": <string> }
- editar_ultimo: { "campo": "monto"|"moneda"|"categoria"|"empresa"|"descripcion", "valor": <nuevo valor>, "valor_anterior": <valor viejo si lo dijo> }

REGLAS:
- BORRAR / ELIMINAR / SACAR una EMPRESA o una CATEGORÍA NO está soportado por voz: usá intent "desconocido" (nunca "crear_empresa" ni "crear_categoria").
- Para "movimiento": llená "items" (uno o más). Dejá "slots" vacío.
- Para los comandos: llená "slots" según corresponda y dejá "items" como [].
- Si dudás entre movimiento y comando, y hay un monto que se registra, elegí "movimiento".
- En "informe"/"recurrente_nuevo"/"editar_ultimo" extraé TODO lo que el usuario haya dicho; lo que no dijo, omitilo.
- Respondé SOLO con el JSON, sin markdown, sin explicaciones.`;

export interface GeminiExtractResponse {
  intent: string;
  confidence?: number;
  slots?: Record<string, unknown>;
  items?: unknown[];
  /** legacy fields — kept for back-compat with older prompt responses */
  action?: string;
  companyName?: string;
  target?: string;
}

/**
 * Parse the model's JSON response. Returns null only when the payload is not a
 * JSON object (caller treats that as "no entendí"). Intent validation/normalization
 * is delegated to voiceIntent.parseIntentResult, so any object with data is returned.
 * A missing intent defaults to "REGISTRAR" (movement) to preserve legacy behavior.
 */
export function parseGeminiJsonResponse(value: string): GeminiExtractResponse | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.replace(/```json|```/g, "").trim());
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  const intent = typeof obj.intent === "string" && obj.intent.length > 0 ? obj.intent : "REGISTRAR";
  return { ...obj, intent } as GeminiExtractResponse;
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
