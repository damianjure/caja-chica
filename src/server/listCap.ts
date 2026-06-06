// Early-warning for un-paginated list queries that cap at LIST_CAP rows.
// These endpoints fetch up to LIST_CAP in one shot (no pagination). If a tenant
// ever reaches the cap, results are silently truncated. This logs a warning so
// we get a signal — and a reason to add real pagination — BEFORE it bites users.
//
// Not an error: the cap is intentional today (small tenants). Remove the call
// site once an endpoint gets proper cursor/offset pagination.

export const LIST_CAP = 500;

export function warnIfListCapped(
  rows: { length: number } | null | undefined,
  label: string,
): void {
  if ((rows?.length ?? 0) >= LIST_CAP) {
    console.warn(
      `[list-cap] '${label}' hit the ${LIST_CAP}-row cap — results may be truncated. Add pagination.`,
    );
  }
}
