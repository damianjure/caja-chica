/**
 * intentSlots.ts — pure normalizers + echo builders for slot-prefilled intents
 * (informe, recurrente_nuevo, editar_ultimo).
 *
 * Gemini returns loose Spanish-ish slots; these functions coerce them into typed,
 * validated shapes and report which required slots are still missing. The bot then
 * echoes the understood request for confirmation before executing.
 *
 * All pure (no I/O) → unit-testable.
 */

type Raw = Record<string, unknown>;

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export type ReportSlotPeriod = "day" | "week" | "month" | "year" | "range";

export interface ReportSlots {
  period: ReportSlotPeriod | null;
  month: string | null; // YYYY-MM (period=month)
  anchorDate: string | null; // YYYY-MM-DD (period=day/week)
  from: string | null;
  to: string | null;
  year: number | null;
  format: "csv" | "pdf";
  destination: "local" | "drive";
  tipo: "ingreso" | "egreso" | "saldos" | "all";
}

function mapReportPeriod(raw: string | null): ReportSlotPeriod | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (["dia", "día", "day", "hoy", "diario"].includes(v)) return "day";
  if (["semana", "week", "semanal"].includes(v)) return "week";
  if (["mes", "month", "mensual"].includes(v)) return "month";
  if (["anio", "año", "ano", "year", "anual"].includes(v)) return "year";
  if (["rango", "range", "personalizado"].includes(v)) return "range";
  return null;
}

function mapReportTipo(raw: string | null): ReportSlots["tipo"] {
  if (!raw) return "all";
  const v = raw.toLowerCase();
  if (["gasto", "gastos", "egreso", "egresos"].includes(v)) return "egreso";
  if (["ingreso", "ingresos"].includes(v)) return "ingreso";
  if (["saldo", "saldos"].includes(v)) return "saldos";
  return "all";
}

const YYYY_MM = /^\d{4}-\d{2}$/;
const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeReportSlots(raw: Raw): { value: ReportSlots; missing: string[] } {
  const period = mapReportPeriod(str(raw.periodo ?? raw.period));
  const monthRaw = str(raw.mes ?? raw.month);
  const month = monthRaw && YYYY_MM.test(monthRaw) ? monthRaw : null;
  const anchorRaw = str(raw.fecha ?? raw.anchorDate ?? raw.anchor);
  const anchorDate = anchorRaw && YYYY_MM_DD.test(anchorRaw) ? anchorRaw : null;
  const fromRaw = str(raw.desde ?? raw.from);
  const toRaw = str(raw.hasta ?? raw.to);
  const from = fromRaw && YYYY_MM_DD.test(fromRaw) ? fromRaw : null;
  const to = toRaw && YYYY_MM_DD.test(toRaw) ? toRaw : null;
  const yearRaw = raw.anio ?? raw.year;
  const year = typeof yearRaw === "number" ? yearRaw : (str(yearRaw) && /^\d{4}$/.test(str(yearRaw)!) ? Number(str(yearRaw)) : null);

  const formatRaw = (str(raw.formato ?? raw.format) ?? "").toLowerCase();
  const format = formatRaw === "csv" ? "csv" : "pdf";
  const destRaw = (str(raw.destino ?? raw.destination) ?? "").toLowerCase();
  const destination = destRaw === "drive" ? "drive" : "local";
  const tipo = mapReportTipo(str(raw.tipo));

  const value: ReportSlots = { period, month, anchorDate, from, to, year, format, destination, tipo };

  const missing: string[] = [];
  if (!period) missing.push("period");
  if (period === "range" && (!from || !to)) missing.push("rango");
  return { value, missing };
}

const PERIOD_LABEL: Record<ReportSlotPeriod, string> = {
  day: "del día",
  week: "de la semana",
  month: "del mes",
  year: "del año",
  range: "del rango",
};

export function buildReportEcho(s: ReportSlots): string {
  const periodLabel = s.period
    ? (s.period === "month" && s.month ? `de ${s.month}` : PERIOD_LABEL[s.period])
    : "(período sin definir)";
  const tipoLabel = s.tipo === "all" ? "todo" : s.tipo === "saldos" ? "saldos" : s.tipo === "ingreso" ? "ingresos" : "gastos";
  const dest = s.destination === "drive" ? " · Drive" : "";
  return `📊 Informe ${periodLabel} · ${tipoLabel} · ${s.format.toUpperCase()}${dest}`;
}

// ---------------------------------------------------------------------------
// Recurrente
// ---------------------------------------------------------------------------

export type Frecuencia = "diario" | "semanal" | "quincenal" | "mensual" | "anual";

export interface RecurrenteSlots {
  monto: number | null;
  tipo: "ingreso" | "egreso" | null;
  moneda: "ARS" | "USD";
  frecuencia: Frecuencia | null;
  descripcion: string | null;
  /** Day of month (1-31) for monthly recurrences — optional. */
  dia?: number | null;
  /** Category — optional; falls back to a tipo-based default on create. */
  categoria?: string | null;
}

function coerceMonto(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  const s = str(v);
  if (!s) return null;
  // es-AR: dots are thousand separators, comma is decimal.
  const normalized = s.replace(/\./g, "").replace(",", ".").replace(/[^0-9.]/g, "");
  const n = parseFloat(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function mapRecurrenteTipo(raw: string | null): "ingreso" | "egreso" | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (["ingreso", "ingresos", "cobro"].includes(v)) return "ingreso";
  if (["egreso", "egresos", "gasto", "gastos", "pago"].includes(v)) return "egreso";
  return null;
}

function mapFrecuencia(raw: string | null): Frecuencia | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (["diario", "diaria", "dia", "día", "daily"].includes(v)) return "diario";
  if (["semanal", "semana", "weekly"].includes(v)) return "semanal";
  if (["quincenal", "quincena"].includes(v)) return "quincenal";
  if (["mensual", "mes", "monthly"].includes(v)) return "mensual";
  if (["anual", "año", "anio", "yearly"].includes(v)) return "anual";
  return null;
}

export function normalizeRecurrenteSlots(raw: Raw): { value: RecurrenteSlots; missing: string[] } {
  const monto = coerceMonto(raw.monto);
  const tipo = mapRecurrenteTipo(str(raw.tipo));
  const monedaRaw = (str(raw.moneda) ?? "").toLowerCase();
  const moneda: "ARS" | "USD" = ["usd", "dolar", "dolares", "dólares", "us$", "u$s"].includes(monedaRaw) ? "USD" : "ARS";
  const frecuencia = mapFrecuencia(str(raw.frecuencia));
  const descripcion = str(raw.descripcion);
  const diaNum = coerceMonto(raw.dia);
  const dia = diaNum !== null && Number.isInteger(diaNum) && diaNum >= 1 && diaNum <= 31 ? diaNum : null;
  const categoria = str(raw.categoria);

  const value: RecurrenteSlots = { monto, tipo, moneda, frecuencia, descripcion, dia, categoria };

  const missing: string[] = [];
  if (monto === null) missing.push("monto");
  if (tipo === null) missing.push("tipo");
  if (frecuencia === null) missing.push("frecuencia");
  if (descripcion === null) missing.push("descripcion");
  return { value, missing };
}

export function buildRecurrenteEcho(s: RecurrenteSlots): string {
  const monto = s.monto !== null ? `${s.monto}` : "(monto?)";
  const tipo = s.tipo === "egreso" ? "gasto" : (s.tipo ?? "(ingreso/gasto?)");
  const frec = s.frecuencia ?? "(frecuencia?)";
  const desc = s.descripcion ?? "(descripción?)";
  const dia = s.dia ? ` · día ${s.dia}` : "";
  const cat = s.categoria ? ` · ${s.categoria}` : "";
  return `🔄 Recurrente: ${monto} ${s.moneda} (${tipo}) · ${frec}${dia}${cat} · ${desc}`;
}

// ---------------------------------------------------------------------------
// Editar último
// ---------------------------------------------------------------------------

export type EditField = "monto" | "moneda" | "categoria" | "empresa" | "descripcion";

export interface EditSlots {
  campo: EditField | null;
  valor: string | null;
  valorAnterior: string | null;
}

function mapEditField(raw: string | null): EditField | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (["monto", "valor", "importe", "cantidad"].includes(v)) return "monto";
  if (["moneda", "divisa"].includes(v)) return "moneda";
  if (["categoria", "categoría", "rubro"].includes(v)) return "categoria";
  if (["empresa", "comercio", "negocio", "proveedor"].includes(v)) return "empresa";
  if (["descripcion", "descripción", "detalle", "nota"].includes(v)) return "descripcion";
  return null;
}

function mapMonedaValue(raw: string): string {
  const v = raw.toLowerCase();
  if (["usd", "dolar", "dolares", "dólares", "us$", "u$s"].includes(v)) return "USD";
  if (["ars", "peso", "pesos", "$"].includes(v)) return "ARS";
  return raw;
}

export function normalizeEditSlots(raw: Raw): { value: EditSlots; valid: boolean } {
  const campo = mapEditField(str(raw.campo ?? raw.field));
  let valor = str(raw.valor ?? raw.value);
  const valorAnterior = str(raw.valor_anterior ?? raw.valorAnterior ?? raw.anterior);

  if (campo === "moneda" && valor) valor = mapMonedaValue(valor);

  const value: EditSlots = { campo, valor, valorAnterior };
  const valid = campo !== null && valor !== null;
  return { value, valid };
}

const EDIT_FIELD_LABEL: Record<EditField, string> = {
  monto: "monto",
  moneda: "moneda",
  categoria: "categoría",
  empresa: "empresa",
  descripcion: "descripción",
};

export function buildEditEcho(s: EditSlots): string {
  const field = s.campo ? EDIT_FIELD_LABEL[s.campo] : "(campo?)";
  const from = s.valorAnterior ? ` (de ${s.valorAnterior})` : "";
  return `✏️ Cambiar ${field}${from} a ${s.valor ?? "(?)"}`;
}
