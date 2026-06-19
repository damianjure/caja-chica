import { RefreshCw, Search } from 'lucide-react';
import { HeaderUserMenu } from './HeaderUserMenu';
import type { ThemeMode } from '../ThemeToggle';

/**
 * Desktop-only top bar (≥ lg). Pairs the active-section title with the global
 * actions that used to live in the mobile header (refresh, ⌘K search, Nueva
 * operación) plus the account menu. Below lg it renders nothing.
 *
 * Stateless wiring only — every handler is owned by DashboardApp.
 */
export interface DesktopTopbarProps {
  sectionTitle: string;
  sectionDescription?: string;
  onRefresh: () => void;
  isRefreshing: boolean;
  lastRefreshed: number | null;
  onOpenSearch: () => void;
  /** Show the "Nueva operación" CTA. False on Configuración / Super Admin. */
  showNewOperation: boolean;
  onNewOperation: () => void;
  // Account menu passthrough
  email: string;
  identityLabel: string;
  photoUrl?: string | null;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onSignOut: () => void;
  onOpenSettings: () => void;
  onOpenAdmin?: () => void;
  onOpenHelp: () => void;
  onReplayTour: () => void;
  onInstallApp?: () => void;
}

export function DesktopTopbar({
  sectionTitle,
  sectionDescription,
  onRefresh,
  isRefreshing,
  lastRefreshed,
  onOpenSearch,
  showNewOperation,
  onNewOperation,
  email,
  identityLabel,
  photoUrl,
  theme,
  onToggleTheme,
  onSignOut,
  onOpenSettings,
  onOpenAdmin,
  onOpenHelp,
  onReplayTour,
  onInstallApp,
}: DesktopTopbarProps) {
  const refreshedLabel = lastRefreshed
    ? new Date(lastRefreshed).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <header className="hidden lg:block sticky top-0 z-30 border-b border-[var(--app-border)] bg-[var(--app-surface-1)]/95 backdrop-blur-md">
      <div className="flex items-center gap-4 px-8 py-3.5">
        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight text-[var(--app-text-1)] truncate">{sectionTitle}</h1>
          {sectionDescription && (
            <p className="text-xs text-[var(--app-text-3)] truncate">{sectionDescription}</p>
          )}
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="Actualizar datos"
          title={refreshedLabel ? `Actualizado ${refreshedLabel}` : 'Actualizar datos'}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[var(--app-border)] bg-[var(--app-surface-1)] text-xs text-[var(--app-text-2)] hover:border-[var(--app-border-strong)] transition-colors duration-150 disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          {refreshedLabel && <span className="tabular-nums">{refreshedLabel}</span>}
        </button>
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Búsqueda global (⌘K)"
          title="Búsqueda global"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[var(--app-border)] bg-[var(--app-surface-1)] text-sm text-[var(--app-text-2)] hover:border-[var(--app-border-strong)] transition-colors duration-150"
        >
          <Search className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Buscar</span>
          <kbd className="font-mono">⌘K</kbd>
        </button>
        {showNewOperation && (
          <button
            type="button"
            onClick={onNewOperation}
            aria-label="Nueva operación"
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--app-strong-surface)] bg-[var(--app-strong-surface)] px-3 py-1.5 text-sm font-bold text-[var(--app-strong-text)] active:scale-[0.97]"
          >
            <span aria-hidden="true">＋</span><span>Nueva operación</span>
          </button>
        )}
        <HeaderUserMenu
          email={email}
          identityLabel={identityLabel}
          photoUrl={photoUrl}
          theme={theme}
          onToggleTheme={onToggleTheme}
          onSignOut={onSignOut}
          onOpenSettings={onOpenSettings}
          onOpenAdmin={onOpenAdmin}
          onOpenHelp={onOpenHelp}
          onReplayTour={onReplayTour}
          onInstallApp={onInstallApp}
        />
      </div>
    </header>
  );
}
