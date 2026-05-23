import { useState, useEffect, useRef, type Dispatch, type SetStateAction, type MutableRefObject } from 'react';
import { api, type Movimiento, type Empresa, type Categoria, type Presupuesto, type DashboardMembersResponse, type AppViewer } from '../../services/api';
import { supabase } from '../../services/supabase';
import { getCurrentPeriod } from '../../dashboard/summary';

function normalizeMovement(item: Movimiento): Movimiento {
  return { ...item, conciliado: item.conciliado ?? true };
}

export interface DashboardDataResult {
  history: Movimiento[];
  setHistory: Dispatch<SetStateAction<Movimiento[]>>;
  customCompanies: Empresa[];
  setCustomCompanies: Dispatch<SetStateAction<Empresa[]>>;
  categories: Categoria[];
  setCategories: Dispatch<SetStateAction<Categoria[]>>;
  budgets: Presupuesto[];
  setBudgets: Dispatch<SetStateAction<Presupuesto[]>>;
  budgetPeriod: string;
  setBudgetPeriod: Dispatch<SetStateAction<string>>;
  dashboardAccess: DashboardMembersResponse | null;
  setDashboardAccess: Dispatch<SetStateAction<DashboardMembersResponse | null>>;
  isLoading: boolean;
  isLoadingCollaboration: boolean;
  isLoadingBudget: boolean;
  setIsLoadingBudget: Dispatch<SetStateAction<boolean>>;
  hasMore: boolean;
  loadingMore: boolean;
  apiStatus: 'ready' | 'missing_url' | 'load_error';
  apiErrorMessage: string | null;
  nextCursorRef: MutableRefObject<string | null>;
  loadData: (append?: boolean) => Promise<void>;
  loadCollaboration: () => Promise<void>;
  loadBudgets: (period: string) => Promise<void>;
}

export function useDashboardData(viewer: AppViewer): DashboardDataResult {
  const initialBudgetPeriod = getCurrentPeriod();
  const [history, setHistory] = useState<Movimiento[]>([]);
  const [customCompanies, setCustomCompanies] = useState<Empresa[]>([]);
  const [categories, setCategories] = useState<Categoria[]>([]);
  const [budgets, setBudgets] = useState<Presupuesto[]>([]);
  const [budgetPeriod, setBudgetPeriod] = useState(initialBudgetPeriod);
  const [dashboardAccess, setDashboardAccess] = useState<DashboardMembersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingCollaboration, setIsLoadingCollaboration] = useState(true);
  const [isLoadingBudget, setIsLoadingBudget] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [apiStatus, setApiStatus] = useState<'ready' | 'missing_url' | 'load_error'>('ready');
  const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);
  const nextCursorRef = useRef<string | null>(null);

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

      if (append) {
        setHistory((prev) => [...prev, ...normalizedItems]);
      } else {
        setHistory(normalizedItems);
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

  return {
    history,
    setHistory,
    customCompanies,
    setCustomCompanies,
    categories,
    setCategories,
    budgets,
    setBudgets,
    budgetPeriod,
    setBudgetPeriod,
    dashboardAccess,
    setDashboardAccess,
    isLoading,
    isLoadingCollaboration,
    isLoadingBudget,
    setIsLoadingBudget,
    hasMore,
    loadingMore,
    apiStatus,
    apiErrorMessage,
    nextCursorRef,
    loadData,
    loadCollaboration,
    loadBudgets,
  };
}
