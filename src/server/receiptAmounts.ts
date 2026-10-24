/**
 * True when a receipt extraction has something worth saving: at least one line
 * with an amount, or a positive total. Without it, saving would create a $0
 * movement nobody asked for.
 */
export function hasReadableAmount(result: { items: Array<{ monto: number | null }>; total: number | null }): boolean {
  if (result.items.some((it) => it.monto !== null)) return true;
  return typeof result.total === "number" && result.total > 0;
}
