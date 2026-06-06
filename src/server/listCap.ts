// Early-warning for un-paginated list queries that cap at LIST_CAP rows.
// These endpoints fetch up to LIST_CAP in one shot (no pagination). If a tenant
// ever reaches the cap, results are silently truncated. This logs a warning so
// we get a signal — and a reason to add real pagination — BEFORE it bites users.
//
// Not an error: the cap is intentional today (small tenants). Remove the call
// site once an endpoint gets proper cursor/offset pagination.

import { alertSuperadmin } from "./alertSuperadmin.ts";

export const LIST_CAP = 500;

export function warnIfListCapped(
  rows: { length: number } | null | undefined,
  label: string,
): void {
  if ((rows?.length ?? 0) >= LIST_CAP) {
    console.warn(
      `[list-cap] '${label}' hit the ${LIST_CAP}-row cap — results may be truncated. Add pagination.`,
    );
    alertSuperadmin({
      code: `list-cap:${label}`,
      title: `Lista truncada: ${label}`,
      problem: `La query '${label}' alcanzó el tope de ${LIST_CAP} filas. Como este endpoint no pagina, las filas por encima de ${LIST_CAP} no se devuelven.`,
      impact:
        "Datos faltantes para el usuario (y, en notificaciones de mantenimiento, destinatarios que no reciben el aviso).",
      context: { endpoint: label, cap: LIST_CAP },
      steps: [
        `Confirmar cuántas filas reales hay para ese scope (contar en la tabla correspondiente).`,
        `Implementar paginación server-side (cursor por created_at, como GET /api/movimientos) o subir el cap si es seguro para ese endpoint.`,
        `Actualizar el frontend que consume '${label}' para pedir páginas (useInfiniteQuery / "cargar más").`,
      ],
    });
  }
}
