import { Settings, ShieldCheck, type LucideIcon } from 'lucide-react';
import { BrandMark } from '../BrandMark';
import type { DashboardTab } from '../../DashboardApp';

/**
 * Desktop-only left rail (≥ lg). Holds the frequent destinations as a vertical
 * nav plus Configuración / Super Admin pinned to the bottom. Below lg it renders
 * nothing — the mobile bottom-nav + header own navigation there.
 *
 * Stateless: it only reflects `activeTab` and calls `onSelectTab`. No business
 * logic, so it can't drift from the existing tab behaviour.
 */
export interface DesktopSidebarProps {
  navItems: Array<{ id: DashboardTab; label: string; icon: LucideIcon }>;
  activeTab: DashboardTab;
  onSelectTab: (tab: DashboardTab) => void;
  isSuperadmin: boolean;
}

export function DesktopSidebar({ navItems, activeTab, onSelectTab, isSuperadmin }: DesktopSidebarProps) {
  const renderItem = (id: DashboardTab, label: string, Icon: LucideIcon) => {
    const isActive = activeTab === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => onSelectTab(id)}
        aria-current={isActive ? 'page' : undefined}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors duration-150 ${
          isActive
            ? 'bg-[var(--app-strong-surface)] text-[var(--app-strong-text)] shadow-[var(--app-shadow-sm)]'
            : 'text-[var(--app-text-2)] hover:bg-[var(--app-surface-2)] hover:text-[var(--app-text-1)]'
        }`}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </button>
    );
  };

  return (
    <aside className="hidden lg:flex lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col gap-1 border-r border-[var(--app-border)] bg-[var(--app-sidebar)] px-3 py-5">
      <div className="flex items-center gap-2 px-2 pb-4">
        <BrandMark variant="badge" />
        <span className="text-[15px] font-bold tracking-tight text-[var(--app-text-1)]">Caja Chica</span>
      </div>
      <nav className="flex flex-col gap-1" aria-label="Secciones del dashboard">
        {navItems.map((item) => renderItem(item.id, item.label, item.icon))}
      </nav>
      <div className="flex-1" />
      <div className="flex flex-col gap-1 border-t border-[var(--app-border)] pt-3">
        {renderItem('configuracion', 'Configuración', Settings)}
        {isSuperadmin && renderItem('superadmin', 'Super Admin', ShieldCheck)}
      </div>
    </aside>
  );
}
