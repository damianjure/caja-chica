import { useState, useMemo } from "react";
import { type AppViewer, type DashboardMembersResponse } from "../../../services/api";
import type { Empresa } from "../../../services/api";
import { type ThemePreference } from "../../ThemeToggle";
import { PreferenciasSection } from "./configuracion/PreferenciasSection";
import { MiembrosSection } from "./configuracion/MiembrosSection";
import { CuentaSection } from "./configuracion/CuentaSection";
import { CuentaIdentidadSection } from "./configuracion/CuentaIdentidadSection";
import { CategoriasSection } from "./configuracion/CategoriasSection";
import { DriveSection } from "./configuracion/DriveSection";
import { BotConnectionPanel } from "../../BotConnectionPanel";
import { SectionCard } from "../primitives";

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

  return (
    <div className="stack-relaxed">
      {error && (
        <div className="rounded-xl border border-[var(--app-red-border)] bg-[var(--app-red-surface)] px-4 py-3 text-sm text-[var(--chart-expense)]">{error}</div>
      )}
      {notice && (
        <div className="rounded-xl border border-[var(--app-green-border)] bg-[var(--app-green-surface)] px-4 py-3 text-sm text-[var(--chart-income)]">{notice}</div>
      )}

      {/*
        Layout fila superior: 2 columnas explícitas
        Col izq: Equipo → Cuenta (identidad) → Sesiones activas
        Col der: Preferencias
      */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {/* Columna izquierda */}
        <div className="space-y-6">
          {canManage && (
            <MiembrosSection
              viewer={viewer}
              data={data}
              loading={loading}
              onRefresh={onRefresh}
              showNotice={showNotice}
              setError={setError}
            />
          )}

          <CuentaIdentidadSection
            viewer={viewer}
            selfMembership={selfMembership}
            showNotice={showNotice}
            setError={setError}
            onDemoDeleted={onDemoDeleted}
          />
        </div>

        {/* Columna derecha */}
        <div className="space-y-6">
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
        </div>
      </div>

      {/* Fila inferior: Categorías + Vinculación (ya estaba bien) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {canManageCategorias && <CategoriasSection />}

        {canManage && (
          <SectionCard title="Vinculación" description="Conectá Telegram y Google Drive a tu cuenta.">
            <BotConnectionPanel />
            {canConnectDrive && <DriveSection />}
          </SectionCard>
        )}
      </div>

      {/* Acceso y datos: full-width */}
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
    </div>
  );
}
