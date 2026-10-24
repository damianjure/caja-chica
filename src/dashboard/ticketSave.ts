/**
 * Why an image ticket cannot be saved yet, or null when it can. Shown next to
 * the disabled "Guardar" button so it never looks broken.
 */
export function ticketSaveBlockReason(
  lines: Array<{ monto: string; included: boolean }>,
  { anyAmountRead }: { anyAmountRead: boolean },
): string | null {
  const included = lines.filter((l) => l.included);
  if (included.some((l) => Number(l.monto) > 0)) return null;
  if (!anyAmountRead) {
    return 'No pudimos leer montos en la imagen. Escribí el monto a mano o probá con una foto más nítida.';
  }
  if (included.length === 0) return 'Elegí al menos un renglón para guardar.';
  return 'Completá el monto de los renglones que querés guardar.';
}
