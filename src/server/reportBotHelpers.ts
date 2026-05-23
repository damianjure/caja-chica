/**
 * Helpers for the bot report flow.
 * Extracted into a separate module so they can be unit-tested independently.
 */

export interface CompanyChoice {
  id: string;
  nombre: string;
}

/** Returns the callback_data for toggling a company by index. Always ≤ 64 bytes. */
export function buildToggleCallbackData(idx: number): string {
  return `rs:tog:${idx}`;
}

/**
 * Resolves the selected Set<number> of indices to an array of company names.
 * Empty set → [] (meaning "all companies").
 * Out-of-bounds indices are silently skipped.
 */
export function resolveSelectedCompanies(
  selected: Set<number>,
  choices: CompanyChoice[],
): string[] {
  if (selected.size === 0) return [];
  const names: string[] = [];
  for (const idx of selected) {
    if (idx >= 0 && idx < choices.length) {
      names.push(choices[idx].nombre);
    }
  }
  return names;
}

/**
 * Builds the inline keyboard for the alcance multi-select step.
 * Returns a plain object (not a grammY InlineKeyboard instance) so the helper
 * can be tested without grammY available in the test environment.
 */
export function buildAlcanceKeyboard(
  choices: CompanyChoice[],
  selected: Set<number>,
): { inline_keyboard: { text: string; callback_data: string }[][] } {
  const rows: { text: string; callback_data: string }[][] = [];

  for (let idx = 0; idx < choices.length; idx++) {
    const checkmark = selected.has(idx) ? "☑" : "☐";
    rows.push([
      { text: `${checkmark} ${choices[idx].nombre}`, callback_data: buildToggleCallbackData(idx) },
    ]);
  }

  // Listo button
  rows.push([{ text: "✅ Listo", callback_data: "rs:done" }]);

  return { inline_keyboard: rows };
}
