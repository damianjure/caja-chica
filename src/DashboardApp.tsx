import { lazy, Suspense, useState, useEffect, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Send,
  Trash2,
  Copy,
  Check,
  TrendingDown,
  TrendingUp,
  MessageSquareText,
  AlertCircle,
  Loader2,
  LogOut,
  ShieldCheck,
  LayoutGrid,
  Building2,
  FileSpreadsheet,
  ArrowUpDown,
  Pencil,
  X,
} from 'lucide-react';
import { api, ExtractedItem, Movimiento, Empresa, Categoria, AppViewer, Presupuesto, DashboardMembersResponse } from './services/api';
import { getPendingCompanyAssignment } from './dashboard/companyAssignment';
import {
  formatCurrency,
  getCategorySummaries,
  getCompanySummaries,
  getCurrencyTotals,
  getRecentExpenses,
  getRecentIncomes,
  getCurrentPeriod,
  filterMovements,
  getIncomeSummaries,
  getIncomeTagSummaries,
  getMonthlySummaries,
} from './dashboard/summary';
import { supabase } from './services/supabase';
import { DashboardSkeleton, SectionLoadingState } from './components/dashboard/LoadingStates';
import { ThemeMode, ThemeToggle } from './components/ThemeToggle';
import { SectionCard } from './components/dashboard/primitives';

interface DashboardAppProps {
  viewer: AppViewer;
  onSignOut: () => Promise<void> | void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

type DashboardTab = 'resumen' | 'empresas' | 'gastos' | 'ingresos' | 'informes' | 'movimientos';

const ResumenTab = lazy(() => import('./components/dashboard/tabs/ResumenTab'));
const EmpresasTab = lazy(() => import('./components/dashboard/tabs/EmpresasTab'));
const GastosTab = lazy(() => import('./components/dashboard/tabs/GastosTab'));
const IngresosTab = lazy(() => import('./components/dashboard/tabs/IngresosTab'));
const InformesTab = lazy(() => import('./components/dashboard/tabs/InformesTab'));
const MovimientosTab = lazy(() => import('./components/dashboard/tabs/MovimientosTab'));
const AdminPanel = lazy(() => import('./components/AdminPanel').then((module) => ({ default: module.AdminPanel })));
const BotConnectionPanel = lazy(() => import('./components/BotConnectionPanel').then((module) => ({ default: module.BotConnectionPanel })));

interface MovementEditForm {
  tipo: 'ingreso' | 'egreso';
  moneda: 'ARS' | 'USD';
  monto: string;
  categoria: string;
  empresa: string;
  descripcion: string;
}

interface ConfirmationModalState {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'danger' | 'neutral';
  requireText?: string;
  details?: string;
  onConfirm: () => Promise<void> | void;
}

const TAB_CONFIG: Array<{ id: DashboardTab; label: string; description: string; icon: typeof LayoutGrid }> = [
  { id: 'resumen', label: 'Resumen', description: 'Ingresos, gastos, utilidad, caja y alertas', icon: LayoutGrid },
  { id: 'empresas', label: 'Empresas', description: 'Comparación por empresa, sucursal o unidad', icon: Building2 },
  { id: 'gastos', label: 'Gastos', description: 'Categorías, presupuesto vs real y evolución', icon: TrendingDown },
  { id: 'ingresos', label: 'Ingresos', description: 'Ventas por cliente, producto, canal y período', icon: TrendingUp },
  { id: 'informes', label: 'Informes', description: 'Exportaciones, reportes guardados e historial', icon: FileSpreadsheet },
  { id: 'movimientos', label: 'Movimientos', description: 'Transacciones filtrables y trazabilidad', icon: ArrowUpDown },
];


function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-neutral-200 p-6 md:p-8 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-neutral-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl border border-neutral-200 hover:bg-neutral-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function normalizeMovement(item: Movimiento): Movimiento {
  return {
    ...item,
    conciliado: item.conciliado ?? true,
  };
}

export default function DashboardApp({ viewer, onSignOut, theme, onToggleTheme }: DashboardAppProps) {
  const initialBudgetPeriod = getCurrentPeriod();
  const [activeTab, setActiveTab] = useState<DashboardTab>('resumen');
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [history, setHistory] = useState<Movimiento[]>([]);
  const [pendingItem, setPendingItem] = useState<ExtractedItem & { originalText: string } | null>(null);
  const [customCompanies, setCustomCompanies] = useState<Empresa[]>([]);
  const [categories, setCategories] = useState<Categoria[]>([]);
  const [budgets, setBudgets] = useState<Presupuesto[]>([]);
  const [budgetPeriod, setBudgetPeriod] = useState(initialBudgetPeriod);
  const [budgetForm, setBudgetForm] = useState({
    period: initialBudgetPeriod,
    categoria: '',
    moneda: 'ARS' as 'ARS' | 'USD',
    monto: '',
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'warning'} | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [movementType, setMovementType] = useState<'all' | 'ingreso' | 'egreso'>('all');
  const [movementCurrency, setMovementCurrency] = useState<'all' | 'ARS' | 'USD'>('all');
  const [apiStatus, setApiStatus] = useState<'ready' | 'missing_url' | 'load_error'>('ready');
  const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingCollaboration, setIsLoadingCollaboration] = useState(true);
  const [isLoadingBudget, setIsLoadingBudget] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [dashboardAccess, setDashboardAccess] = useState<DashboardMembersResponse | null>(null);
  const [editingMovement, setEditingMovement] = useState<Movimiento | null>(null);
  const [movementEditForm, setMovementEditForm] = useState<MovementEditForm | null>(null);
  const [editingCompany, setEditingCompany] = useState<Empresa | null>(null);
  const [companyEditName, setCompanyEditName] = useState('');
  const [selectedExpenseCompany, setSelectedExpenseCompany] = useState<string>('all');
  const [confirmationModal, setConfirmationModal] = useState<ConfirmationModalState | null>(null);
  const [confirmationInput, setConfirmationInput] = useState('');
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);
  const nextCursorRef = useRef<string | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const companiesList = [
    'all',
    ...Array.from(new Set([
      ...customCompanies.map((company) => company.nombre),
      ...history.map((item) => item.empresa_nombre).filter(Boolean),
    ])) as string[],
  ];

  const filteredHistory = filterMovements(history, {
    company: selectedCompany,
    tipo: movementType,
    moneda: movementCurrency,
  });
  const expenseCompanyOptions = companiesList;
  const expenseHistory = selectedExpenseCompany === 'all'
    ? history
    : history.filter((item) => item.empresa_nombre === selectedExpenseCompany);

  const arsTotals = getCurrencyTotals(history, 'ARS');
  const usdTotals = getCurrencyTotals(history, 'USD');
  const companySummaries = getCompanySummaries(history);
  const categorySummaries = getCategorySummaries(history);
  const filteredExpenseCategorySummaries = getCategorySummaries(
    history,
    selectedExpenseCompany === 'all' ? undefined : selectedExpenseCompany,
  );
  const incomeSummaries = getIncomeSummaries(history);
  const incomeTagSummaries = getIncomeTagSummaries(history);
  const monthlySummaries = getMonthlySummaries(history);
  const expenseMonthlySummaries = getMonthlySummaries(expenseHistory);
  const totalAlerts = [
    arsTotals.neto < 0 ? 'Caja ARS negativa en el período.' : null,
    usdTotals.neto < 0 ? 'Caja USD negativa en el período.' : null,
    history.length === 0 ? 'Todavía no hay movimientos cargados.' : null,
  ].filter(Boolean) as string[];
  const dashboardRole =
    dashboardAccess?.members.find((member) => member.user_id === viewer.id)?.role ?? 'owner';
  const canWriteData = dashboardRole !== 'viewer';
  const activeTabMeta = TAB_CONFIG.find((tab) => tab.id === activeTab) ?? TAB_CONFIG[0];
  const monthlyChartDataArs = [...monthlySummaries]
    .reverse()
    .map((item) => ({
      label: item.period.slice(5),
      income: item.ingresosArs,
      expense: item.gastosArs,
      net: item.netoArs,
    }))
    .filter((item) => item.income > 0 || item.expense > 0);
  const monthlyChartDataUsd = [...monthlySummaries]
    .reverse()
    .map((item) => ({
      label: item.period.slice(5),
      income: item.ingresosUsd,
      expense: item.gastosUsd,
      net: item.netoUsd,
    }))
    .filter((item) => item.income > 0 || item.expense > 0);
  const expenseMonthlyChartData = [...expenseMonthlySummaries]
    .reverse()
    .map((item) => ({
      label: item.period.slice(5),
      income: item.ingresosArs,
      expense: item.gastosArs,
      net: item.netoArs,
    }));
  const topExpenseCategories = categorySummaries.slice(0, 5).map((category) => ({
    label: category.name,
    value: category.egresoArs,
    secondary: `${category.movimientos} movimientos`,
  }));
  const topIncomeSources = incomeSummaries.slice(0, 5).map((income) => ({
    label: income.name,
    value: income.ars + income.usd,
    valueLabel: `${formatCurrency(income.ars, 'ARS')} · ${formatCurrency(income.usd, 'USD')}`,
    secondary: `${income.movimientos} movimientos`,
    segments: [
      { value: income.ars, colorClass: 'bg-green-500', label: 'Ingresos ARS', currency: 'ARS' as const },
      { value: income.usd, colorClass: 'bg-emerald-300', label: 'Ingresos USD', currency: 'USD' as const },
    ],
  }));
  const topIncomeTags = incomeTagSummaries.slice(0, 10).map((tag) => ({
    label: tag.label,
    value: formatCurrency(tag.ars, 'ARS'),
    secondary: `${tag.movimientos} movimientos · ${formatCurrency(tag.usd, 'USD')} en USD`,
  }));
  const topCompanies = companySummaries.slice(0, 5).map((company) => ({
    label: company.name,
    value: company.ingresosArs + company.gastosArs,
    valueLabel: formatCurrency(company.ingresosArs, 'ARS'),
    secondary: `${company.movimientos} movimientos`,
    supportingValue: `Saldo ${formatCurrency(company.saldoArs, 'ARS')}`,
    segments: [
      { value: company.ingresosArs, colorClass: 'bg-green-500', label: 'Ingresos ARS', currency: 'ARS' as const },
      { value: company.gastosArs, colorClass: 'bg-red-500', label: 'Gastos ARS', currency: 'ARS' as const },
    ],
  }));
  const expenseCompanies = getCompanySummaries(history)
    .filter((company) => company.gastosArs > 0)
    .slice(0, 8)
    .map((company) => ({
      label: company.name,
      value: company.gastosArs,
      secondary: `${company.movimientos} movimientos · saldo ${formatCurrency(company.saldoArs, 'ARS')}`,
    }));
  const recentExpenses = getRecentExpenses(
    history,
    selectedExpenseCompany === 'all' ? undefined : selectedExpenseCompany,
    5,
  );
  const recentIncomes = getRecentIncomes(history, 5);
  const visibleIncomeCount = filteredHistory.filter((item) => item.tipo === 'ingreso').length;
  const visibleExpenseCount = filteredHistory.filter((item) => item.tipo === 'egreso').length;

  const loadCollaboration = async () => {
    try {
      const data = await api.getDashboardMembers();
      setDashboardAccess(data);
    } catch (err) {
      console.error('Failed to load collaboration data', err);
    } finally {
      setIsLoadingCollaboration(false);
    }
  };

  const loadBudgets = async (period: string) => {
    setIsLoadingBudget(true);
    try {
      const rows = await api.getPresupuestos(period);
      setBudgets(rows);
    } catch (err) {
      console.error('Failed to load budgets', err);
    } finally {
      setIsLoadingBudget(false);
    }
  };

  const loadData = async (append = false) => {
    if (append) setLoadingMore(true);
    else setIsLoading(true);

    try {
      const url = (import.meta as any).env.VITE_API_URL;
      if (!url || url.includes('placeholder')) {
        setApiStatus('missing_url');
        setApiErrorMessage(null);
        setIsLoading(false);
        return;
      }

      const limit = 50;
      const [movsPage, emps, cats] = await Promise.all([
        api.getMovimientos(limit, append ? nextCursorRef.current : null),
        api.getEmpresas(),
        api.getCategorias(),
      ]);
      const normalizedItems = movsPage.items.map(normalizeMovement);

      if (append) setHistory((prev) => [...prev, ...normalizedItems]);
      else {
        setHistory(normalizedItems);
        setSelectedCompany('all');
        setMovementType('all');
        setMovementCurrency('all');
        setSelectedExpenseCompany('all');
      }

      nextCursorRef.current = movsPage.nextCursor;
      setHasMore(Boolean(movsPage.nextCursor));
      setCustomCompanies(emps);
      setCategories(cats);
      setApiStatus('ready');
      setApiErrorMessage(null);
    } catch (err) {
      console.error('Failed to load data', err);
      setApiStatus('load_error');
      setApiErrorMessage(err instanceof Error ? err.message : 'No se pudo cargar la información del dashboard.');
    } finally {
      setIsLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void loadData();
    void loadCollaboration();
  }, [viewer.id]);

  useEffect(() => {
    const url = (import.meta as any).env.VITE_API_URL;
    if (!url || url.includes('placeholder')) {
      setIsLoadingBudget(false);
      return;
    }
    void loadBudgets(budgetPeriod);
  }, [budgetPeriod]);

  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel('realtime-movimientos')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'movimientos' }, (payload) => {
        const newMov = normalizeMovement(payload.new as Movimiento);
        setHistory((prev) => {
          if (prev.some((item) => item.id === newMov.id)) return prev;
          return [newMov, ...prev];
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'movimientos' }, (payload) => {
        setHistory((prev) => prev.filter((item) => item.id !== payload.old.id));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'empresas' }, (payload) => {
        const newEmp = payload.new as Empresa;
        setCustomCompanies((prev) => (prev.some((item) => item.id === newEmp.id) ? prev : [...prev, newEmp]));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'categorias' }, (payload) => {
        const newCat = payload.new as Categoria;
        setCategories((prev) => (prev.some((item) => item.id === newCat.id) ? prev : [...prev, newCat]));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const showNotification = (message: string, type: 'success' | 'warning' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleProcess = async () => {
    if (!canWriteData) {
      showNotification('Tenés acceso viewer: solo lectura.', 'warning');
      return;
    }
    if (!inputText.trim() || isProcessing) return;
    setIsProcessing(true);
    setError(null);

    try {
      const result = await api.extract(inputText, categories);

      if ('error' in result) {
        setError(result.error === 'no_data_found' ? 'No se entendió el comando.' : result.error);
      } else {
        switch (result.intent) {
          case 'GESTIONAR_EMPRESA': {
            const typed = result as { action: string; companyName: string };
            if (typed.action === 'ADD') {
              const exists = customCompanies.some((company) => company.nombre.toLowerCase() === typed.companyName.toLowerCase());
              if (!exists) {
                const newEmp = await api.addEmpresa(typed.companyName);
                setCustomCompanies((prev) => [...prev, newEmp]);
                showNotification(`Empresa "${typed.companyName}" creada.`);
              } else {
                showNotification(`La empresa "${typed.companyName}" ya existe.`, 'warning');
              }
            }
            break;
          }
          case 'ELIMINAR_MOVIMIENTO': {
            const typed = result as { target: string };
            if (typed.target === 'last') {
              const response = await api.deleteLastMovimiento();
              if (response.id) {
                setHistory((prev) => prev.filter((item) => item.id !== response.id));
                showNotification('Último movimiento eliminado.');
              }
            }
            break;
          }
          case 'REGISTRAR': {
            const typed = result as { items: ExtractedItem[] };
            const pendingAssignment = getPendingCompanyAssignment(typed.items, inputText);

            if (pendingAssignment) {
              setPendingItem(pendingAssignment);
              showNotification('Elegí la empresa antes de guardar el movimiento.');
              break;
            }

            const saved = await api.saveMovimientos(typed.items, inputText);
            setHistory((prev) => [...saved.map(normalizeMovement), ...prev]);
            showNotification(`${saved.length} transacciones registradas.`);
            break;
          }
          default:
            setError('Intención no soportada todavía.');
        }

        setInputText('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar.');
    } finally {
      setIsProcessing(false);
    }
  };

  const deleteItem = async (id: string) => {
    if (!canWriteData) return;
    setConfirmationInput('');
    setConfirmationModal({
      title: 'Eliminar movimiento',
      description: 'Vas a borrar este movimiento del historial. La acción queda auditada y no se puede deshacer desde la UI.',
      confirmLabel: 'Eliminar movimiento',
      tone: 'danger',
      onConfirm: async () => {
        await api.deleteMovimiento(id);
        setHistory((prev) => prev.filter((item) => item.id !== id));
        showNotification('Movimiento eliminado.', 'warning');
      },
    });
  };

  const deleteCompany = async (id: string, name: string) => {
    if (!canWriteData) return;
    setConfirmationInput('');
    setConfirmationModal({
      title: `Desactivar ${name}`,
      description: 'Esto hace soft delete, crea backup redundante y deja log de auditoría.',
      details: 'Escribí ELIMINAR para confirmar.',
      confirmLabel: 'Desactivar empresa',
      tone: 'danger',
      requireText: 'ELIMINAR',
      onConfirm: async () => {
        await api.deleteEmpresa(id);
        setCustomCompanies((prev) => prev.filter((company) => company.id !== id));
        if (selectedCompany === name) setSelectedCompany('all');
        if (selectedExpenseCompany === name) setSelectedExpenseCompany('all');
        showNotification(`Empresa "${name}" desactivada.`, 'warning');
      },
    });
  };

  const deleteCategory = async (id: string, name: string) => {
    if (!canWriteData) return;
    setConfirmationInput('');
    setConfirmationModal({
      title: `Eliminar categoría ${name}`,
      description: 'Si todavía está en uso, la API la va a rechazar. Si no, se elimina del dashboard.',
      confirmLabel: 'Eliminar categoría',
      tone: 'danger',
      onConfirm: async () => {
        await api.deleteCategoria(id);
        setCategories((prev) => prev.filter((category) => category.id !== id));
        showNotification(`Categoría "${name}" eliminada.`, 'warning');
      },
    });
  };

  const saveBudget = async () => {
    if (!canWriteData) {
      showNotification('Tenés acceso viewer: no podés editar presupuestos.', 'warning');
      return;
    }
    const parsedAmount = Number(budgetForm.monto);
    const categoria = budgetForm.categoria.trim();

    if (!categoria || !Number.isFinite(parsedAmount)) {
      showNotification('Completá categoría y monto del presupuesto.', 'warning');
      return;
    }

    try {
      const saved = await api.savePresupuesto({
        period: budgetForm.period,
        categoria,
        moneda: budgetForm.moneda,
        monto: parsedAmount,
      });

      setBudgets((prev) => {
        const next = prev.filter(
          (item) =>
            !(
              item.period === saved.period &&
              item.categoria.toLowerCase() === saved.categoria.toLowerCase() &&
              item.moneda === saved.moneda
            ),
        );
        return [...next, saved].sort((a, b) => a.categoria.localeCompare(b.categoria));
      });
      setBudgetPeriod(saved.period);
      setBudgetForm((prev) => ({ ...prev, categoria: '', monto: '', period: saved.period }));
      showNotification(`Presupuesto guardado para ${saved.categoria}.`);
    } catch {
      showNotification('No se pudo guardar el presupuesto.', 'warning');
    }
  };

  const copyJson = (item: Movimiento) => {
    const { id, original_text, created_at, ...cleanData } = item;
    navigator.clipboard.writeText(JSON.stringify(cleanData, null, 2));
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    await loadData(true);
  };

  const openMovementEditor = (item: Movimiento) => {
    setEditingMovement(item);
    setMovementEditForm({
      tipo: item.tipo as 'ingreso' | 'egreso',
      moneda: item.moneda as 'ARS' | 'USD',
      monto: String(item.monto ?? ''),
      categoria: item.categoria || '',
      empresa: item.empresa_nombre || 'Personal',
      descripcion: item.descripcion || '',
    });
  };

  const saveMovementEdit = async () => {
    if (!editingMovement || !movementEditForm) return;
    const monto = Number(movementEditForm.monto);
    if (!Number.isFinite(monto) || !movementEditForm.categoria.trim() || !movementEditForm.descripcion.trim()) {
      showNotification('Completá monto, categoría y descripción.', 'warning');
      return;
    }

    try {
      await api.updateMovimiento(editingMovement.id, {
        tipo: movementEditForm.tipo,
        moneda: movementEditForm.moneda,
        monto,
        categoria: movementEditForm.categoria.trim(),
        empresa: movementEditForm.empresa.trim() || 'Personal',
        descripcion: movementEditForm.descripcion.trim(),
      });

      setHistory((prev) =>
        prev.map((item) =>
          item.id === editingMovement.id
            ? {
                ...item,
                tipo: movementEditForm.tipo,
                moneda: movementEditForm.moneda,
                monto,
                categoria: movementEditForm.categoria.trim(),
                empresa_nombre: movementEditForm.empresa.trim() || 'Personal',
                descripcion: movementEditForm.descripcion.trim(),
              }
            : item,
        ),
      );
      setEditingMovement(null);
      setMovementEditForm(null);
      showNotification('Movimiento actualizado.');
    } catch {
      showNotification('No se pudo actualizar el movimiento.', 'warning');
    }
  };

  const openCompanyEditor = (company: Empresa) => {
    setEditingCompany(company);
    setCompanyEditName(company.nombre);
  };

  const saveCompanyEdit = async () => {
    if (!editingCompany || !companyEditName.trim()) return;

    try {
      await api.updateEmpresa(editingCompany.id, companyEditName.trim());
      const previousName = editingCompany.nombre;
      const nextName = companyEditName.trim();
      setCustomCompanies((prev) =>
        prev.map((company) =>
          company.id === editingCompany.id ? { ...company, nombre: nextName } : company,
        ),
      );
      setHistory((prev) =>
        prev.map((item) =>
          item.empresa_nombre === previousName
            ? { ...item, empresa_nombre: nextName }
            : item,
        ),
      );
      if (selectedCompany === previousName) setSelectedCompany(nextName);
      setEditingCompany(null);
      setCompanyEditName('');
      showNotification('Empresa actualizada.');
    } catch {
      showNotification('No se pudo actualizar la empresa.', 'warning');
    }
  };

  const runConfirmation = async () => {
    if (!confirmationModal) return;
    if (confirmationModal.requireText && confirmationInput !== confirmationModal.requireText) {
      showNotification(`Escribí ${confirmationModal.requireText} para confirmar.`, 'warning');
      return;
    }

    setIsConfirmingAction(true);
    try {
      await confirmationModal.onConfirm();
      setConfirmationModal(null);
      setConfirmationInput('');
    } catch {
      showNotification('No se pudo completar la acción.', 'warning');
    } finally {
      setIsConfirmingAction(false);
    }
  };

  const actualByCategory = history
    .filter(
      (item) =>
        item.tipo === 'egreso' &&
        item.moneda === 'ARS' &&
        getCurrentPeriod(new Date(item.created_at)) === budgetPeriod,
    )
    .reduce<Record<string, number>>((acc, item) => {
      const key = (item.categoria || 'Otros').toLowerCase();
      acc[key] = (acc[key] || 0) + Number(item.monto || 0);
      return acc;
    }, {});

  const budgetVsActual = budgets
    .filter((item) => item.moneda === 'ARS' && item.period === budgetPeriod)
    .map((budget) => {
      const actual = actualByCategory[budget.categoria.toLowerCase()] || 0;
      return {
        ...budget,
        actual,
        variance: budget.monto - actual,
      };
    })
    .sort((a, b) => a.categoria.localeCompare(b.categoria));

  const assignPendingMovement = async (empresa: string) => {
    if (!pendingItem) return;
    setIsProcessing(true);
    try {
      const saved = await api.saveMovimientos([{ ...pendingItem, empresa }], pendingItem.originalText);
      setHistory((prev) => [...saved.map(normalizeMovement), ...prev]);
      setPendingItem(null);
      showNotification(empresa === 'Personal' ? 'Asignado a Personal' : `Asignado a ${empresa}`);
    } catch {
      showNotification('No se pudo guardar el movimiento.', 'warning');
    } finally {
      setIsProcessing(false);
    }
  };

  const renderComposer = () => (
    <SectionCard
      title="Centro de carga"
      description="Usá lenguaje natural para registrar movimientos, crear empresas o borrar el último movimiento."
    >
      <div className="relative group">
        <textarea
          id="message-input"
          className="w-full min-h-[140px] p-6 bg-white border border-neutral-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-neutral-900 focus:border-transparent outline-none transition-all resize-none text-lg"
          placeholder="Ej: 'Che, cobré 5 lucas por el laburito del taller' o 'Agregar empresa Casa'"
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
          onKeyDown={(event) => event.ctrlKey && event.key === 'Enter' && handleProcess()}
        />
        <div className="absolute bottom-4 right-4 flex items-center gap-3">
          <span className="text-xs text-neutral-400 hidden sm:block">Ctrl + Enter</span>
          <button
            id="process-button"
            onClick={handleProcess}
            disabled={!inputText.trim() || isProcessing}
            className="flex items-center gap-2 bg-neutral-900 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-neutral-200"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {isProcessing ? 'Procesando...' : 'Enviar'}
          </button>
        </div>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 text-sm"
        >
          <AlertCircle className="w-4 h-4" />
          {error}
        </motion.div>
      )}
    </SectionCard>
  );

  const renderHistoryCards = () => (
    <>
      {filteredHistory.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-4 border-2 border-dashed border-neutral-200 rounded-3xl text-neutral-400">
          <MessageSquareText className="w-12 h-12 mb-4 opacity-20" />
          <p>{selectedCompany === 'all' ? 'Todavía no hay nada por acá.' : `No hay datos para "${selectedCompany}"`}</p>
          <p className="text-sm">Mandá un mensaje para empezar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredHistory.map((item) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="group bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden"
              >
                <div className={`absolute top-0 right-0 w-32 h-32 -mr-16 -mt-16 rounded-full opacity-[0.03] pointer-events-none ${item.tipo === 'ingreso' ? 'bg-green-500' : 'bg-red-500'}`} />

                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg ${item.tipo === 'ingreso' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                      {item.tipo === 'ingreso' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-400 block leading-none mb-1">{item.categoria}</span>
                      <span className="font-semibold text-neutral-900">
                        {item.monto !== null
                          ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: item.moneda || 'ARS' }).format(item.monto)
                          : 'Monto no especificado'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {canWriteData && (
                      <button
                        onClick={() => openMovementEditor(item)}
                        className="p-2 text-neutral-400 hover:text-neutral-900 transition-colors rounded-lg hover:bg-neutral-50"
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => copyJson(item)}
                      className="p-2 text-neutral-400 hover:text-neutral-900 transition-colors rounded-lg hover:bg-neutral-50"
                      title="Copiar JSON"
                    >
                      {copiedId === item.id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                    {canWriteData && (
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="p-2 text-neutral-400 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50"
                        title="Borrar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm text-neutral-600 italic line-clamp-2">"{item.original_text}"</p>

                  <div className="flex flex-wrap gap-2">
                    {item.empresa_nombre && (
                      <span className="text-[11px] font-medium px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded-md">🏢 {item.empresa_nombre}</span>
                    )}
                    <span className="text-[11px] font-medium px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded-md">🎯 {item.descripcion}</span>
                  </div>

                  <div className="pt-3 border-t border-neutral-50 flex justify-between items-center">
                    <span className="text-[10px] text-neutral-400 font-mono">{new Date(item.created_at).toLocaleString('es-AR')}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-tight ${item.tipo === 'ingreso' ? 'text-green-500' : 'text-red-500'}`}>{item.tipo}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {hasMore && filteredHistory.length > 0 && (
        <div className="flex justify-center pt-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-6 py-2 bg-white border border-neutral-200 rounded-xl text-sm font-medium text-neutral-600 hover:border-neutral-400 disabled:opacity-50 transition-colors"
          >
            {loadingMore ? (
              <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando...</span>
            ) : 'Cargar más'}
          </button>
        </div>
      )}
    </>
  );

  const renderResumen = () => (
    <ResumenTab
      arsIngreso={formatCurrency(arsTotals.ingreso, 'ARS')}
      arsEgreso={formatCurrency(arsTotals.egreso, 'ARS')}
      arsNeto={formatCurrency(arsTotals.neto, 'ARS')}
      usdNeto={formatCurrency(usdTotals.neto, 'USD')}
      companyCount={companySummaries.length}
      totalAlerts={totalAlerts}
      monthlyChartDataArs={monthlyChartDataArs}
      monthlyChartDataUsd={monthlyChartDataUsd}
      topExpenseCategories={topExpenseCategories}
      topCompanies={topCompanies}
      topExpenseLabel={topExpenseCategories[0]?.label ?? 'Sin datos'}
      topExpenseValue={topExpenseCategories[0] ? formatCurrency(topExpenseCategories[0].value, 'ARS') : 'Todavía no hay egresos.'}
      netPositive={arsTotals.neto >= 0}
      canWriteData={canWriteData}
      composer={renderComposer()}
      viewer={viewer}
      dashboardAccess={dashboardAccess}
      isLoadingCollaboration={isLoadingCollaboration}
      loadCollaboration={loadCollaboration}
      adminPanels={(viewer.role === 'admin' || viewer.role === 'superadmin') ? (
        <Suspense fallback={<SectionLoadingState message="Cargando paneles avanzados..." />}>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <BotConnectionPanel />
            <AdminPanel viewer={viewer} />
          </div>
        </Suspense>
      ) : null}
    />
  );

  const renderEmpresas = () => (
    <EmpresasTab
      companySummaries={companySummaries}
      topCompanies={topCompanies}
      customCompanies={customCompanies}
      canWriteData={canWriteData}
      onEditCompany={openCompanyEditor}
      onDeleteCompany={(company) => { void deleteCompany(company.id, company.nombre); }}
      formatCurrency={formatCurrency}
    />
  );

  const renderGastos = () => (
    <GastosTab
      arsEgreso={formatCurrency(arsTotals.egreso, 'ARS')}
      usdEgreso={formatCurrency(usdTotals.egreso, 'USD')}
      categoryCount={filteredExpenseCategorySummaries.length}
      budgetForm={budgetForm}
      setBudgetForm={(updater) => setBudgetForm((prev) => updater(prev))}
      budgetPeriod={budgetPeriod}
      setBudgetPeriod={setBudgetPeriod}
      initialBudgetPeriod={initialBudgetPeriod}
      categories={categories}
      canWriteData={canWriteData}
      onSaveBudget={saveBudget}
      isLoadingBudget={isLoadingBudget}
      budgetVsActual={budgetVsActual}
      categorySummaries={filteredExpenseCategorySummaries}
      monthlyChartData={expenseMonthlyChartData}
      expenseCompanyOptions={expenseCompanyOptions}
      selectedExpenseCompany={selectedExpenseCompany}
      setSelectedExpenseCompany={setSelectedExpenseCompany}
      expenseCompanies={expenseCompanies}
      recentExpenses={recentExpenses}
      formatCurrency={formatCurrency}
    />
  );

  const renderIngresos = () => (
    <IngresosTab
      arsIngreso={formatCurrency(arsTotals.ingreso, 'ARS')}
      usdIngreso={formatCurrency(usdTotals.ingreso, 'USD')}
      sourceCount={incomeSummaries.length}
      topIncomeSources={topIncomeSources}
      incomeTags={topIncomeTags}
      recentIncomes={recentIncomes}
      formatCurrency={formatCurrency}
    />
  );

  const canUseDrive = dashboardRole === 'owner';

  const renderInformes = () => (
    <InformesTab
      history={history}
      companiesList={companiesList}
      canWriteData={canWriteData}
      canUseDrive={canUseDrive}
    />
  );

  const renderMovimientos = () => (
    <MovimientosTab
      incomeCount={visibleIncomeCount}
      expenseCount={visibleExpenseCount}
      historyCount={filteredHistory.length}
      canWriteData={canWriteData}
      composer={renderComposer()}
      companiesList={companiesList}
      selectedCompany={selectedCompany}
      setSelectedCompany={setSelectedCompany}
      movementType={movementType}
      setMovementType={setMovementType}
      movementCurrency={movementCurrency}
      setMovementCurrency={setMovementCurrency}
      customCompanies={customCompanies}
      categories={categories}
      onEditCompany={openCompanyEditor}
      onDeleteCompany={(company) => { void deleteCompany(company.id, company.nombre); }}
      onDeleteCategory={(category) => { void deleteCategory(category.id, category.nombre); }}
      historyCards={renderHistoryCards()}
    />
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'resumen':
        return renderResumen();
      case 'empresas':
        return renderEmpresas();
      case 'gastos':
        return renderGastos();
      case 'ingresos':
        return renderIngresos();
      case 'informes':
        return renderInformes();
      case 'movimientos':
        return renderMovimientos();
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans p-4 md:p-8">
        <div className="mx-auto max-w-7xl">
          <DashboardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {apiStatus === 'missing_url' && (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-3 text-amber-800 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>
              <strong>API no configurada:</strong> Los datos no se guardarán permanentemente.
              Configurá la variable <code>VITE_API_URL</code> con la URL del servidor.
            </p>
          </div>
        )}

        {apiStatus === 'load_error' && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-2xl flex items-start gap-3 text-red-700 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p>
              <strong>Error al cargar datos desde la API:</strong>{' '}
              {apiErrorMessage ?? 'No pudimos traer la información del dashboard.'}
            </p>
          </div>
        )}

        <header className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-4 min-w-0">
              <h1 id="app-title" className="text-3xl font-bold tracking-tight text-neutral-900">Dashboard financiero</h1>
              <p className="text-neutral-500">Vista clara para entender caja, rendimiento y operación sin perder trazabilidad.</p>
            </div>

            <div className="flex items-center gap-3 self-start">
              <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />
              <button
                onClick={() => void onSignOut()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-neutral-600 hover:bg-white"
              >
                <LogOut className="w-4 h-4" />
                Salir
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-4 auto-rows-fr">
              <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-4 shadow-sm min-h-[132px] flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">Rol actual</div>
                  <div className="flex items-center gap-2 text-xs font-mono text-neutral-400 bg-neutral-100 px-3 py-1.5 rounded-full w-fit">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    Realtime Active
                  </div>
                </div>
                <div className="mt-3 text-2xl font-semibold text-neutral-900 capitalize">{dashboardRole}</div>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-4 shadow-sm min-h-[132px] flex flex-col justify-between">
                <div className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">Movimientos visibles</div>
                <div className="mt-3 text-2xl font-semibold text-neutral-900">{history.length}</div>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-4 shadow-sm min-h-[132px] flex flex-col justify-between">
                <div className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">Foco de esta vista</div>
                <div className="mt-3 space-y-1">
                  <div className="text-lg font-semibold text-neutral-900">{activeTabMeta.label}</div>
                  <p className="text-sm text-neutral-500 text-balance">{activeTabMeta.description}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm min-h-[132px] flex flex-col justify-between">
                <div className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">Sesión actual</div>

                <div className="min-w-0 space-y-1">
                  <div className="break-all text-lg font-semibold text-neutral-900">{viewer.email}</div>
                  <div className="text-[11px] uppercase tracking-wider text-neutral-500 inline-flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    {viewer.role}
                  </div>
                </div>
              </div>
          </div>
        </header>

        <section className="sticky top-3 z-20">
          {/* Mobile: horizontal scroll strip */}
          <div className="md:hidden bg-white/90 backdrop-blur border border-neutral-200 rounded-2xl p-2 shadow-sm overflow-x-auto">
            <div className="flex gap-2 min-w-max">
              {TAB_CONFIG.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold whitespace-nowrap transition-all border ${isActive ? 'bg-neutral-900 text-white border-neutral-900 shadow' : 'bg-white text-neutral-700 border-transparent hover:border-neutral-200 hover:bg-neutral-50'}`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
          {/* md+: grid with descriptions */}
          <div className="hidden md:block bg-white/90 backdrop-blur border border-neutral-200 rounded-3xl p-3 shadow-sm">
            <div className="grid md:grid-cols-3 xl:grid-cols-6 gap-2">
              {TAB_CONFIG.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded-2xl px-4 py-4 text-left transition-all border ${isActive ? 'bg-neutral-900 text-white border-neutral-900 shadow-lg' : 'bg-white text-neutral-700 border-transparent hover:border-neutral-200 hover:bg-neutral-50'}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-4 h-4" />
                      <span className="font-semibold">{tab.label}</span>
                    </div>
                    <p className={`text-xs leading-relaxed ${isActive ? 'text-neutral-300' : 'text-neutral-500'}`}>{tab.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <main>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.18, ease: 'easeOut' }}
            >
              <Suspense fallback={<SectionLoadingState message={`Cargando ${activeTabMeta.label.toLowerCase()}...`} />}>
                {renderActiveTab()}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>

        <AnimatePresence>
          {notification && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
              aria-live="polite"
              className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-xl z-50 text-sm font-medium flex items-center gap-3 ${notification.type === 'success' ? 'bg-neutral-900 text-white' : 'bg-red-500 text-white'}`}
            >
              {notification.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {notification.message}
            </motion.div>
          )}
        </AnimatePresence>

        {editingMovement && movementEditForm && (
          <ModalShell title="Editar movimiento" onClose={() => {
            setEditingMovement(null);
            setMovementEditForm(null);
          }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <select
                value={movementEditForm.tipo}
                onChange={(event) => setMovementEditForm((prev) => prev ? { ...prev, tipo: event.target.value as 'ingreso' | 'egreso' } : prev)}
                className="rounded-2xl border border-neutral-200 px-4 py-3"
              >
                <option value="ingreso">ingreso</option>
                <option value="egreso">egreso</option>
              </select>
              <select
                value={movementEditForm.moneda}
                onChange={(event) => setMovementEditForm((prev) => prev ? { ...prev, moneda: event.target.value as 'ARS' | 'USD' } : prev)}
                className="rounded-2xl border border-neutral-200 px-4 py-3"
              >
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
              <input
                value={movementEditForm.monto}
                onChange={(event) => setMovementEditForm((prev) => prev ? { ...prev, monto: event.target.value } : prev)}
                type="number"
                className="rounded-2xl border border-neutral-200 px-4 py-3"
                placeholder="Monto"
              />
              <input
                value={movementEditForm.categoria}
                onChange={(event) => setMovementEditForm((prev) => prev ? { ...prev, categoria: event.target.value } : prev)}
                className="rounded-2xl border border-neutral-200 px-4 py-3"
                placeholder="Categoría"
              />
              <input
                value={movementEditForm.empresa}
                onChange={(event) => setMovementEditForm((prev) => prev ? { ...prev, empresa: event.target.value } : prev)}
                className="rounded-2xl border border-neutral-200 px-4 py-3 md:col-span-2"
                placeholder="Empresa"
              />
              <textarea
                value={movementEditForm.descripcion}
                onChange={(event) => setMovementEditForm((prev) => prev ? { ...prev, descripcion: event.target.value } : prev)}
                className="rounded-2xl border border-neutral-200 px-4 py-3 md:col-span-2 min-h-[120px]"
                placeholder="Descripción"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setEditingMovement(null);
                  setMovementEditForm(null);
                }}
                className="rounded-2xl border border-neutral-200 px-4 py-3 text-neutral-700"
              >
                Cancelar
              </button>
              <button
                onClick={() => void saveMovementEdit()}
                className="rounded-2xl bg-neutral-900 px-5 py-3 text-white font-medium"
              >
                Guardar cambios
              </button>
            </div>
          </ModalShell>
        )}

        {editingCompany && (
          <ModalShell title="Editar empresa" onClose={() => {
            setEditingCompany(null);
            setCompanyEditName('');
          }}>
            <div className="space-y-4">
              <input
                value={companyEditName}
                onChange={(event) => setCompanyEditName(event.target.value)}
                className="w-full rounded-2xl border border-neutral-200 px-4 py-3"
                placeholder="Nombre de empresa"
              />
              <p className="text-sm text-neutral-500">
                Esto renombra la empresa para el dashboard. Los movimientos visibles también se actualizan en la UI.
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setEditingCompany(null);
                  setCompanyEditName('');
                }}
                className="rounded-2xl border border-neutral-200 px-4 py-3 text-neutral-700"
              >
                Cancelar
              </button>
              <button
                onClick={() => void saveCompanyEdit()}
                className="rounded-2xl bg-neutral-900 px-5 py-3 text-white font-medium"
              >
                Guardar cambios
              </button>
            </div>
          </ModalShell>
        )}

        {pendingItem && (
          <ModalShell
            title="Asignar empresa"
            onClose={() => {
              if (isProcessing) return;
              setPendingItem(null);
            }}
          >
            <div className="space-y-5">
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4">
                <div className="text-xs font-bold uppercase tracking-widest text-neutral-400">Movimiento pendiente de empresa</div>
                <p className="mt-2 text-lg font-semibold text-neutral-900">¿A qué empresa cargamos esto?</p>
                <p className="mt-2 text-sm italic text-neutral-500">"{pendingItem.originalText}"</p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {companiesList
                  .filter((company) => company !== 'all')
                  .map((company) => (
                    <button
                      key={company}
                      onClick={() => void assignPendingMovement(company)}
                      disabled={isProcessing}
                      className="rounded-2xl border border-neutral-200 bg-white px-4 py-4 text-left font-medium text-neutral-900 transition-colors hover:bg-neutral-50 disabled:opacity-50"
                    >
                      {company}
                    </button>
                  ))}
                <button
                  onClick={() => void assignPendingMovement('Personal')}
                  disabled={isProcessing}
                  className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4 text-left font-medium text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-50"
                >
                  Sin empresa (Personal)
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setPendingItem(null)}
                disabled={isProcessing}
                className="rounded-2xl border border-neutral-200 px-4 py-3 text-neutral-700"
              >
                Cancelar registro
              </button>
            </div>
          </ModalShell>
        )}

        {confirmationModal && (
          <ModalShell
            title={confirmationModal.title}
            onClose={() => {
              if (isConfirmingAction) return;
              setConfirmationModal(null);
              setConfirmationInput('');
            }}
          >
            <div className="space-y-4">
              <div className={`rounded-2xl border px-4 py-4 text-sm ${
                confirmationModal.tone === 'danger'
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : 'border-neutral-200 bg-neutral-50 text-neutral-700'
              }`}>
                <p>{confirmationModal.description}</p>
                {confirmationModal.details ? <p className="mt-2 font-medium">{confirmationModal.details}</p> : null}
              </div>

              {confirmationModal.requireText ? (
                <input
                  value={confirmationInput}
                  onChange={(event) => setConfirmationInput(event.target.value)}
                  className="w-full rounded-2xl border border-neutral-200 px-4 py-3"
                  placeholder={`Escribí ${confirmationModal.requireText}`}
                />
              ) : null}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setConfirmationModal(null);
                  setConfirmationInput('');
                }}
                className="rounded-2xl border border-neutral-200 px-4 py-3 text-neutral-700"
                disabled={isConfirmingAction}
              >
                Cancelar
              </button>
              <button
                onClick={() => void runConfirmation()}
                disabled={isConfirmingAction}
                className={`rounded-2xl px-5 py-3 font-medium text-white ${
                  confirmationModal.tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-neutral-900 hover:bg-neutral-800'
                } disabled:opacity-60`}
              >
                {isConfirmingAction ? 'Confirmando...' : confirmationModal.confirmLabel}
              </button>
            </div>
          </ModalShell>
        )}

        <footer className="pt-12 pb-8 border-t border-neutral-100 text-center">
          <p className="text-xs text-neutral-400">Desarrollado para el mercado Argentino. Las conversiones de jerga son aproximadas y se basan en el uso común.</p>
        </footer>
      </div>
    </div>
  );
}
