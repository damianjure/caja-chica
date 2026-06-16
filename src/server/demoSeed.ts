import type { AppSession } from "./app.ts";

/** Minimal Supabase interface — only what demoSeed needs. Compatible with SupabaseLike in tests. */
interface SeedSupabase {
  from(table: string): any;
}

const DEMO_EMPRESA = "Empresa Demo SA";

interface SeedMovimiento {
  tipo: "ingreso" | "egreso";
  monto: number;
  categoria: string;
  descripcion: string;
  daysAgo: number;
}

const DEMO_MOVIMIENTOS: SeedMovimiento[] = [
  { tipo: "ingreso", monto: 200000, categoria: "Ventas", descripcion: "Factura #001 - venta productos", daysAgo: 2 },
  { tipo: "ingreso", monto: 120000, categoria: "Servicios", descripcion: "Honorarios consultoría", daysAgo: 7 },
  { tipo: "egreso",  monto: 180000, categoria: "Sueldos", descripcion: "Sueldos personal", daysAgo: 5 },
  { tipo: "ingreso", monto: 85000,  categoria: "Ventas", descripcion: "Factura #002 - venta servicios", daysAgo: 10 },
  { tipo: "egreso",  monto: 95000,  categoria: "Alquileres", descripcion: "Alquiler oficina mes corriente", daysAgo: 8 },
  { tipo: "ingreso", monto: 160000, categoria: "Ventas", descripcion: "Factura #003 - pedido especial", daysAgo: 14 },
  { tipo: "egreso",  monto: 28000,  categoria: "Marketing", descripcion: "Campaña redes sociales", daysAgo: 12 },
  { tipo: "egreso",  monto: 45000,  categoria: "Insumos", descripcion: "Compra materiales oficina", daysAgo: 18 },
  { tipo: "ingreso", monto: 45000,  categoria: "Alquileres", descripcion: "Cobro alquiler local comercial", daysAgo: 20 },
  { tipo: "egreso",  monto: 12500,  categoria: "Servicios", descripcion: "Internet + telefonía", daysAgo: 25 },
];

function daysAgoDate(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/** Bootstrap personal dashboard + owner membership for a brand-new user.
 *  Returns the dashboardId (new or pre-existing). */
export async function ensurePersonalDashboard(
  supabase: SeedSupabase,
  session: AppSession,
): Promise<string> {
  // Check if dashboard already exists
  const { data: existing } = await supabase
    .from("dashboard_members")
    .select("dashboard_id")
    .eq("user_id", session.userId)
    .eq("status", "active")
    .limit(1)
    .single();

  if (existing?.dashboard_id) return existing.dashboard_id;

  const dashboardName =
    session.email.split("@")[0].replace(/[^a-z0-9]/gi, " ").trim().slice(0, 60) || "Mi Dashboard";

  const { data: dashboard, error: dashErr } = await supabase
    .from("dashboards")
    .insert({ name: dashboardName, personal_for_user_id: session.userId, created_by_user_id: session.userId })
    .select("id")
    .single();

  if (dashErr) throw dashErr;

  const { error: memberErr } = await supabase
    .from("dashboard_members")
    .insert({
      dashboard_id: dashboard.id,
      user_id: session.userId,
      role: "owner",
      status: "active",
    });

  if (memberErr) throw memberErr;

  return dashboard.id;
}

/** Seed demo empresa + movimientos for a new owner. */
export async function seedDemoData(
  supabase: SeedSupabase,
  session: AppSession,
  dashboardId: string,
): Promise<void> {
  const { data: empresa, error: empErr } = await supabase
    .from("empresas")
    .insert({
      owner_user_id: session.userId,
      dashboard_id: dashboardId,
      nombre: DEMO_EMPRESA,
      is_demo: true,
    })
    .select("id")
    .single();

  if (empErr) throw empErr;

  const movRows = DEMO_MOVIMIENTOS.map((m) => ({
    owner_user_id: session.userId,
    dashboard_id: dashboardId,
    tipo: m.tipo,
    moneda: "ARS",
    monto: m.monto,
    categoria: m.categoria,
    empresa_nombre: DEMO_EMPRESA,
    descripcion: m.descripcion,
    source: "demo",
    conciliado: false,
    is_demo: true,
    created_at: daysAgoDate(m.daysAgo),
  }));

  const { error: movErr } = await supabase.from("movimientos").insert(movRows);
  if (movErr) throw movErr;

  const { error: stateErr } = await supabase
    .from("app_users")
    .update({ onboarding_state: "seeded" })
    .eq("user_id", session.userId);
  if (stateErr) console.error("[demoSeed] Failed to set onboarding_state=seeded:", stateErr);

  void empresa;
}

/** Bulk-delete all is_demo rows owned by this user/dashboard.
 *  Errors are logged but not thrown — partial cleanup is acceptable for demo data. */
export async function purgeDemoData(
  supabase: SeedSupabase,
  session: AppSession,
  dashboardId: string,
): Promise<void> {
  const { error: movErr } = await supabase
    .from("movimientos")
    .delete()
    .eq("dashboard_id", dashboardId)
    .eq("is_demo", true);
  if (movErr) console.error("[purgeDemoData] failed to delete demo movimientos", { dashboardId, err: movErr });

  const { error: empErr } = await supabase
    .from("empresas")
    .delete()
    .eq("dashboard_id", dashboardId)
    .eq("is_demo", true);
  if (empErr) console.error("[purgeDemoData] failed to delete demo empresas", { dashboardId, err: empErr });

  const { error: stateErr } = await supabase
    .from("app_users")
    .update({ onboarding_state: "cleaned" })
    .eq("user_id", session.userId);
  if (stateErr) console.error("[purgeDemoData] failed to update onboarding_state", { userId: session.userId, err: stateErr });
}
