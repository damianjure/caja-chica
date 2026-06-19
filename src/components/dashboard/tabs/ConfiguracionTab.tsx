import { useState, useMemo, type ComponentType } from "react";
import { User, SlidersHorizontal, Users, Tag, Plug, ShieldCheck } from "lucide-react";
import { type AppViewer, type DashboardMembersResponse } from "../../../services/api";
import type { Empresa } from "../../../services/api";
import { type ThemePreference } from "../../ThemeToggle";
import { PreferenciasSection } from "./configuracion/PreferenciasSection";
import { MiembrosSection } from "./configuracion/MiembrosSection";
import { CuentaSection } from "./configuracion/CuentaSection";
import { CuentaIdentidadSection } from "./configuracion/CuentaIdentidadSection";
import { CategoriasSection } from "./configuracion/CategoriasSection";
import { DriveSection } from "./configuracion/DriveSection";
import { SectionCard } from "../primitives";

type SectionId = "perfil" | "preferencias" | "equipo" | "categorias" | "integraciones" | "seguridad";

interface ConfiguracionTabProps {
  viewer: AppViewer;
  data: DashboardMembersResponse | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
  canConnectDrive: boolean;
  onSignOut: () => Promise<void> | void;
  onDisconnectDrive?: () => Promise<void>;
  companies: Empresa[];
  themePreference: ThemePreference;
  onSetThemePreference: (p: ThemePreference) => void;
  lightPalette: string;
  darkPalette: string;
  onSetLightPalette: (id: string) => void;
  onSetDarkPalette: (id: string) => void;
  onDemoDeleted?: () => void;
}

export default function ConfiguracionTab({
  viewer,
  data,
  loading,
  onRefresh,
  canConnectDrive,
  onSignOut,
  onDisconnectDrive,
  companies,
  themePreference,
  onSetThemePreference,
  lightPalette,
  darkPalette,
  onSetLightPalette,
  onSetDarkPalette,
  onDemoDeleted,
}: ConfiguracionTabProps) {
  const [activeSection, setActiveSection] = useState<SectionId>("perfil");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selfMembership = useMemo(
    () => data?.members.find((m) => m.user_id === viewer.id) ?? null,
    [data, viewer.id],
  );

  const canManage =
    viewer.role === "admin" ||
    viewer.role === "superadmin" ||
    selfMembership?.role === "owner";

  const canManageCategorias =
    canManage ||
    (selfMembership?.role === "editor" &&
      (selfMembership?.permissions as { manage_categorias?: boolean } | undefined)?.manage_categorias !== false);

  const isNonOwnerMember = selfMembership !== null && selfMembership.role !== "owner";

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  const ALL_SECTIONS: { id: SectionId; label: string; icon: ComponentType<{ className?: string }>; visible: boolean }[] = [
    { id: "perfil",         label: "Perfil",             icon: User,              visible: true },
    { id: "preferencias",   label: "Preferencias",       icon: SlidersHorizontal, visible: true },
    { id: "equipo",         label: "Equipo y permisos",  icon: Users,             visible: canManage },
    { id: "categorias",     label: "Categorías",         icon: Tag,               visible: canManageCategorias },
    { id: "integraciones",  label: "Integraciones",      icon: Plug,              visible: canManage && canConnectDrive },
    { id: "seguridad",      label: "Seguridad y datos",  icon: ShieldCheck,       visible: true },
  ];

  const sections = ALL_SECTIONS.filter((s) => s.visible);

  const activeId = sections.some((s) => s.id === activeSection) ? activeSection : sections[0]?.id ?? "perfil";

  const sectionContent = (id: SectionId) => {
    switch (id) {
      case "perfil":
        return (
          <CuentaIdentidadSection
            viewer={viewer}
            selfMembership={selfMembership}
            showNotice={showNotice}
            setError={setError}
            onDemoDeleted={onDemoDeleted}
          />
        );
      case "preferencias":
        return (
          <PreferenciasSection
            viewer={viewer}
            companies={companies}
            themePreference={themePreference}
            onSetThemePreference={onSetThemePreference}
            lightPalette={lightPalette}
            darkPalette={darkPalette}
            onSetLightPalette={onSetLightPalette}
            onSetDarkPalette={onSetDarkPalette}
            showNotice={showNotice}
            setError={setError}
          />
        );
      case "equipo":
        return (
          <MiembrosSection
            viewer={viewer}
            data={data}
            loading={loading}
            onRefresh={onRefresh}
            showNotice={showNotice}
            setError={setError}
          />
        );
      case "categorias":
        return <CategoriasSection />;
      case "integraciones":
        return (
          <SectionCard title="Google Drive" description="Conectá Google Drive para guardar tus informes.">
            <DriveSection />
          </SectionCard>
        );
      case "seguridad":
        return (
          <CuentaSection
            viewer={viewer}
            selfMembership={selfMembership}
            isNonOwnerMember={isNonOwnerMember}
            canConnectDrive={canConnectDrive}
            onSignOut={onSignOut}
            onDisconnectDrive={onDisconnectDrive}
            showNotice={showNotice}
            setError={setError}
          />
        );
    }
  };

  const navItemClass = (id: SectionId) =>
    `flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
      activeId === id
        ? "bg-[var(--app-surface-2)] text-[var(--app-text-1)] font-medium"
        : "text-[var(--app-text-2)] hover:bg-[var(--app-surface-2)] hover:text-[var(--app-text-1)]"
    }`;

  const pillClass = (id: SectionId) =>
    `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors shrink-0 ${
      activeId === id
        ? "bg-[var(--app-surface-2)] text-[var(--app-text-1)]"
        : "text-[var(--app-text-2)] hover:text-[var(--app-text-1)]"
    }`;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-[var(--app-red-border)] bg-[var(--app-red-surface)] px-4 py-3 text-sm text-[var(--chart-expense)]">{error}</div>
      )}
      {notice && (
        <div className="rounded-xl border border-[var(--app-green-border)] bg-[var(--app-green-surface)] px-4 py-3 text-sm text-[var(--chart-income)]">{notice}</div>
      )}

      {/* Mobile: horizontal pill bar */}
      <div className="flex overflow-x-auto gap-1 pb-1 -mx-1 px-1 lg:hidden">
        {sections.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setActiveSection(id)} className={pillClass(id)}>
            <Icon className="w-3.5 h-3.5 shrink-0" />
            {label}
          </button>
        ))}
      </div>

      {/* Mobile: active section */}
      <div className="lg:hidden">
        {sectionContent(activeId)}
      </div>

      {/* Desktop: sticky left nav + content */}
      <div className="hidden lg:flex gap-8 items-start">
        <nav className="w-48 shrink-0 sticky top-4 space-y-0.5">
          {sections.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setActiveSection(id)} className={navItemClass(id)}>
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </button>
          ))}
        </nav>
        <div className="flex-1 min-w-0">
          {sectionContent(activeId)}
        </div>
      </div>
    </div>
  );
}
