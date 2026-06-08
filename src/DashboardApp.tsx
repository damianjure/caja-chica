import { lazy, Suspense, useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from "sonner";
import { AlertCircle, ShieldCheck, LayoutGrid, Building2, ArrowUpDown, Settings, Repeat, Search, MessageCircle, X as XIcon, Loader2 } from 'lucide-react';
import { api, type Movimiento, type Empresa, type AppViewer, type PaginatedMovimientos, type MaintenanceStatus, type DriveStatus } from './services/api';
import { CommandPalette } from './components/CommandPalette';
import { CargaModal } from './components/CargaModal';
import { ScrollToTop } from './components/ScrollToTop';
import { HelpModal } from './components/HelpModal';
import { TourModal } from './components/TourModal';
import { usePwaInstall, PwaInstallBanner } from './components/PwaInstall';
import type { CommandResult, QuickAction } from './dashboard/commandSearch';
import { MaintenanceBanner } from './components/MaintenanceBanner';
import type { InfiniteData } from '@tanstack/react-query';
import { formatIdentity, type AppRole, type DashboardRole } from './services/labels';
import WelcomeWizard from './components/WelcomeWizard';
import WelcomeJoined from './components/WelcomeJoined';
import {
  formatCurrency, getCategorySummaries, getCompanySummaries, getCurrencyTotals,
  getIncomeTagSummaries, getMonthlySummaries,
} from './dashboard/summary';
import { projectBalance } from './dashboard/forecast';
import { generateInsights } from './dashboard/insights';
import { DashboardSkeleton, SectionLoadingState } from './components/dashboard/LoadingStates';
import { ThemeMode, ThemePreference } from './components/ThemeToggle';
import { SectionCard } from './components/dashboard/primitives';
import { ModalShell } from './components/ui/ModalShell';
import { MovementCards } from './components/dashboard/MovementCards';
import { HeaderUserMenu } from './components/dashboard/HeaderUserMenu';
import { BrandMark } from './components/BrandMark';
import { DashboardModals } from './components/dashboard/DashboardModals';
import { useDashboardData } from './hooks/dashboard/useDashboardData';
import { useMovementsFilter } from './hooks/dashboard/useMovementsFilter';
import { buildMovimientosCsv, shareOrDownloadCsv } from './dashboard/exportCsv';
import { buildExportRequest } from './dashboard/reportRequest';
import { useCompanyAssignment } from './hooks/dashboard/useCompanyAssignment';
import { useCategoryAssignment } from './hooks/dashboard/useCategoryAssignment';
import { useComposer } from './hooks/dashboard/useComposer';
import { useImageExtract } from './hooks/dashboard/useImageExtract';
import { ImageTicketModal } from './components/dashboard/ImageTicketModal';
import type { SaveTicketPayload } from './services/api';
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
  lightPalette: string;
  darkPalette: string;
  onSetLightPalette: (id: string) => void;
  onSetDarkPalette: (id: string) => void;
}

function triggerDownload(fileName: string, mimeType: string, contentBase64: string) {
  const binary = atob(contentBase64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export type DashboardTab = 'resumen' | 'movimientos' | 'recurrentes' | 'empresas' | 'superadmin' | 'configuracion';

const ResumenTab = lazy(() => import('./components/dashboard/tabs/ResumenTab'));
const EmpresasTab = lazy(() => import('./components/dashboard/tabs/EmpresasTab'));
const MovimientosTab = lazy(() => import('./components/dashboard/tabs/MovimientosTab'));
const AdminPanel = lazy(() => import('./components/AdminPanel').then((m) => ({ default: m.AdminPanel })));
const ConfiguracionTab = lazy(() => import('./components/dashboard/tabs/ConfiguracionTab'));
const RecurrentesTab = lazy(() => import('./components/dashboard/tabs/RecurrentesTab'));

const BASE_TAB_CONFIG: Array<{ id: DashboardTab; label: string; description: string; icon: typeof LayoutGrid }> = [
  { id: 'resumen', label: 'Resumen', description: 'Un vistazo general de todo', icon: LayoutGrid },
  { id: 'movimientos', label: 'Movimientos', description: 'Historial completo', icon: ArrowUpDown },
  { id: 'recurrentes', label: 'Recurrentes', description: 'Gastos e ingresos automáticos', icon: Repeat },
  { id: 'empresas', label: 'Empresas', description: 'Saldos e informes', icon: Building2 },
  { id: 'configuracion', label: 'Configuración', description: '', icon: Settings },
];

const ACTIVE_TAB_STORAGE_KEY = 'caja-chica:activeTab';
const VALID_TABS: ReadonlyArray<DashboardTab> = [
  'resumen', 'movimientos', 'recurrentes', 'empresas', 'superadmin', 'configuracion',
];

function readPersistedTab(): DashboardTab {
  try {
    const stored = window.sessionStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
    if (stored && (VALID_TABS as ReadonlyArray<string>).includes(stored)) return stored as DashboardTab;
  } catch { /* ignore */ }
  return 'resumen';
}

export default function DashboardApp({ viewer, onSignOut, theme, onToggleTheme, themePreference, onSetThemePreference, lightPalette, darkPalette, onSetLightPalette, onSetDarkPalette }: DashboardAppProps) {
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

  const handleDemoDeleted = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['viewer'] });
  }, [queryClient]);

  // Telegram banner state (session-only dismiss)
  const [telegramBannerDismissed, setTelegramBannerDismissed] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState<boolean | null>(null);
  const [telegramLinkingBanner, setTelegramLinkingBanner] = useState(false);

  useEffect(() => {
    if (showWizard) return; // wizard handles it; don't double-fetch
    let active = true;
    api.getBotConnection()
      .then((r) => { if (active) setTelegramLinked(r.connected); })
      .catch(() => { if (active) setTelegramLinked(false); });
    return () => { active = false; };
  }, [showWizard]);

  const handleTelegramBannerActivate = useCallback(async () => {
    setTelegramLinkingBanner(true);
    try {
      const res = await api.selfLinkTelegram();
      if (res.telegramDeepLink) {
        window.open(res.telegramDeepLink, '_blank', 'noopener');
        toast.success('Abrí Telegram y tocá Start.');
      } else {
        toast.success(`Enviá /start ${res.manualStartCode} al bot en Telegram.`);
      }
      setTelegramBannerDismissed(true);
    } catch {
      toast.error('No se pudo generar el link de activación.');
    } finally {
      setTelegramLinkingBanner(false);
    }
  }, []);

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
    searchText, setSearchText,
  } = useMovementsFilter(history);

  const { pendingItem, setPendingItem, isAssigning, assignPendingMovement } = useCompanyAssignment();
  const { pendingCategory, setPendingCategory, isAssigningCategory, assignPendingCategory } = useCategoryAssignment();

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

  const [isCargaOpen, setIsCargaOpen] = useState(false);
  const [movementsPage, setMovementsPage] = useState(1);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isTourOpen, setIsTourOpen] = useState(false);
  const pwa = usePwaInstall();

  useEffect(() => {
    if (!localStorage.getItem('tour_seen')) {
      const t = setTimeout(() => setIsTourOpen(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  const closeTour = useCallback(() => {
    localStorage.setItem('tour_seen', '1');
    setIsTourOpen(false);
  }, []);

  const handleImageFile = useCallback((file: File) => {
    // Keep CargaModal open so the user sees the "Leyendo el ticket…" state
    // while extraction runs; an effect closes it once the result arrives.
    void startExtract(file);
  }, [startExtract]);

  useEffect(() => {
    if (extracted) setIsCargaOpen(false);
  }, [extracted]);

  const handleSaveTicket = useCallback(async (payload: SaveTicketPayload) => {
    setIsSavingExtracted(true);
    try {
      const { movimiento } = await api.saveTicket(payload);
      prependMovements([{ ...movimiento, conciliado: movimiento.conciliado ?? true }]);
      clearExtracted();
      toast.success('Ticket guardado.', {
        action: {
          label: 'Deshacer',
          onClick: () => {
            void api.deleteMovimiento(movimiento.id)
              .then(() => removeMovement(movimiento.id))
              .catch(() => toast.error('No se pudo deshacer.'));
          },
        },
      });
    } catch {
      toast.error('No se pudo guardar el ticket.');
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
          setIsCargaOpen(false);
          break;
        case 'ELIMINAR_MOVIMIENTO':
          if (event.deletedId) { removeMovement(event.deletedId); showToast('Último movimiento eliminado.'); }
          setIsCargaOpen(false);
          break;
        case 'REGISTRAR':
          prependMovements(event.saved);
          showToast(`${event.saved.length} movimiento${event.saved.length !== 1 ? "s" : ""} registrado${event.saved.length !== 1 ? "s" : ""}.`);
          setIsCargaOpen(false);
          break;
        case 'PENDING_COMPANY':
          setPendingItem(event.item);
          setIsCargaOpen(false);
          break;
        case 'PENDING_CATEGORY':
          setPendingCategory(event.item);
          setIsCargaOpen(false);
          break;
      }
    },
  });

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingMovement, setEditingMovement] = useState<Movimiento | null>(null);
  const [movementEditForm, setMovementEditForm] = useState<MovementEditForm | null>(null);
  const [editingCompany, setEditingCompany] = useState<Empresa | null>(null);
  const [companyEditName, setCompanyEditName] = useState('');
  const [confirmationModal, setConfirmationModal] = useState<ConfirmationModalState | null>(null);
  const [confirmationInput, setConfirmationInput] = useState('');
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);

  // ── Command palette state + keyboard trigger ────────────────────────────────
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [driveStatus, setDriveStatus] = useState<DriveStatus>({ connected: false, enabled: false });
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!canUseDrive) return;
    let active = true;
    void api.getDriveStatus().then((s) => { if (active) setDriveStatus(s); }).catch(() => {});
    return () => { active = false; };
  }, [canUseDrive]);

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
    ? [...BASE_TAB_CONFIG, { id: 'superadmin' as DashboardTab, label: 'Super Admin', description: '', icon: ShieldCheck }]
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
        setIsCargaOpen(true);
      }
      return;
    }
    if (item.type === 'movimiento') { setActiveTab('movimientos'); return; }
    if (item.type === 'empresa') { setActiveTab('empresas'); return; }
    if (item.type === 'categoria') { setActiveTab('movimientos'); return; }
  }, []);

  const goToComposer = useCallback(() => {
    setIsCargaOpen(true);
  }, []);

  // Volver a la página 1 cuando cambian los filtros.
  useEffect(() => {
    setMovementsPage(1);
  }, [selectedCompany, movementType, movementCurrency, selectedCategory, datePeriod, customFrom, customTo]);
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    resetFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer.id]);

  const companiesList = ['all', ...Array.from(new Set([...customCompanies.map((c) => c.nombre), ...history.map((i) => i.empresa_nombre).filter(Boolean)])) as string[]];

  const arsTotals = getCurrencyTotals(history, 'ARS');
  const usdTotals = getCurrencyTotals(history, 'USD');
  const companySummaries = getCompanySummaries(history, customCompanies.map((c) => c.nombre));
  const categorySummaries = getCategorySummaries(history);
  const incomeTagSummaries = getIncomeTagSummaries(history);
  const monthlySummaries = getMonthlySummaries(history);
  const activeTabMeta = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  const topExpenseCategories = categorySummaries.slice(0, 5).map((c) => ({ label: c.name, value: c.egresoArs, secondary: `${c.movimientos} movimientos` }));
  const topIncomeTags = incomeTagSummaries.slice(0, 10).map((t) => ({ label: t.label, value: formatCurrency(t.ars, 'ARS'), secondary: `${t.movimientos} movimientos · ${formatCurrency(t.usd, 'USD')} en USD` }));
  const topCompanies = companySummaries.slice(0, 5).map((c) => ({ label: c.name, value: c.ingresosArs + c.gastosArs, valueLabel: formatCurrency(c.ingresosArs, 'ARS'), secondary: `${c.movimientos} movimientos`, supportingValue: `Saldo ${formatCurrency(c.saldoArs, 'ARS')}`, segments: [{ value: c.ingresosArs, colorClass: 'bg-[var(--app-green-surface)]0', label: 'Ingresos ARS', currency: 'ARS' as const }, { value: c.gastosArs, colorClass: 'bg-[var(--app-red-surface)]0', label: 'Gastos ARS', currency: 'ARS' as const }] }));
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

  const driveConnected = canUseDrive && driveStatus.enabled && driveStatus.connected;
  const exportFilters = { datePeriod, customFrom, customTo, selectedCompany, movementType, movementCurrency, selectedCategory };

  const exportBackendReport = async (destination: 'local' | 'drive') => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await api.exportReport(buildExportRequest(exportFilters, 'pdf', destination, new Date()));
      if (destination === 'drive') {
        if (res.driveUrl) { showToast('Informe guardado en Drive.'); window.open(res.driveUrl, '_blank', 'noopener'); }
        else showToast('No se pudo guardar en Drive.', 'warning');
      } else if (res.contentBase64) {
        triggerDownload(res.fileName, res.mimeType, res.contentBase64);
      }
    } catch {
      showToast('No se pudo generar el informe.', 'warning');
    } finally {
      setExporting(false);
    }
  };

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
    setConfirmationModal({ title: 'Desactivar empresa', description, details: 'Escribí ELIMINAR para confirmar.', confirmLabel: 'Desactivar', tone: 'danger', requireText: 'ELIMINAR', preview, onConfirm: async () => { await api.deleteEmpresa(id); removeEmpresa(id); if (selectedCompany === name) setSelectedCompany('all'); showToast(`Empresa "${name}" desactivada.`, 'warning'); } });
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

  if (isLoading) return <div className="min-h-screen bg-[var(--app-canvas)] text-[var(--app-text-1)] font-sans p-4 md:p-8"><div className="mx-auto max-w-7xl"><DashboardSkeleton /></div></div>;

  return (
    <div className="min-h-screen overflow-x-clip bg-[var(--app-canvas)] text-[var(--app-text-1)] font-sans p-4 md:p-8">
      {showWizard && viewer.is_dashboard_joiner && <WelcomeJoined viewer={viewer} onFinish={() => setShowWizard(false)} />}
      {showWizard && !viewer.is_dashboard_joiner && (
        <WelcomeWizard
          onFinish={() => setShowWizard(false)}
          canInstall={pwa.available}
          onInstall={() => void pwa.promptInstall()}
        />
      )}

      <div className="max-w-7xl mx-auto space-y-8">
        {apiStatus === 'missing_url' && <div role="status" className="bg-[var(--app-amber-surface)] border border-[var(--app-amber-border)] p-4 rounded-xl flex items-center gap-3 text-[var(--app-amber-text)] text-sm"><AlertCircle className="w-5 h-5 flex-shrink-0" /><p><strong>API no configurada:</strong> Los datos no se guardarán permanentemente. Configurá la variable <code>VITE_API_URL</code> con la URL del servidor.</p></div>}
        {apiStatus === 'load_error' && <div role="alert" className="bg-[var(--app-red-surface)] border border-[var(--app-red-border)] p-4 rounded-xl flex items-start gap-3 text-[var(--chart-expense)] text-sm"><AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" /><p><strong>Error al cargar datos desde la API:</strong>{' '}{apiErrorMessage ?? 'No pudimos traer la información del dashboard.'}</p></div>}

        <MaintenanceBanner status={maintenanceStatus} />

        {/* Telegram activation banner — shown only when not linked, not dismissed, and wizard not open */}
        {!showWizard && !telegramBannerDismissed && telegramLinked === false && (
          <div role="status" className="flex items-center gap-3 rounded-xl border border-sky-200 dark:border-sky-700 bg-sky-50 dark:bg-sky-500/10 px-4 py-3 text-sky-800 dark:text-sky-200 text-sm">
            <MessageCircle className="w-4 h-4 shrink-0 text-sky-500" aria-hidden="true" />
            <p className="flex-1">Activá el bot de Telegram para cargar gastos por texto, foto o voz.</p>
            <button
              type="button"
              onClick={() => void handleTelegramBannerActivate()}
              disabled={telegramLinkingBanner}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400 bg-white dark:bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-700 dark:text-sky-200 hover:border-sky-500 disabled:opacity-50 shrink-0"
            >
              {telegramLinkingBanner ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Activar
            </button>
            <button
              type="button"
              onClick={() => setTelegramBannerDismissed(true)}
              aria-label="Cerrar"
              className="p-1 rounded-lg text-sky-500 hover:text-sky-700 dark:hover:text-sky-200 shrink-0"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        <header className="relative z-30">
          <div className="glass-chrome flex items-center gap-3 rounded-xl border border-[var(--app-border-strong)] px-5 py-3.5 shadow-[var(--app-shadow-md)]">
            <div className="flex items-center gap-2">
              <BrandMark variant="badge" />
              <span id="app-title" className="text-[15px] font-bold tracking-tight text-[var(--app-text-1)]">Caja Chica</span>
            </div>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setIsPaletteOpen(true)}
              aria-label="Búsqueda global (⌘K)"
              title="Búsqueda global"
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[var(--app-border)] bg-[var(--app-surface-1)] text-sm text-[var(--app-text-2)] hover:border-[var(--app-border-strong)] transition-colors duration-150"
            >
              <Search className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden md:inline">Buscar</span>
              <kbd className="font-mono">⌘K</kbd>
            </button>
            {canWriteData && (
              <button
                type="button"
                onClick={goToComposer}
                aria-label="Nueva operación"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-[var(--app-strong-surface)] bg-[var(--app-strong-surface)] px-3 py-1.5 text-sm font-bold text-[var(--app-strong-text)] active:scale-[0.97]"
              >
                <span aria-hidden="true">＋</span><span>Nueva operación</span>
              </button>
            )}
            <HeaderUserMenu
              email={viewer.email}
              identityLabel={formatIdentity(viewer.role as AppRole, dashboardRole as DashboardRole)}
              photoUrl={viewer.profile_photo_url}
              theme={theme}
              onToggleTheme={onToggleTheme}
              onSignOut={() => void handleSignOut()}
              onOpenHelp={() => setIsHelpOpen(true)}
              onReplayTour={() => setIsTourOpen(true)}
              onInstallApp={!pwa.standalone ? () => void pwa.promptInstall() : undefined}
            />
          </div>
        </header>

        <section className="sticky top-3 z-20">
          <div className="glass-chrome border border-[var(--app-border)] rounded-xl p-2.5">
            <div role="tablist" aria-label="Secciones del dashboard" className="flex gap-2 overflow-x-auto md:flex-wrap">
              {tabs.map((tab) => { const Icon = tab.icon; const isActive = activeTab === tab.id; return <button key={tab.id} role="tab" aria-selected={isActive ? 'true' : 'false'} onClick={() => setActiveTab(tab.id)} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[15px] font-bold whitespace-nowrap transition duration-150 active:scale-[0.97] border ${isActive ? 'bg-[var(--app-strong-surface)] text-[var(--app-strong-text)] border-[var(--app-strong-surface)] shadow-[var(--app-shadow-md)]' : 'bg-[var(--app-surface-1)] text-[var(--app-text-2)] border-[var(--app-border)] shadow-[var(--app-shadow-sm)] hover:border-[var(--app-border-strong)]'}`}><Icon className="w-4 h-4 shrink-0" />{tab.label}</button>; })}
            </div>
            {activeTabMeta.description && <p className="mt-2.5 px-1 text-sm text-[var(--app-text-3)]">{activeTabMeta.description}</p>}
          </div>
        </section>

        <main className="sm:pb-0 pb-24">
          <div key={activeTab} className="anim-fade-in">
              <Suspense fallback={<SectionLoadingState message={`Cargando ${activeTabMeta.label.toLowerCase()}...`} />}>
                {activeTab === 'resumen' && <ResumenTab arsIngreso={formatCurrency(arsTotals.ingreso, 'ARS')} arsEgreso={formatCurrency(arsTotals.egreso, 'ARS')} arsNeto={formatCurrency(arsTotals.neto, 'ARS')} usdNeto={formatCurrency(usdTotals.neto, 'USD')} companyCount={companySummaries.length} history={history} companiesList={companiesList} topExpenseCategories={topExpenseCategories} topCompanies={topCompanies} incomeTags={topIncomeTags} netPositive={arsTotals.neto >= 0} canWriteData={canWriteData} forecast={forecastResult} projectedArsFormatted={formatCurrency(forecastResult.projectedArs, 'ARS')} projectedUsdFormatted={formatCurrency(forecastResult.projectedUsd, 'USD')} insights={dashboardInsights} />}
                {activeTab === 'movimientos' && <MovimientosTab incomeCount={visibleIncomeCount} expenseCount={visibleExpenseCount} historyCount={filteredHistory.length} companiesList={companiesList} categories={categories} selectedCompany={selectedCompany} setSelectedCompany={setSelectedCompany} movementType={movementType} setMovementType={setMovementType} movementCurrency={movementCurrency} setMovementCurrency={setMovementCurrency} selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory} datePeriod={datePeriod} setDatePeriod={setDatePeriod} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} searchText={searchText} setSearchText={setSearchText} onOpenSearch={() => setIsPaletteOpen(true)} hasActiveFilters={hasActiveFilters} resetFilters={resetFilters} canWriteData={canWriteData} onOpenCarga={() => setIsCargaOpen(true)} onExportCsv={() => void shareOrDownloadCsv('movimientos.csv', buildMovimientosCsv(filteredHistory))} onExportPdf={() => void exportBackendReport('local')} onExportDrive={() => void exportBackendReport('drive')} driveConnected={driveConnected} exporting={exporting} onboardingState={viewer.onboarding_state} onDemoDeleted={handleDemoDeleted} historyCards={<MovementCards filteredHistory={filteredHistory} selectedCompany={selectedCompany} canWriteData={canWriteData} hasMore={hasMore} loadingMore={loadingMore} copiedId={copiedId} page={movementsPage} onPageChange={setMovementsPage} onEdit={openMovementEditor} onCopy={copyJson} onDelete={deleteItem} onLoadMore={() => void loadData(true)} />} />}
                {activeTab === 'recurrentes' && <Suspense fallback={<SectionLoadingState message="Cargando recurrentes..." />}><RecurrentesTab viewer={viewer} canWriteData={canWriteData} /></Suspense>}
                {activeTab === 'empresas' && <EmpresasTab companySummaries={companySummaries} topCompanies={topCompanies} customCompanies={customCompanies} canWriteData={canWriteData} onEditCompany={openCompanyEditor} onDeleteCompany={(c) => deleteCompany(c.id, c.nombre)} onCreateCompany={async (nombre) => { const t = nombre.trim(); if (!t) return; if (customCompanies.some((c) => c.nombre.toLowerCase() === t.toLowerCase())) { showToast(`La empresa "${t}" ya existe.`, 'warning'); return; } const e = await api.addEmpresa(t); appendEmpresa(e); showToast(`Empresa "${t}" creada.`); }} formatCurrency={formatCurrency} history={history} companiesList={companiesList} onDrilldown={(company, category) => { setSelectedCompany(company); setSelectedCategory(category); setMovementType('all'); setMovementCurrency('all'); setDatePeriod('all'); setActiveTab('movimientos'); }} />}
                {activeTab === 'superadmin' && <Suspense fallback={<SectionLoadingState message="Cargando paneles avanzados..." />}><AdminPanel viewer={viewer} /></Suspense>}
                {activeTab === 'configuracion' && <Suspense fallback={<SectionLoadingState message="Cargando configuración..." />}><ConfiguracionTab viewer={viewer} data={dashboardAccess} loading={isLoadingCollaboration} onRefresh={loadCollaboration} canConnectDrive={canConnectDrive} onSignOut={handleSignOut} companies={customCompanies} themePreference={themePreference} onSetThemePreference={onSetThemePreference} lightPalette={lightPalette} darkPalette={darkPalette} onSetLightPalette={onSetLightPalette} onSetDarkPalette={onSetDarkPalette} onDisconnectDrive={canConnectDrive ? async () => { try { await api.disconnectDrive(); showToast('Drive desconectado.'); } catch { showToast('No se pudo desconectar Drive.', 'warning'); } } : undefined} onDemoDeleted={handleDemoDeleted} /></Suspense>}
              </Suspense>
            </div>
        </main>

        {extracted && (
          <ImageTicketModal
            extracted={extracted}
            companiesList={companiesList}
            defaultEmpresa={readDefaultEmpresa()}
            isSaving={isSavingExtracted}
            onSave={(payload) => void handleSaveTicket(payload)}
            onCancel={clearExtracted}
          />
        )}

        {/* Barra flotante (solo mobile): acceso rápido a buscar y cargar */}
        <div className="sm:hidden fixed left-1/2 -translate-x-1/2 z-30 bottom-[calc(env(safe-area-inset-bottom)+1rem)]">
          <div className="flex min-h-12 items-center gap-1.5 rounded-full border border-white/15 bg-[#202020]/95 px-1.5 py-1.5 shadow-[0_-10px_34px_rgba(0,0,0,0.42),0_10px_28px_rgba(0,0,0,0.32)] backdrop-blur-md ring-1 ring-black/40">
            <button
              type="button"
              onClick={() => setIsPaletteOpen(true)}
              aria-label="Búsqueda global"
              className="inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-bold text-neutral-200 transition duration-150 hover:bg-white/5 active:scale-[0.97]"
            >
              <Search className="w-4 h-4" aria-hidden="true" />
              Buscar
            </button>
            {canWriteData && (
              <button
                type="button"
                onClick={goToComposer}
                aria-label="Nueva operación"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[var(--app-strong-surface)] px-4 text-sm font-black text-[var(--app-strong-text)] shadow-[0_8px_20px_rgba(0,0,0,0.28)] transition duration-150 active:scale-[0.97]"
              >
                <span aria-hidden="true">＋</span>Nueva
              </button>
            )}
          </div>
        </div>

        <CommandPalette
          open={isPaletteOpen}
          onClose={() => setIsPaletteOpen(false)}
          searchInput={{ movimientos: history, empresas: customCompanies, categorias: categories, quickActions: paletteQuickActions }}
          onSelect={handlePaletteSelect}
        />

        <ScrollToTop />
        <HelpModal open={isHelpOpen} onClose={() => setIsHelpOpen(false)} section={activeTab} />
        <TourModal open={isTourOpen} onClose={closeTour} />
        <PwaInstallBanner pwa={pwa} />

        <CargaModal
          open={isCargaOpen}
          onClose={() => setIsCargaOpen(false)}
          inputText={inputText}
          setInputText={setInputText}
          isProcessing={isProcessing}
          isExtracting={isExtracting}
          error={error}
          extractError={extractError}
          onSubmit={() => void handleProcess()}
          onImageFile={handleImageFile}
        />

        <DashboardModals
          editingMovement={editingMovement} movementEditForm={movementEditForm} setMovementEditForm={setMovementEditForm}
          onCloseMovementEdit={() => { setEditingMovement(null); setMovementEditForm(null); }} onSaveMovementEdit={() => void saveMovementEdit()}
          editingCompany={editingCompany} companyEditName={companyEditName} setCompanyEditName={setCompanyEditName}
          onCloseCompanyEdit={() => { setEditingCompany(null); setCompanyEditName(''); }} onSaveCompanyEdit={() => void saveCompanyEdit()}
          pendingItem={pendingItem} isAssigning={isAssigning} companiesList={companiesList} readDefaultEmpresa={readDefaultEmpresa}
          onAssignCompany={(empresa) => void assignPendingMovement(empresa, (saved) => { prependMovements(saved); showToast(empresa === 'Personal' ? 'Asignado a Personal' : `Asignado a ${empresa}`); }, () => showToast('No se pudo guardar el movimiento.', 'warning'))}
          onCancelPending={() => setPendingItem(null)}
          pendingCategory={pendingCategory} isAssigningCategory={isAssigningCategory} categoriesList={categories.map((c) => c.nombre)}
          onAssignCategory={(categoria, create) => void assignPendingCategory(categoria, { create }, (saved) => { prependMovements(saved); if (create) void queryClient.invalidateQueries({ queryKey: ['categorias'] }); showToast(`Movimiento registrado en ${categoria}.`); }, () => showToast('No se pudo guardar el movimiento.', 'warning'))}
          onCancelPendingCategory={() => setPendingCategory(null)}
          confirmationModal={confirmationModal} confirmationInput={confirmationInput} setConfirmationInput={setConfirmationInput}
          isConfirmingAction={isConfirmingAction}
          onCloseConfirmation={() => { if (!isConfirmingAction) { setConfirmationModal(null); setConfirmationInput(''); } }}
          onRunConfirmation={() => void runConfirmation()}
        />

        <footer className="pt-12 pb-8 border-t border-[var(--app-border)] text-center">
          <p className="text-xs text-[var(--app-text-3)]">Desarrollado para el mercado Argentino. Las conversiones de jerga son aproximadas y se basan en el uso común.</p>
        </footer>
      </div>
    </div>
  );
}
