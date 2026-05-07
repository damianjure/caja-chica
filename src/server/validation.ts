export interface MovimientoInput {
  monto: number | null;
  tipo: "ingreso" | "egreso";
  moneda: "ARS" | "USD";
  categoria?: string;
  empresa?: string | null;
  descripcion: string;
}

export interface SaveMovimientosRequest {
  items: MovimientoInput[];
  originalText: string;
}

export interface PaginationQuery {
  limit: number;
  before: string | null;
}

export type AppRole = "superadmin" | "admin" | "member";

export interface InvitationRequest {
  email: string;
  role: AppRole;
}

export interface BudgetRequest {
  period: string;
  categoria: string;
  moneda: "ARS" | "USD";
  monto: number;
}

export interface ReconciliationRequest {
  conciliado: boolean;
  notas?: string;
}

export interface UpdateMovimientoRequest {
  monto?: number;
  categoria?: string;
  empresa?: string | null;
  descripcion?: string;
  tipo?: "ingreso" | "egreso";
  moneda?: "ARS" | "USD";
}

export interface UpdateEmpresaRequest {
  nombre: string;
}

export type ReportExportFormat = "csv" | "pdf";
export type ReportPeriod = "day" | "week" | "month" | "range";
export type ReportMovementType = "all" | "ingreso" | "egreso";
export type ReportCurrency = "all" | "ARS" | "USD";
export type ReportDestination = "local" | "drive";

export interface ReportExportRequest {
  format: ReportExportFormat;
  period: ReportPeriod;
  anchorDate?: string;
  month?: string;
  from?: string;
  to?: string;
  company: string;
  tipo: ReportMovementType;
  moneda: ReportCurrency;
  destination: ReportDestination;
}

export type DashboardMembershipRole = "viewer" | "editor";

export interface DashboardInvitationRequest {
  email: string;
  role: DashboardMembershipRole;
}

function isIsoDate(value: string) {
  return !Number.isNaN(Date.parse(value));
}

function isPeriod(value: string) {
  return /^\d{4}-\d{2}$/.test(value);
}

function isRole(value: unknown): value is AppRole {
  return value === "superadmin" || value === "admin" || value === "member";
}

function isDashboardMembershipRole(value: unknown): value is DashboardMembershipRole {
  return value === "viewer" || value === "editor";
}

function isReportFormat(value: unknown): value is ReportExportFormat {
  return value === "csv" || value === "pdf";
}

function isReportPeriod(value: unknown): value is ReportPeriod {
  return value === "day" || value === "week" || value === "month" || value === "range";
}

function isReportMovementType(value: unknown): value is ReportMovementType {
  return value === "all" || value === "ingreso" || value === "egreso";
}

function isReportCurrency(value: unknown): value is ReportCurrency {
  return value === "all" || value === "ARS" || value === "USD";
}

function isReportDestination(value: unknown): value is ReportDestination {
  return value === "local" || value === "drive";
}

function isMovimientoInput(value: unknown): value is MovimientoInput {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;

  const validTipo = item.tipo === "ingreso" || item.tipo === "egreso";
  const validMoneda = item.moneda === "ARS" || item.moneda === "USD";
  const validMonto =
    item.monto === null ||
    (typeof item.monto === "number" && Number.isFinite(item.monto));
  const validDescripcion =
    typeof item.descripcion === "string" && item.descripcion.trim().length > 0;
  const validCategoria =
    item.categoria === undefined || typeof item.categoria === "string";
  const validEmpresa =
    item.empresa === undefined ||
    item.empresa === null ||
    typeof item.empresa === "string";

  return (
    validTipo &&
    validMoneda &&
    validMonto &&
    validDescripcion &&
    validCategoria &&
    validEmpresa
  );
}

export function parseSaveMovimientosRequest(
  value: unknown,
): SaveMovimientosRequest | null {
  if (!value || typeof value !== "object") return null;

  const payload = value as Record<string, unknown>;
  if (
    typeof payload.originalText !== "string" ||
    payload.originalText.trim().length === 0 ||
    !Array.isArray(payload.items) ||
    payload.items.length === 0 ||
    !payload.items.every(isMovimientoInput)
  ) {
    return null;
  }

  return {
    items: payload.items,
    originalText: payload.originalText,
  };
}

export function parseEmpresaRequest(value: unknown): { nombre: string } | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  if (typeof payload.nombre !== "string" || payload.nombre.trim().length === 0) {
    return null;
  }
  return { nombre: payload.nombre.trim() };
}

export const EXTRACT_TEXT_MAX_LENGTH = 2000;

export function parseExtractRequest(
  value: unknown,
): { text: string; categories: Array<{ nombre: string }> } | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  if (typeof payload.text !== "string") return null;
  const trimmed = payload.text.trim();
  if (trimmed.length === 0 || trimmed.length > EXTRACT_TEXT_MAX_LENGTH) {
    return null;
  }

  const categories = Array.isArray(payload.categories)
    ? payload.categories.filter(
        (category): category is { nombre: string } =>
          !!category &&
          typeof category === "object" &&
          typeof (category as Record<string, unknown>).nombre === "string",
      )
    : [];

  return { text: trimmed, categories };
}

export function parsePaginationQuery(query: unknown): PaginationQuery {
  const source = (query ?? {}) as Record<string, unknown>;
  const rawLimit = typeof source.limit === "string" ? Number.parseInt(source.limit, 10) : 50;
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(100, rawLimit))
    : 50;
  const before =
    typeof source.before === "string" && isIsoDate(source.before)
      ? source.before
      : null;

  return { limit, before };
}

export function parseInvitationRequest(value: unknown): InvitationRequest | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  const email =
    typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";

  if (!email || !email.includes("@") || !isRole(payload.role)) {
    return null;
  }

  return {
    email,
    role: payload.role,
  };
}

export function parseBudgetRequest(value: unknown): BudgetRequest | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;

  const period = typeof payload.period === "string" ? payload.period.trim() : "";
  const categoria =
    typeof payload.categoria === "string" ? payload.categoria.trim() : "";
  const moneda = payload.moneda;
  const monto = payload.monto;

  if (
    !isPeriod(period) ||
    !categoria ||
    (moneda !== "ARS" && moneda !== "USD") ||
    typeof monto !== "number" ||
    !Number.isFinite(monto)
  ) {
    return null;
  }

  return {
    period,
    categoria,
    moneda,
    monto,
  };
}

export function parseDashboardInvitationRequest(
  value: unknown,
): DashboardInvitationRequest | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  const email =
    typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";

  if (!email || !email.includes("@") || !isDashboardMembershipRole(payload.role)) {
    return null;
  }

  return {
    email,
    role: payload.role,
  };
}

export function parseReconciliationRequest(
  value: unknown,
): ReconciliationRequest | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;

  if (typeof payload.conciliado !== "boolean") {
    return null;
  }

  if (
    payload.notas !== undefined &&
    payload.notas !== null &&
    typeof payload.notas !== "string"
  ) {
    return null;
  }

  const notas =
    typeof payload.notas === "string" ? payload.notas.trim() : undefined;

  return {
    conciliado: payload.conciliado,
    notas,
  };
}

export function parseUpdateMovimientoRequest(
  value: unknown,
): UpdateMovimientoRequest | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;

  const next: UpdateMovimientoRequest = {};

  if (payload.monto !== undefined) {
    if (typeof payload.monto !== "number" || !Number.isFinite(payload.monto)) return null;
    next.monto = Math.abs(payload.monto);
  }

  if (payload.categoria !== undefined) {
    if (typeof payload.categoria !== "string" || payload.categoria.trim().length === 0) return null;
    next.categoria = payload.categoria.trim();
  }

  if (payload.empresa !== undefined) {
    if (
      payload.empresa !== null &&
      (typeof payload.empresa !== "string" || payload.empresa.trim().length === 0)
    ) {
      return null;
    }
    next.empresa = typeof payload.empresa === "string" ? payload.empresa.trim() : null;
  }

  if (payload.descripcion !== undefined) {
    if (typeof payload.descripcion !== "string" || payload.descripcion.trim().length === 0) return null;
    next.descripcion = payload.descripcion.trim();
  }

  if (payload.tipo !== undefined) {
    if (payload.tipo !== "ingreso" && payload.tipo !== "egreso") return null;
    next.tipo = payload.tipo;
  }

  if (payload.moneda !== undefined) {
    if (payload.moneda !== "ARS" && payload.moneda !== "USD") return null;
    next.moneda = payload.moneda;
  }

  return Object.keys(next).length > 0 ? next : null;
}

export function parseUpdateEmpresaRequest(value: unknown): UpdateEmpresaRequest | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  if (typeof payload.nombre !== "string" || payload.nombre.trim().length === 0) return null;
  return { nombre: payload.nombre.trim() };
}

export type PhotoSourceType = "photo" | "pdf" | "handwritten" | "multi";

export interface PendingExtractionData {
  monto: number | null;
  moneda: "ARS" | "USD";
  tipo: "ingreso" | "egreso";
  empresa: string | null;
  cuit: string | null;
  categoria: string;
  descripcion: string;
  fecha: string | null;
  confidence: number;
  sourceType: PhotoSourceType;
}

export function isPendingExtractionData(value: unknown): value is PendingExtractionData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return (
    (obj.monto === null || (typeof obj.monto === "number" && Number.isFinite(obj.monto) && obj.monto > 0)) &&
    (obj.moneda === "ARS" || obj.moneda === "USD") &&
    (obj.tipo === "ingreso" || obj.tipo === "egreso") &&
    (obj.empresa === null || typeof obj.empresa === "string") &&
    (obj.cuit === null || typeof obj.cuit === "string") &&
    typeof obj.categoria === "string" &&
    typeof obj.descripcion === "string" &&
    (obj.fecha === null || typeof obj.fecha === "string") &&
    typeof obj.confidence === "number" &&
    (obj.sourceType === "photo" || obj.sourceType === "pdf" || obj.sourceType === "handwritten" || obj.sourceType === "multi")
  );
}

export function parseReportExportRequest(value: unknown): ReportExportRequest | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;

  if (
    !isReportFormat(payload.format) ||
    !isReportPeriod(payload.period) ||
    typeof payload.company !== "string" ||
    !isReportMovementType(payload.tipo) ||
    !isReportCurrency(payload.moneda)
  ) {
    return null;
  }

  // WARNING-19: validate destination — default to 'local' if not provided
  const rawDestination = payload.destination;
  const destination: ReportDestination =
    isReportDestination(rawDestination) ? rawDestination : "local";

  const request: ReportExportRequest = {
    format: payload.format,
    period: payload.period,
    company: payload.company.trim() || "all",
    tipo: payload.tipo,
    moneda: payload.moneda,
    destination,
  };

  if (payload.anchorDate !== undefined) {
    if (typeof payload.anchorDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload.anchorDate)) {
      return null;
    }
    request.anchorDate = payload.anchorDate;
  }

  if (payload.month !== undefined) {
    if (typeof payload.month !== "string" || !/^\d{4}-\d{2}$/.test(payload.month)) {
      return null;
    }
    request.month = payload.month;
  }

  if (payload.from !== undefined) {
    if (typeof payload.from !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload.from)) return null;
    request.from = payload.from;
  }

  if (payload.to !== undefined) {
    if (typeof payload.to !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload.to)) return null;
    request.to = payload.to;
  }

  return request;
}
