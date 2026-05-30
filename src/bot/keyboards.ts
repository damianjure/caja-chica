import { InlineKeyboard } from "grammy";

export function buildTemporalidadKeyboard() {
  return new InlineKeyboard()
    .text("📅 Por día", "rt:dia").text("📅 Último día", "rt:hoy").row()
    .text("📅 Última semana", "rt:sem").text("📅 Último mes", "rt:mes").row()
    .text("📅 Último año", "rt:anio").text("📅 Rango", "rt:rango");
}

export function buildFormatKeyboard() {
  return new InlineKeyboard()
    .text("📊 CSV", "rf:csv").text("📄 PDF", "rf:pdf").row()
    .text("← Atrás", "rb:tipo");
}

export function buildDestinationKeyboard() {
  return new InlineKeyboard()
    .text("⬇️ Descargar acá", "rd:local").text("☁️ Guardar en Drive", "rd:drive").row()
    .text("← Atrás", "rb:format");
}

export function buildTipoKeyboard() {
  return new InlineKeyboard()
    .text("📈 Ingresos", "rk:ing").text("📉 Gastos", "rk:egr").text("⚖️ Saldos", "rk:sal").row()
    .text("← Atrás", "rb:alcance");
}

export function buildMainKeyboard(dashboardUrl: string) {
  return new InlineKeyboard()
    .text("📊 Informe", "rp_start").text("📤 Exportar", "rp_start").row()
    .text("🏢 Empresas", "empresas").text("📁 Categorías", "categorias").row()
    .text("💰 Saldos", "saldos").text("🔍 Buscar", "buscar_mode").row()
    .text("💰 Hoy", "qs:hoy").text("📅 Semana", "qs:sem").row()
    .text("🗑️ Borrar último", "del_last").text("✏️ Editar último", "edit_last").row()
    .text("🗑️ Borrar empresa", "del_emp").row()
    .url("🌐 Abrir Dashboard", dashboardUrl);
}
