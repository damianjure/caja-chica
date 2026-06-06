import type { GeminiResponse, ExtractedItem } from "./api";

// The backend /api/extract shares its prompt with the Telegram bot, so it
// returns the bot's intent vocabulary ("movimiento", "crear_empresa", ...).
// The web composer only supports a subset (REGISTRAR / GESTIONAR_EMPRESA /
// ELIMINAR_MOVIMIENTO). Translate the raw response into the union the composer
// understands. Without this every movement entry fell through to the
// "Intención no soportada todavía." branch.

interface RawExtract {
  intent?: string;
  items?: ExtractedItem[];
  slots?: Record<string, unknown> | null;
  error?: string;
}

const WEB_ONLY_TELEGRAM_HINT =
  "Eso se hace desde el bot de Telegram. Acá cargás movimientos por texto, foto o PDF.";

export function normalizeExtractResponse(raw: unknown): GeminiResponse {
  if (!raw || typeof raw !== "object") return { error: "no_data_found" };
  const r = raw as RawExtract;
  if (typeof r.error === "string") return { error: r.error };

  const intent = (r.intent ?? "movimiento").toLowerCase();

  switch (intent) {
    case "movimiento":
    case "registrar":
      return { intent: "REGISTRAR", items: Array.isArray(r.items) ? r.items : [] };
    case "crear_empresa": {
      const nombre = typeof r.slots?.nombre === "string" ? r.slots.nombre : "";
      return { intent: "GESTIONAR_EMPRESA", action: "ADD", companyName: nombre };
    }
    case "borrar_ultimo":
      return { intent: "ELIMINAR_MOVIMIENTO", target: "last" };
    case "desconocido":
      return { error: "no_data_found" };
    default:
      // saldos / buscar / informe / listar_* / recurrente_* / editar_ultimo /
      // abrir_dashboard / recordatorio_config — bot-only commands.
      return { error: WEB_ONLY_TELEGRAM_HINT };
  }
}
