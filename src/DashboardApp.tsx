import { lazy, Suspense, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from "sonner";
import { Send, AlertCircle, Loader2, ShieldCheck, LayoutGrid, Building2, ArrowUpDown, Settings, Repeat, TrendingDown, TrendingUp, Camera, Search } from 'lucide-react';
import { api, type Movimiento, type Empresa, type AppViewer, type PaginatedMovimientos, type MaintenanceStatus } from './services/api';
import { CommandPalette } from './components/CommandPalette';
import type { CommandResult, QuickAction } from './dashboard/commandSearch';
import { MaintenanceBanner } from './components/MaintenanceBanner';
import type { InfiniteData } from '@tanstack/react-query';
import { DASHBOARD_ROLE_LABELS, formatIdentity, type AppRole, type DashboardRole } from './services/labels';
import WelcomeWizard from './components/WelcomeWizard';
import WelcomeJoined from './components/WelcomeJoined';
import {
  formatCurrency, getCategorySummaries, getCompanySummaries, getCurrencyTotals,
  getRecentExpenses, getRecentIncomes,
  getIncomeSummaries, getIncomeTagSummaries, getMonthlySummaries,
} from './dashboard/summary';
import { projectBalance } from './dashboard/forecast';
import { generateInsights } from './dashboard/insights';
import { DashboardSkeleton, SectionLoadingState } from './components/dashboard/LoadingStates';
import { ThemeMode, ThemePreference, ThemeToggle } from './components/ThemeToggle';
import { SectionCard } from './components/dashboard/primitives';
import { ModalShell } from './components/ui/ModalShell';
import { MovementCards } from './components/dashboard/MovementCards';
import { HeaderUserMenu } from './components/dashboard/HeaderUserMenu';
import { DashboardModals } from './components/dashboard/DashboardModals';
import { useDashboardData } from './hooks/dashboard/useDashboardData';
import { useMovementsFilter } from './hooks/dashboard/useMovementsFilter';
import { buildMovimientosCsv, shareOrDownloadCsv } from './dashboard/exportCsv';
import { useCompanyAssignment } from './hooks/dashboard/useCompanyAssignment';
import { useComposer } from './hooks/dashboard/useComposer';
import { useImageExtract } from './hooks/dashboard/useImageExtract';
import { ImageReviewModal, type ReviewFields } from './components/dashboard/ImageReviewModal';
import { type MovementEditForm, type ConfirmationModalState } from './types/dashboard';

export type { MovementEditForm, ConfirmationModalState };

const PREF_EMPRESA_KEY = 'caja-chica:default-empresa';

function readDefaultEmpresa(): string {
  return window.localStorage.getItem(PREF_EMPRESA_KEY) ?? '';
}

export interface DashboardAppProps {
  viewer: AppViewer;
  onSignOut: () => Promise<void> | void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  themePreference: ThemePreference;
  onSetThemePreference: (p: ThemePreference) => void;
}

export type DashboardTab = 'resumen' | 'movimientos' | 'gastos' | 'ingresos' | 'recurrentes' | 'empresas' | 'superadmin' | 'configuracion';

const ResumenTab = lazy(() => import('./components/dashboard/tabs/ResumenTab'));
const EmpresasTab = lazy(() => import('./components/dashboard/tabs/EmpresasTab'));
const GastosTab = lazy(() => import('./components/dashboard/tabs/GastosTab'));
const IngresosTab = lazy(() => import('./components/dashboard/tabs/IngresosTab'));
const MovimientosTab = lazy(() => import('./components/dashboard/tabs/MovimientosTab'));
const AdminPanel = lazy(() => import('./components/AdminPanel').then((m) => ({ default: m.AdminPanel })));
const BotConnectionPanel = lazy(() => import('./components/BotConnectionPanel').then((m) => ({ default: m.BotConnectionPanel })));
const ConfiguracionTab = lazy(() => import('./components/dashboard/tabs/ConfiguracionTab'));
const RecurrentesTab = lazy(() => import('./components/dashboard/tabs/RecurrentesTab'));

const BASE_TAB_CONFIG: Array<{ id: DashboardTab; label: string; description: string; icon: typeof LayoutGrid }> = [
  { id: 'resumen', label: 'Resumen', description: 'Un vistazo de empresas, ingresos y gastos del período', icon: LayoutGrid },
  { id: 'movimientos', label: 'Movimientos', description: 'Historial completo de todos tus movimientos', icon: ArrowUpDown },
  { id: 'gastos', label: 'Gastos', description: 'Categorías, etiquetas y gastos por empresa', icon: TrendingDown },
  { id: 'ingresos', label: 'Ingresos', description: 'Categorías, etiquetas e ingresos por empresa', icon: TrendingUp },
  { id: 'recurrentes', label: 'Recurrentes', description: 'Gastos e ingresos automáticos', icon: Repeat },
  { id: 'empresas', label: 'Empresas', description: 'Saldos, informes y backups de datos', icon: Building2 },
  { id: 'configuracion', label: 'Configuración', description: 'Cuenta, equipo, permisos y Drive', icon: Settings },
];

const ACTIVE_TAB_STORAGE_KEY = 'caja-chica:activeTab';
const VALID_TABS: ReadonlyArray<DashboardTab> = [
  'resumen', 'movimientos', 'gastos', 'ingresos', 'recurrentes', 'empresas', 'superadmin', 'configuracion',
];

function readPersistedTab(): DashboardTab {
  try {
    const stored = window.sessionStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
    if (stored && (VALID_TABS as ReadonlyArray<string>).includes(stored)) return stored as DashboardTab;
  } catch { /* ignore */ }
  return 'resumen';
}

export default function DashboardApp({ viewer, onSignOut, theme, onToggleTheme, themePreference, onSetThemePreference }: DashboardAppProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<DashboardTab>(readPersistedTab);

  const { data: maintenanceStatus } = useQuery<MaintenanceStatus>({
    queryKey: ['maintenanceStatus'],
    queryFn: () => api.getMaintenanceStatus(),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const [showWizard, setShowWizard] = useState(viewer.onboarding_state === 'pending' || viewer.onboarding_state === 'seeded');

  useEffect(() => {
    try { window.sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab); } catch { /* ignore */ }
  }, [activeTab]);

  const handleSignOut = () => {
    try { window.sessionStorage.removeItem(ACTIVE_TAB_STORAGE_KEY); } catch { /* ignore */ }
    return onSignOut();
  };

  const {
    history, customCompanies, categories, recurrentes,
    dashboardAccess,
    isLoading, isLoadingCollaboration, hasMore, loadingMore,
    apiStatus, apiErrorMessage, loadData, loadCollaboration,
  } = useDashboardData(viewer);

  const {
    selectedCompany, setSelectedCompany, movementType, setMovementType,
    movementCurrency, setMovementCurrency, filteredMovimientos: filteredHistory, resetFilters,
    selectedCategory, setSelectedCategory, datePeriod, setDatePeriod,
    customFrom, setCustomFrom, customTo, setCustomTo, hasActiveFilters,
  } = useMovementsFilter(history);

  const { pendingItem, setPendingItem, isAssigning, assignPendingMovement } = useCompanyAssignment();

  const currentDashboardMember = dashboardAccess?.members.find((m) => m.user_id === viewer.id) ?? null;
  const dashboardRole = currentDashboardMember?.role ?? 'owner';
  const canWriteData = dashboardRole !== 'viewer';
  const canConnectDrive = dashboardRole === 'owner';
  const canUseDrive = canConnectDrive || (dashboardRole === 'editor' && currentDashboardMember?.permissions?.export_drive === true);

  const showToast = (message: string, type: 'success' | 'warning' = 'success') => {
    if (type === 'success') toast.success(message); else toast.error(message);
  };

  const prependMovements = (items: Movimiento[]) => {
    queryClient.setQueryData<InfiniteData<PaginatedMovimientos>>(['movimientos'], (old) => {
      if (!old) return old;
      const firstPage = old.pages[0];
      const deduped = items.filter((n) => !firstPage.items.some((i) => i.id === n.id));
      return { ...old, pages: [{ ...firstPage, items: [...deduped, ...firstPage.items] }, ...old.pages.slice(1)] };
    });
  };

  const removeMovement = (id: string) => {
    queryClient.setQueryData<InfiniteData<PaginatedMovimientos>>(['movimientos'], (old) => {
      if (!old) return old;
      return { ...old, pages: old.pages.map((p) => ({ ...p, items: p.items.filter((i) => i.id !== id) })) };
    });
  };

  const patchMovement = (id: string, patch: Partial<Movimiento>) => {
    queryClient.setQueryData<InfiniteData<PaginatedMovimientos>>(['movimientos'], (old) => {
      if (!old) return old;
      return { ...old, pages: old.pages.map((p) => ({ ...p, items: p.items.map((i) => i.id === id ? { ...i, ...patch } : i) })) };
    });
  };

  const patchMovementsByCompany = (prevName: string, nextName: string) => {
    queryClient.setQueryData<InfiniteData<PaginatedMovimientos>>(['movimientos'], (old) => {
      if (!old) return old;
      return { ...old, pages: old.pages.map((p) => ({ ...p, items: p.items.map((i) => i.empresa_nombre === prevName ? { ...i, empresa_nombre: nextName } : i) })) };
    });
  };

  const appendEmpresa = (e: Empresa) => {
    queryClient.setQueryData<Empresa[]>(['empresas'], (prev = []) =>
      prev.some((c) => c.id === e.id) ? prev : [...prev, e],
    );
  };

  const removeEmpresa = (id: string) => {
    queryClient.setQueryData<Empresa[]>(['empresas'], (prev = []) => prev.filter((c) => c.id !== id));
  };

  const patchEmpresa = (id: string, nombre: string) => {
    queryClient.setQueryData<Empresa[]>(['empresas'], (prev = []) =>
      prev.map((c) => c.id === id ? { ...c, nombre } : c),
    );
  };

  const { isExtracting, extractError, extracted, startExtract, clearExtracted } = useImageExtract();
  const [isSavingExtracted, setIsSavingExtracted] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageFile = useCallback((file: File) => {
    void startExtract(file);
  }, [startExtract]);

  const handleSaveExtracted = useCallback(async (fields: ReviewFields) => {
    setIsSavingExtracted(true);
    try {
      const saved = await api.saveMovimientos(
        [{ monto: fields.monto, tipo: fields.tipo, moneda: fields.moneda, categoria: fields.categoria, empresa: fields.empresa || null, descripcion: fields.descripcion }],
        'Ticket extraído desde imagen',
      );
      prependMovements(saved.map((m) => ({ ...m, conciliado: m.conciliado ?? true })));
      toast.success('Movimiento guardado desde imagen.');
      clearExtracted();
    } catch {
      toast.error('No se pudo guardar el movimiento.');
    } finally {
      setIsSavingExtracted(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearExtracted, queryClient]);

  const { inputText, setInputText, isProcessing, error, handleProcess } = useComposer({
    categories, customCompanies, canWriteData,
    onWarning: (msg) => showToast(msg, 'warning'),
    onCommit: (event) => {
      switch (event.type) {
        case 'GESTIONAR_EMPRESA':
          if (event.action === 'ADD') {
            const exists = customCompanies.some((c) => c.nombre.toLowerCase() === event.companyName.toLowerCase());
            if (!exists) void api.addEmpresa(event.companyName).then((e) => { appendEmpresa(e); showToast(`Empresa "${event.companyName}" creada.`); });
            else showToast(`La empresa "${event.companyName}" ya existe.`, 'warning');
          }
          break;
        case 'ELIMINAR_MOVIMIENTO':
          if (event.deletedId) { removeMovement(event.deletedId); showToast('Último movimiento eliminado.'); }
          break;
        case 'REGISTRAR':
          prependMovements(event.saved);
          showToast(`${event.saved.length} transacciones registradas.`);
          break;
        case 'PENDING_COMPANY':
          setPendingItem(event.item);
          break;
      }
    },
  });

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedExpenseCompany, setSelectedExpenseCompany] = useState<string>('all');
  const [editingMovement, setEditingMovement] = useState<Movimiento | null>(null);
  const [movementEditForm, setMovementEditForm] = useState<MovementEditForm | null>(null);
  const [editingCompany, setEditingCompany] = useState<Empresa | null>(null);
  const [companyEditName, setCompanyEditName] = useState('');
  const [confirmationModal, setConfirmationModal] = useState<ConfirmationModalState | null>(null);
  const [confirmationInput, setConfirmationInput] = useState('');
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);

  // ── Command palette state + keyboard trigger ────────────────────────────────
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const trigger = isMac ? e.metaKey && e.key === 'k' : e.ctrlKey && e.key === 'k';
      if (!trigger) return;
      // Do not fire inside the composer textarea
      if ((e.target as HTMLElement)?.id === 'message-input') return;
      e.preventDefault();
      setIsPaletteOpen((prev) => !prev);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
  // ───────────────────────────────────────────────────────────────────────────

  const tabs = viewer.role === 'superadmin'
    ? [...BASE_TAB_CONFIG, { id: 'superadmin' as DashboardTab, label: 'Super Admin', description: 'Cuentas, dashboards, invitaciones', icon: ShieldCheck }]
    : BASE_TAB_CONFIG;

  useEffect(() => {
    const allowedIds = tabs.map((t) => t.id);
    if (!allowedIds.includes(activeTab)) setActiveTab(tabs[0].id);
  }, [viewer.id, viewer.role, activeTab, tabs]);

  // ── Command palette actions + handler (depend on tabs/canWriteData) ──────────
  const paletteQuickActions = useMemo((): QuickAction[] => {
    const actions: QuickAction[] = tabs
      .filter((t) => t.id !== activeTab)
      .map((t) => ({
        id: `goto-${t.id}`,
        label: `Ir a ${t.label}`,
        description: t.description,
        group: 'Acciones',
      }));
    if (canWriteData) {
      actions.push({
        id: 'open-composer',
        label: 'Registrar movimiento',
        description: 'Ir al compositor de movimientos en lenguaje natural',
        group: 'Acciones',
      });
    }
    return actions;
  }, [tabs, activeTab, canWriteData]);

  const handlePaletteSelect = useCallback((item: CommandResult) => {
    if (item.type === 'action') {
      if (item.id.startsWith('goto-')) {
        const tabId = item.id.slice('goto-'.length) as DashboardTab;
        setActiveTab(tabId);
      } else if (item.id === 'open-composer') {
        setActiveTab('movimientos');
        requestAnimationFrame(() => {
          document.getElementById('message-input')?.focus();
        });
      }
      return;
    }
    if (item.type === 'movimiento') { setActiveTab('movimientos'); return; }
    if (item.type === 'empresa') { setActiveTab('empresas'); return; }
    if (item.type === 'categoria') { setActiveTab('movimientos'); return; }
  }, []);
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    resetFilters(); setSelectedExpenseCompany('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer.id]);

  const companiesList = ['all', ...Array.from(new Set([...customCompanies.map((c) => c.nombre), ...history.map((i) => i.empresa_nombre).filter(Boolean)])) as string[]];
  const expenseHistory = selectedExpenseCompany === 'all' ? history : history.filter((i) => i.empresa_nombre === selectedExpenseCompany);

  const arsTotals = getCurrencyTotals(history, 'ARS');
  const usdTotals = getCurrencyTotals(history, 'USD');
  const companySummaries = getCompanySummaries(history);
  const categorySummaries = getCategorySummaries(history);
  const filteredExpenseCategorySummaries = getCategorySummaries(history, selectedExpenseCompany === 'all' ? undefined : selectedExpenseCompany);
  const incomeSummaries = getIncomeSummaries(history);
  const incomeTagSummaries = getIncomeTagSummaries(history);
  const monthlySummaries = getMonthlySummaries(history);
  const expenseMonthlySummaries = getMonthlySummaries(expenseHistory);
  const activeTabMeta = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  const monthlyChartDataArs = [...monthlySummaries].reverse().map((i) => ({ label: i.period.slice(5), income: i.ingresosArs, expense: i.gastosArs, net: i.netoArs })).filter((i) => i.income > 0 || i.expense > 0);
  const monthlyChartDataUsd = [...monthlySummaries].reverse().map((i) => ({ label: i.period.slice(5), income: i.ingresosUsd, expense: i.gastosUsd, net: i.netoUsd })).filter((i) => i.income > 0 || i.expense > 0);
  const expenseMonthlyChartData = [...expenseMonthlySummaries].reverse().map((i) => ({ label: i.period.slice(5), income: i.ingresosArs, expense: i.gastosArs, net: i.netoArs }));
  const topExpenseCategories = categorySummaries.slice(0, 5).map((c) => ({ label: c.name, value: c.egresoArs, secondary: `${c.movimientos} movimientos` }));
  const topIncomeSources = incomeSummaries.slice(0, 5).map((inc) => ({ label: inc.name, value: inc.ars + inc.usd, valueLabel: `${formatCurrency(inc.ars, 'ARS')} · ${formatCurrency(inc.usd, 'USD')}`, secondary: `${inc.movimientos} movimientos`, segments: [{ value: inc.ars, colorClass: 'bg-green-500', label: 'Ingresos ARS', currency: 'ARS' as const }, { value: inc.usd, colorClass: 'bg-emerald-300', label: 'Ingresos USD', currency: 'USD' as const }] }));
  const topIncomeTags = incomeTagSummaries.slice(0, 10).map((t) => ({ label: t.label, value: formatCurrency(t.ars, 'ARS'), secondary: `${t.movimientos} movimientos · ${formatCurrency(t.usd, 'USD')} en USD` }));
  const topCompanies = companySummaries.slice(0, 5).map((c) => ({ label: c.name, value: c.ingresosArs + c.gastosArs, valueLabel: formatCurrency(c.ingresosArs, 'ARS'), secondary: `${c.movimientos} movimientos`, supportingValue: `Saldo ${formatCurrency(c.saldoArs, 'ARS')}`, segments: [{ value: c.ingresosArs, colorClass: 'bg-green-500', label: 'Ingresos ARS', currency: 'ARS' as const }, { value: c.gastosArs, colorClass: 'bg-red-500', label: 'Gastos ARS', currency: 'ARS' as const }] }));
  const expenseCompanies = getCompanySummaries(history).filter((c) => c.gastosArs > 0).slice(0, 8).map((c) => ({ label: c.name, value: c.gastosArs, secondary: `${c.movimientos} movimientos · saldo ${formatCurrency(c.saldoArs, 'ARS')}` }));
  const recentExpenses = getRecentExpenses(history, selectedExpenseCompany === 'all' ? undefined : selectedExpenseCompany, 5);
  const recentIncomes = getRecentIncomes(history, 5);
  const visibleIncomeCount = filteredHistory.filter((i) => i.tipo === 'ingreso').length;
  const visibleExpenseCount = filteredHistory.filter((i) => i.tipo === 'egreso').length;

  const forecastResult = projectBalance(
    { saldoArs: arsTotals.neto, saldoUsd: usdTotals.neto, recurrentes },
    new Date(),
  );
  const currentPeriod = monthlySummaries[0]?.period ?? '';
  const prevCategorySummaries = monthlySummaries.length >= 2
    ? getCategorySummaries(
        history.filter((m) => {
          const period = m.created_at.slice(0, 7);
          return period === monthlySummaries[1]!.period;
        }),
      )
    : [];
  const dashboardInsights = generateInsights({
    monthlySummaries,
    categorySummaries,
    prevCategorySummaries,
    currentPeriod,
  });

  const deleteItem = (id: string) => {
    if (!canWriteData) return;
    setConfirmationInput('');
    const mov = history.find((m) => m.id === id);
    const preview = mov ? {
      title: mov.descripcion || 'Sin descripción',
      meta: `${mov.empresa_nombre || 'Personal'} · ${mov.categoria || 'Sin categoría'} · ${new Date(mov.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}`,
      amount: mov.monto != null ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: mov.moneda || 'ARS', maximumFractionDigits: 0 }).format(mov.monto) : undefined,
      arrow: (mov.tipo === 'ingreso' ? 'up' : 'down') as 'up' | 'down',
    } : undefined;
    setConfirmationModal({ title: 'Eliminar movimiento', description: '¿Seguro? Se quita del historial visible. Queda en el log de auditoría y no se puede deshacer desde acá.', confirmLabel: 'Sí, eliminar', tone: 'danger', preview, onConfirm: async () => { await api.deleteMovimiento(id); removeMovement(id); showToast('Movimiento eliminado.', 'warning'); } });
  };
  const deleteCompany = (id: string, name: string) => {
    if (!canWriteData) return;
    setConfirmationInput('');
    const movCount = history.filter((m) => m.empresa_nombre === name).length;
    const description = movCount > 0
      ? `Tiene ${movCount} movimiento${movCount === 1 ? '' : 's'} asociado${movCount === 1 ? '' : 's'}. Los movimientos quedan en el historial; la empresa se desactiva con soft delete + backup + log.`
      : 'Sin movimientos asociados. Soft delete + log de auditoría.';
    const preview = { title: name, meta: `${movCount} movimiento${movCount === 1 ? '' : 's'} asociado${movCount === 1 ? '' : 's'}` };
    setConfirmationModal({ title: 'Desactivar empresa', description, details: 'Escribí ELIMINAR para confirmar.', confirmLabel: 'Desactivar', tone: 'danger', requireText: 'ELIMINAR', preview, onConfirm: async () => { await api.deleteEmpresa(id); removeEmpresa(id); if (selectedCompany === name) setSelectedCompany('all'); if (selectedExpenseCompany === name) setSelectedExpenseCompany('all'); showToast(`Empresa "${name}" desactivada.`, 'warning'); } });
  };
  const copyJson = (item: Movimiento) => {
    const { id, original_text, created_at, ...cleanData } = item;
    navigator.clipboard.writeText(JSON.stringify(cleanData, null, 2));
    setCopiedId(item.id); setTimeout(() => setCopiedId(null), 2000);
  };

  const openMovementEditor = (item: Movimiento) => {
    setEditingMovement(item);
    setMovementEditForm({ tipo: item.tipo as 'ingreso' | 'egreso', moneda: item.moneda as 'ARS' | 'USD', monto: String(item.monto ?? ''), categoria: item.categoria || '', empresa: item.empresa_nombre || 'Personal', descripcion: item.descripcion || '' });
  };
  const saveMovementEdit = async () => {
    if (!editingMovement || !movementEditForm) return;
    const monto = Number(movementEditForm.monto);
    if (!Number.isFinite(monto) || !movementEditForm.categoria.trim() || !movementEditForm.descripcion.trim()) { showToast('Completá monto, categoría y descripción.', 'warning'); return; }
    try {
      await api.updateMovimiento(editingMovement.id, { tipo: movementEditForm.tipo, moneda: movementEditForm.moneda, monto, categoria: movementEditForm.categoria.trim(), empresa: movementEditForm.empresa.trim() || 'Personal', descripcion: movementEditForm.descripcion.trim() });
      patchMovement(editingMovement.id, { tipo: movementEditForm.tipo, moneda: movementEditForm.moneda, monto, categoria: movementEditForm.categoria.trim(), empresa_nombre: movementEditForm.empresa.trim() || 'Personal', descripcion: movementEditForm.descripcion.trim() });
      setEditingMovement(null); setMovementEditForm(null); showToast('Movimiento actualizado.');
    } catch { showToast('No se pudo actualizar el movimiento.', 'warning'); }
  };
  const openCompanyEditor = (company: Empresa) => { setEditingCompany(company); setCompanyEditName(company.nombre); };
  const saveCompanyEdit = async () => {
    if (!editingCompany || !companyEditName.trim()) return;
    try {
      await api.updateEmpresa(editingCompany.id, companyEditName.trim());
      const prev = editingCompany.nombre; const next = companyEditName.trim();
      patchEmpresa(editingCompany.id, next);
      patchMovementsByCompany(prev, next);
      if (selectedCompany === prev) setSelectedCompany(next);
      setEditingCompany(null); setCompanyEditName(''); showToast('Empresa actualizada.');
    } catch { showToast('No se pudo actualizar la empresa.', 'warning'); }
  };
  const runConfirmation = async () => {
    if (!confirmationModal) return;
    if (confirmationModal.requireText && confirmationInput.trim().toUpperCase() !== confirmationModal.requireText.toUpperCase()) { showToast(`Escribí ${confirmationModal.requireText} para confirmar.`, 'warning'); return; }
    setIsConfirmingAction(true);
    try { await confirmationModal.onConfirm(); setConfirmationModal(null); setConfirmationInput(''); }
    catch { showToast('No se pudo completar la acción.', 'warning'); }
    finally { setIsConfirmingAction(false); }
  };

  if (isLoading) return <div className="min-h-screen bg-[var(--app-canvas)] text-neutral-900 font-sans p-4 md:p-8"><div className="mx-auto max-w-7xl"><DashboardSkeleton /></div></div>;

  return (
    <div className="min-h-screen bg-[var(--app-canvas)] text-neutral-900 font-sans p-4 md:p-8">
      {showWizard && viewer.is_dashboard_joiner && <WelcomeJoined viewer={viewer} onFinish={() => setShowWizard(false)} />}
      {showWizard && !viewer.is_dashboard_joiner && <WelcomeWizard onFinish={() => setShowWizard(false)} />}

      <div className="max-w-7xl mx-auto space-y-8">
        {apiStatus === 'missing_url' && <div role="status" className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center gap-3 text-amber-800 text-sm"><AlertCircle className="w-5 h-5 flex-shrink-0" /><p><strong>API no configurada:</strong> Los datos no se guardarán permanentemente. Configurá la variable <code>VITE_API_URL</code> con la URL del servidor.</p></div>}
        {apiStatus === 'load_error' && <div role="alert" className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-start gap-3 text-red-700 text-sm"><AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" /><p><strong>Error al cargar datos desde la API:</strong>{' '}{apiErrorMessage ?? 'No pudimos traer la información del dashboard.'}</p></div>}

        <MaintenanceBanner status={maintenanceStatus} />

        <header>
          <div className="flex items-center gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] px-4 py-3 shadow-[var(--app-shadow-panel)]">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--app-strong-surface)] text-[var(--app-strong-text)] text-xs font-bold">CC</span>
            <span className="hidden sm:inline text-sm font-bold tracking-tight text-[var(--app-text-1)]">Caja Chica</span>
            <span className="hidden sm:block h-5 w-px bg-[var(--app-border)]" aria-hidden="true" />
            <h1 id="app-title" className="min-w-0 truncate text-base font-bold tracking-tight text-[var(--app-text-1)]">{activeTabMeta.label}</h1>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setIsPaletteOpen(true)}
              aria-label="Búsqueda global (⌘K)"
              title="Búsqueda global"
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[var(--app-border)] bg-[var(--app-surface-1)] text-xs text-[var(--app-text-3)] hover:border-[var(--app-border-strong)] transition-colors duration-150"
            >
              <Search className="w-3 h-3" aria-hidden="true" />
              <span className="hidden md:inline">Buscar</span>
              <kbd className="font-mono">⌘K</kbd>
            </button>
            <button
              type="button"
              onClick={() => setIsPaletteOpen(true)}
              aria-label="Búsqueda global"
              className="sm:hidden inline-flex items-center justify-center h-9 w-9 rounded-md border border-[var(--app-border)] text-[var(--app-text-3)]"
            >
              <Search className="w-4 h-4" aria-hidden="true" />
            </button>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />
            <span className="hidden md:inline-flex items-center rounded-full border border-[var(--app-border)] bg-[var(--app-surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--app-text-2)]">
              {DASHBOARD_ROLE_LABELS[dashboardRole as DashboardRole] ?? dashboardRole}
            </span>
            <HeaderUserMenu
              email={viewer.email}
              identityLabel={formatIdentity(viewer.role as AppRole, dashboardRole as DashboardRole)}
              onSignOut={() => void handleSignOut()}
            />
          </div>
        </header>

        {canWriteData && activeTab === 'movimientos' && (
          <div className="space-y-4">
            <SectionCard title="Centro de carga" description="Usá lenguaje natural para registrar movimientos, o subí una foto de un ticket para extraerlo automáticamente.">
              <div
                className="relative group"
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (file) handleImageFile(file); }}
              >
                <label htmlFor="message-input" className="sr-only">Movimiento en lenguaje natural</label>
                <textarea id="message-input" aria-label="Movimiento en lenguaje natural" className="w-full min-h-[140px] p-6 pb-20 sm:pb-6 bg-[var(--app-surface-1)] text-[var(--app-text-1)] border border-[var(--app-border)] rounded-md shadow-sm focus:ring-2 focus:ring-[var(--app-text-1)] focus:border-transparent outline-none transition-[border-color,box-shadow] duration-150 resize-none text-lg" placeholder="Ej: 'Che, cobré 5 lucas por el laburito del taller' o arrastrá una foto de ticket acá" value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.ctrlKey && e.key === 'Enter' && void handleProcess()} />
                <div className="absolute bottom-3 right-3 left-3 sm:left-auto sm:bottom-4 sm:right-4 flex items-center justify-end gap-3">
                  <span className="text-xs text-neutral-500 hidden sm:block">Ctrl + Enter</span>
                  <button
                    type="button"
                    aria-label="Subir foto de ticket"
                    title="Subir foto de ticket"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={isExtracting}
                    className="inline-flex items-center justify-center h-10 w-10 rounded-md border border-neutral-200 text-neutral-600 hover:border-[var(--app-border-strong)] active:scale-[0.94] transition disabled:opacity-50"
                  >
                    {isExtracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                  </button>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    aria-label="Seleccionar imagen de ticket"
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageFile(file); e.target.value = ''; }}
                  />
                  <button id="process-button" onClick={() => void handleProcess()} disabled={!inputText.trim() || isProcessing} className="flex items-center gap-2 bg-[var(--app-strong-surface)] text-[var(--app-strong-text)] border border-[var(--app-strong-surface)] px-6 py-2.5 rounded-md font-medium hover:border-[var(--app-border-strong)] active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 shadow-[var(--app-shadow-md)] sm:w-auto w-full justify-center">
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {isProcessing ? 'Procesando...' : 'Enviar'}
                  </button>
                </div>
              </div>
              {error && <div role="alert" className="anim-fade-in-down flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 text-sm"><AlertCircle className="w-4 h-4" />{error}</div>}
              {extractError && <div role="alert" className="anim-fade-in-down flex items-center gap-2 p-4 bg-amber-50 text-amber-700 rounded-xl border border-amber-100 text-sm"><AlertCircle className="w-4 h-4" />{extractError}</div>}
            </SectionCard>
          </div>
        )}
        {!canWriteData && activeTab === 'movimientos' && (
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500">Solo podés ver. Para cargar movimientos, pedile al dueño del dashboard que te dé acceso de "Puede editar".</div>
        )}

        <section className="sticky top-3 z-20">
          <div className="md:hidden bg-[var(--app-surface-2)] border border-[var(--app-border)] rounded-xl p-2 overflow-x-auto">
            <div role="tablist" aria-label="Secciones del dashboard" className="flex gap-2 min-w-max">
              {tabs.map((tab) => { const Icon = tab.icon; const isActive = activeTab === tab.id; return <button key={tab.id} role="tab" aria-selected={isActive ? 'true' : 'false'} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold whitespace-nowrap transition duration-150 active:scale-[0.96] border ${isActive ? 'bg-[var(--app-strong-surface)] text-[var(--app-strong-text)] border-[var(--app-strong-surface)] shadow-[var(--app-shadow-md)]' : 'bg-[var(--app-surface-1)] text-[var(--app-text-2)] border-[var(--app-border)] shadow-[var(--app-shadow-sm)] hover:border-[var(--app-border-strong)]'}`}><Icon className="w-4 h-4 shrink-0" />{tab.label}</button>; })}
            </div>
          </div>
          <div className="hidden md:block bg-[var(--app-surface-2)] border border-[var(--app-border)] rounded-xl p-3">
            <div role="tablist" aria-label="Secciones del dashboard" className={`grid md:grid-cols-3 gap-3 ${tabs.length <= 6 ? 'xl:grid-cols-6' : 'xl:grid-cols-7'}`}>
              {tabs.map((tab) => { const Icon = tab.icon; const isActive = activeTab === tab.id; return <button key={tab.id} role="tab" aria-selected={isActive ? 'true' : 'false'} onClick={() => setActiveTab(tab.id)} className={`rounded-xl px-4 py-4 text-left transition duration-150 active:scale-[0.97] border ${isActive ? 'bg-[var(--app-strong-surface)] text-[var(--app-strong-text)] border-[var(--app-strong-surface)] shadow-[var(--app-shadow-md)]' : 'bg-[var(--app-surface-1)] text-[var(--app-text-2)] border-[var(--app-border)] shadow-[var(--app-shadow-sm)] hover:border-[var(--app-border-strong)]'}`}><div className="flex items-center gap-2 mb-2"><Icon className="w-4 h-4" /><span className="font-semibold">{tab.label}</span></div><p className={`text-xs leading-relaxed ${isActive ? 'text-[var(--app-strong-text)]/70' : 'text-[var(--app-text-3)]'}`}>{tab.description}</p></button>; })}
            </div>
          </div>
        </section>

        <main>
          <div key={activeTab} className="anim-fade-in">
              <Suspense fallback={<SectionLoadingState message={`Cargando ${activeTabMeta.label.toLowerCase()}...`} />}>
                {activeTab === 'resumen' && <ResumenTab arsIngreso={formatCurrency(arsTotals.ingreso, 'ARS')} arsEgreso={formatCurrency(arsTotals.egreso, 'ARS')} arsNeto={formatCurrency(arsTotals.neto, 'ARS')} usdNeto={formatCurrency(usdTotals.neto, 'USD')} companyCount={companySummaries.length} monthlyChartDataArs={monthlyChartDataArs} monthlyChartDataUsd={monthlyChartDataUsd} topExpenseCategories={topExpenseCategories} topCompanies={topCompanies} topExpenseLabel={topExpenseCategories[0]?.label ?? 'Sin datos'} topExpenseValue={topExpenseCategories[0] ? formatCurrency(topExpenseCategories[0].value, 'ARS') : 'Todavía no hay egresos.'} netPositive={arsTotals.neto >= 0} canWriteData={canWriteData} forecast={forecastResult} projectedArsFormatted={formatCurrency(forecastResult.projectedArs, 'ARS')} projectedUsdFormatted={formatCurrency(forecastResult.projectedUsd, 'USD')} insights={dashboardInsights} />}
                {activeTab === 'movimientos' && <MovimientosTab incomeCount={visibleIncomeCount} expenseCount={visibleExpenseCount} historyCount={filteredHistory.length} companiesList={companiesList} categories={categories} selectedCompany={selectedCompany} setSelectedCompany={setSelectedCompany} movementType={movementType} setMovementType={setMovementType} movementCurrency={movementCurrency} setMovementCurrency={setMovementCurrency} selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory} datePeriod={datePeriod} setDatePeriod={setDatePeriod} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} hasActiveFilters={hasActiveFilters} resetFilters={resetFilters} onExport={() => void shareOrDownloadCsv('movimientos.csv', buildMovimientosCsv(filteredHistory))} historyCards={<MovementCards filteredHistory={filteredHistory} selectedCompany={selectedCompany} canWriteData={canWriteData} hasMore={hasMore} loadingMore={loadingMore} copiedId={copiedId} onEdit={openMovementEditor} onCopy={copyJson} onDelete={deleteItem} onLoadMore={() => void loadData(true)} />} />}
                {activeTab === 'gastos' && <GastosTab arsEgreso={formatCurrency(arsTotals.egreso, 'ARS')} usdEgreso={formatCurrency(usdTotals.egreso, 'USD')} categoryCount={filteredExpenseCategorySummaries.length} canWriteData={canWriteData} categorySummaries={filteredExpenseCategorySummaries} monthlyChartData={expenseMonthlyChartData} expenseCompanyOptions={companiesList} selectedExpenseCompany={selectedExpenseCompany} setSelectedExpenseCompany={setSelectedExpenseCompany} expenseCompanies={expenseCompanies} recentExpenses={recentExpenses} formatCurrency={formatCurrency} />}
                {activeTab === 'ingresos' && <IngresosTab arsIngreso={formatCurrency(arsTotals.ingreso, 'ARS')} usdIngreso={formatCurrency(usdTotals.ingreso, 'USD')} sourceCount={incomeSummaries.length} topIncomeSources={topIncomeSources} incomeTags={topIncomeTags} recentIncomes={recentIncomes} formatCurrency={formatCurrency} />}
                {activeTab === 'recurrentes' && <Suspense fallback={<SectionLoadingState message="Cargando recurrentes..." />}><RecurrentesTab viewer={viewer} canWriteData={canWriteData} /></Suspense>}
                {activeTab === 'empresas' && <EmpresasTab companySummaries={companySummaries} topCompanies={topCompanies} customCompanies={customCompanies} canWriteData={canWriteData} onEditCompany={openCompanyEditor} onDeleteCompany={(c) => deleteCompany(c.id, c.nombre)} onCreateCompany={async (nombre) => { const t = nombre.trim(); if (!t) return; if (customCompanies.some((c) => c.nombre.toLowerCase() === t.toLowerCase())) { showToast(`La empresa "${t}" ya existe.`, 'warning'); return; } const e = await api.addEmpresa(t); appendEmpresa(e); showToast(`Empresa "${t}" creada.`); }} formatCurrency={formatCurrency} history={history} companiesList={companiesList} onDrilldown={(company, category) => { setSelectedCompany(company); setSelectedCategory(category); setMovementType('all'); setMovementCurrency('all'); setDatePeriod('all'); setActiveTab('movimientos'); }} canUseDrive={canUseDrive} canConnectDrive={canConnectDrive} />}
                {activeTab === 'superadmin' && <Suspense fallback={<SectionLoadingState message="Cargando paneles avanzados..." />}><div className="space-y-6"><BotConnectionPanel /><AdminPanel viewer={viewer} /></div></Suspense>}
                {activeTab === 'configuracion' && <Suspense fallback={<SectionLoadingState message="Cargando configuración..." />}><ConfiguracionTab viewer={viewer} data={dashboardAccess} loading={isLoadingCollaboration} onRefresh={loadCollaboration} canConnectDrive={canConnectDrive} onSignOut={handleSignOut} companies={customCompanies} themePreference={themePreference} onSetThemePreference={onSetThemePreference} onDisconnectDrive={canConnectDrive ? async () => { try { await api.disconnectDrive(); showToast('Drive desconectado.'); } catch { showToast('No se pudo desconectar Drive.', 'warning'); } } : undefined} /></Suspense>}
              </Suspense>
            </div>
        </main>

        {extracted && (
          <ImageReviewModal
            extracted={extracted}
            isSaving={isSavingExtracted}
            onSave={(fields) => void handleSaveExtracted(fields)}
            onCancel={clearExtracted}
          />
        )}

        <CommandPalette
          open={isPaletteOpen}
          onClose={() => setIsPaletteOpen(false)}
          searchInput={{ movimientos: history, empresas: customCompanies, categorias: categories, quickActions: paletteQuickActions }}
          onSelect={handlePaletteSelect}
        />

        <DashboardModals
          editingMovement={editingMovement} movementEditForm={movementEditForm} setMovementEditForm={setMovementEditForm}
          onCloseMovementEdit={() => { setEditingMovement(null); setMovementEditForm(null); }} onSaveMovementEdit={() => void saveMovementEdit()}
          editingCompany={editingCompany} companyEditName={companyEditName} setCompanyEditName={setCompanyEditName}
          onCloseCompanyEdit={() => { setEditingCompany(null); setCompanyEditName(''); }} onSaveCompanyEdit={() => void saveCompanyEdit()}
          pendingItem={pendingItem} isAssigning={isAssigning} companiesList={companiesList} readDefaultEmpresa={readDefaultEmpresa}
          onAssignCompany={(empresa) => void assignPendingMovement(empresa, (saved) => { prependMovements(saved); showToast(empresa === 'Personal' ? 'Asignado a Personal' : `Asignado a ${empresa}`); }, () => showToast('No se pudo guardar el movimiento.', 'warning'))}
          onCancelPending={() => setPendingItem(null)}
          confirmationModal={confirmationModal} confirmationInput={confirmationInput} setConfirmationInput={setConfirmationInput}
          isConfirmingAction={isConfirmingAction}
          onCloseConfirmation={() => { if (!isConfirmingAction) { setConfirmationModal(null); setConfirmationInput(''); } }}
          onRunConfirmation={() => void runConfirmation()}
        />

        <footer className="pt-12 pb-8 border-t border-neutral-200 text-center">
          <p className="text-xs text-neutral-500">Desarrollado para el mercado Argentino. Las conversiones de jerga son aproximadas y se basan en el uso común.</p>
        </footer>
      </div>
    </div>
  );
}
