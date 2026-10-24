/**
 * Message shown inside a confirmation dialog when its action fails, so a
 * rejected delete (403, 404, 409…) is never silent.
 */
export function confirmErrorMessage(err: unknown): string {
  const status = typeof err === 'object' && err !== null ? (err as { status?: unknown }).status : undefined;
  if (status === 403) return 'No tenés permiso para hacer esto.';
  if (status === 404) return 'Ya no existe: puede que otra persona lo haya borrado. Actualizá la vista.';
  if (status === 409) return 'No se puede hacer en este momento: hay un conflicto con otros datos.';
  return 'No se pudo completar la acción. Probá de nuevo.';
}
