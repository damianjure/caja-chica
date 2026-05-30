import { InlineKeyboard } from "grammy";

export function buildTemporalidadKeyboard() {
  return new InlineKeyboard()
    .text("📅 Por día", "rt:dia").text("📅 Último día", "rt:hoy").row()
    .text("📅 Última semana", "rt:sem").text("📅 Último mes", "rt:mes").row()
    .text("📅 Último año", "rt:anio").text("📅 Rango", "rt:rango");
}

export function buildTipoKeyboard() {
  return new InlineKeyboard()
    .text("📈 Ingresos", "rk:ing").text("📉 Gastos", "rk:egr").text("⚖️ Saldos", "rk:sal").row()
    .text("← Atrás", "rb:alcance");
}

export function buildMainKeyboard(dashboardUrl: string) {
  return new InlineKeyboard()
    .text("📊 Informes", "rp_start").row()
    .text("🏢 Empresas", "empresas").text("📁 Categorías", "categorias").row()
    .text("💰 Saldos", "saldos").text("🔍 Buscar", "buscar_mode").row()
    .text("💰 Hoy", "qs:hoy").text("📅 Semana", "qs:sem").row()
    .text("✏️ Gestionar", "mng:open").row()
    .url("🌐 Abrir Dashboard", dashboardUrl);
}

// Descarga del informe DESPUÉS de mostrarlo en el chat. callback rg:<dest>:<format>.
// Compartir no va acá: el bot no puede abrir el sheet del OS — el usuario comparte
// el documento desde la propia UI de Telegram al tocarlo.
export function buildDownloadKeyboard(driveAvailable: boolean) {
  const kb = new InlineKeyboard()
    .text("⬇️ CSV", "rg:local:csv").text("⬇️ PDF", "rg:local:pdf").row();
  if (driveAvailable) {
    kb.text("☁️ Drive CSV", "rg:drive:csv").text("☁️ Drive PDF", "rg:drive:pdf").row();
  }
  kb.text("← Atrás", "rb:tipo");
  return kb;
}

// Submenú de acciones destructivas/edición — sale del teclado principal para
// no sobrecargarlo. Reusa los callbacks existentes (edit_last/del_last/del_emp).
export function buildGestionarKeyboard() {
  return new InlineKeyboard()
    .text("✏️ Editar último", "edit_last").text("🗑️ Borrar último", "del_last").row()
    .text("🗑️ Borrar empresa", "del_emp").row()
    .text("← Volver", "menu");
}
