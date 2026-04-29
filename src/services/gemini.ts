import { GoogleGenAI, Type } from "@google/genai";

export interface ExtractedItem {
  monto: number | null;
  tipo: "ingreso" | "egreso";
  moneda: "ARS" | "USD";
  categoria: string;
  empresa: string | null;
  descripcion: string;
}

const SYSTEM_PROMPT = `Actuá como un extractor de datos financieros y gestor experto para el mercado argentino.
Tu función es transformar mensajes informales (texto o transcripciones) en comandos y datos estructurados.

REGLAS DE INTENCIONES (intent):
1. "REGISTRAR": Para gastos o ingresos.
2. "GESTIONAR_EMPRESA": Para crear o borrar empresas.
3. "ELIMINAR_MOVIMIENTO": Para borrar el registro más reciente.
4. "CONSULTAR": Para pedir informes o balances.

REGLAS DE MONEDA: ARS (default), USD (dólares, verdes).
REGLAS DE TIPO: "ingreso" o "egreso".

EJEMPLOS:
"compré pan por 500 pe" -> {"intent": "REGISTRAR", "items": [{"monto": 500, "tipo": "egreso", "moneda": "ARS", "categoria": "comida", "empresa": null, "descripcion": "pan"}]}
"agregar empresa Taller Central" -> {"intent": "GESTIONAR_EMPRESA", "action": "ADD", "companyName": "Taller Central"}
"borrar el último" -> {"intent": "ELIMINAR_MOVIMIENTO", "target": "last"}

RESTRICCIÓN: Si no hay intención clara, devolvé {"error": "no_data_found"}.`;

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined in the environment.");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

export type GeminiResponse = 
  | { intent: "REGISTRAR"; items: ExtractedItem[] }
  | { intent: "GESTIONAR_EMPRESA"; action: "ADD" | "DELETE"; companyName: string }
  | { intent: "ELIMINAR_MOVIMIENTO"; target: "last" | string }
  | { intent: "CONSULTAR"; query: string }
  | { error: string };

export async function extractFinancialData(text: string): Promise<GeminiResponse> {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: text,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intent: { type: Type.STRING, enum: ["REGISTRAR", "GESTIONAR_EMPRESA", "ELIMINAR_MOVIMIENTO", "CONSULTAR"] },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  monto: { type: Type.NUMBER, nullable: true },
                  tipo: { type: Type.STRING, enum: ["ingreso", "egreso"] },
                  moneda: { type: Type.STRING, enum: ["ARS", "USD"] },
                  categoria: { type: Type.STRING },
                  empresa: { type: Type.STRING, nullable: true },
                  descripcion: { type: Type.STRING }
                },
                required: ["tipo", "moneda", "categoria", "descripcion"]
              }
            },
            action: { type: Type.STRING },
            companyName: { type: Type.STRING },
            target: { type: Type.STRING },
            query: { type: Type.STRING },
            error: { type: Type.STRING, nullable: true }
          }
        }
      }
    });

    return JSON.parse(response.text || '{}') as GeminiResponse;
  } catch (error) {
    console.error("Error extracting data:", error);
    return { error: error instanceof Error ? error.message : "failed_to_process" };
  }
}
