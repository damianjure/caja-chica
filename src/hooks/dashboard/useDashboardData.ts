import { useEffect } from 'react';
import {
  useQuery,
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { api, type Movimiento, type Empresa, type Categoria, type DashboardMembersResponse, type PaginatedMovimientos, type AppViewer } from '../../services/api';
import { supabase } from '../../services/supabase';

function normalizeMovement(item: Movimiento): Movimiento {
  return { ...item, conciliado: item.conciliado ?? true };
}

function isApiUrlMissing(): boolean {
  const url = (import.meta as any).env.VITE_API_URL;
  return !url || url.includes('placeholder');
}

export interface DashboardDataResult {
  history: Movimiento[];
  customCompanies: Empresa[];
  categories: Categoria[];
  dashboardAccess: DashboardMembersResponse | null;
  isLoading: boolean;
  isLoadingCollaboration: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  apiStatus: 'ready' | 'missing_url' | 'load_error';
  apiErrorMessage: string | null;
  loadData: (append?: boolean) => void;
  loadCollaboration: () => void;
}

export function useDashboardData(viewer: AppViewer): DashboardDataResult {
  const queryClient = useQueryClient();
  const apiMissing = isApiUrlMissing();

  // --- dashboardAccess ---
  const collaborationQuery = useQuery<DashboardMembersResponse>({
    queryKey: ['dashboardMembers'],
    queryFn: api.getDashboardMembers,
    enabled: !apiMissing,
  });

  // --- empresas ---
  const empresasQuery = useQuery<Empresa[]>({
    queryKey: ['empresas'],
    queryFn: api.getEmpresas,
    enabled: !apiMissing,
  });

  // --- categorias ---
  const categoriasQuery = useQuery<Categoria[]>({
    queryKey: ['categorias'],
    queryFn: api.getCategorias,
    enabled: !apiMissing,
  });

  // --- movimientos (infinite) ---
  const movimientosQuery = useInfiniteQuery<
    PaginatedMovimientos,
    Error,
    InfiniteData<PaginatedMovimientos>,
    readonly ['movimientos'],
    string | null
  >({
    queryKey: ['movimientos'] as const,
    queryFn: ({ pageParam }) => api.getMovimientos(50, pageParam),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !apiMissing,
  });

  const history = movimientosQuery.data?.pages.flatMap((p) => p.items.map(normalizeMovement)) ?? [];

  // --- realtime channel ---
  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel('realtime-movimientos')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'movimientos' }, (payload) => {
        const newMov = normalizeMovement(payload.new as Movimiento);
        queryClient.setQueryData<InfiniteData<PaginatedMovimientos>>(
          ['movimientos'],
          (old) => {
            if (!old) return old;
            const firstPage = old.pages[0];
            if (firstPage.items.some((i) => i.id === newMov.id)) return old;
            const updatedFirstPage = { ...firstPage, items: [newMov, ...firstPage.items] };
            return { ...old, pages: [updatedFirstPage, ...old.pages.slice(1)] };
          },
        );
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'movimientos' }, (payload) => {
        const deletedId = (payload.old as { id: string }).id;
        queryClient.setQueryData<InfiniteData<PaginatedMovimientos>>(
          ['movimientos'],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                items: page.items.filter((i) => i.id !== deletedId),
              })),
            };
          },
        );
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'empresas' }, (payload) => {
        const newEmp = payload.new as Empresa;
        queryClient.setQueryData<Empresa[]>(['empresas'], (prev = []) =>
          prev.some((i) => i.id === newEmp.id) ? prev : [...prev, newEmp],
        );
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'categorias' }, (payload) => {
        const newCat = payload.new as Categoria;
        queryClient.setQueryData<Categoria[]>(['categorias'], (prev = []) =>
          prev.some((i) => i.id === newCat.id) ? prev : [...prev, newCat],
        );
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Re-fetch when viewer changes
  useEffect(() => {
    if (apiMissing) return;
    void queryClient.invalidateQueries({ queryKey: ['movimientos'] });
    void queryClient.invalidateQueries({ queryKey: ['empresas'] });
    void queryClient.invalidateQueries({ queryKey: ['categorias'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboardMembers'] });
  }, [viewer.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- apiStatus derivation ---
  const hasQueryError =
    movimientosQuery.isError || empresasQuery.isError || categoriasQuery.isError;
  const queryError =
    movimientosQuery.error ?? empresasQuery.error ?? categoriasQuery.error;

  const apiStatus: 'ready' | 'missing_url' | 'load_error' = apiMissing
    ? 'missing_url'
    : hasQueryError
    ? 'load_error'
    : 'ready';

  const apiErrorMessage: string | null =
    apiStatus === 'load_error'
      ? queryError instanceof Error
        ? queryError.message
        : 'No se pudo cargar la información del dashboard.'
      : null;

  // --- thin wrappers ---
  const loadData = (append = false) => {
    if (append) {
      void movimientosQuery.fetchNextPage();
    } else {
      void movimientosQuery.refetch();
    }
  };

  const loadCollaboration = () => {
    void collaborationQuery.refetch();
  };

  const isLoading =
    movimientosQuery.isLoading ||
    empresasQuery.isLoading ||
    categoriasQuery.isLoading;

  return {
    history,
    customCompanies: empresasQuery.data ?? [],
    categories: categoriasQuery.data ?? [],
    dashboardAccess: collaborationQuery.data ?? null,
    isLoading,
    isLoadingCollaboration: collaborationQuery.isLoading,
    hasMore: movimientosQuery.hasNextPage ?? false,
    loadingMore: movimientosQuery.isFetchingNextPage,
    apiStatus,
    apiErrorMessage,
    loadData,
    loadCollaboration,
  };
}
