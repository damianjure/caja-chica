import { useState, useMemo } from "react";
import { type AppViewer, type DashboardMembersResponse } from "../../../services/api";
import type { Empresa } from "../../../services/api";
import { type ThemePreference } from "../../ThemeToggle";
import { PreferenciasSection } from "./configuracion/PreferenciasSection";
import { MiembrosSection } from "./configuracion/MiembrosSection";
import { CuentaSection } from "./configuracion/CuentaSection";
import { CategoriasSection } from "./configuracion/CategoriasSection";
import { DriveSection } from "./configuracion/DriveSection";
import { BotConnectionPanel } from "../../BotConnectionPanel";

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

  const isNonOwnerMember = selfMembership !== null && selfMembership.role !== "owner";

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  return (
    <div className="stack-relaxed">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>
      )}

      <PreferenciasSection
        viewer={viewer}
        companies={companies}
        themePreference={themePreference}
        onSetThemePreference={onSetThemePreference}
        showNotice={showNotice}
        setError={setError}
      />

      {canManage && (
        <>
          <MiembrosSection
            viewer={viewer}
            data={data}
            loading={loading}
            onRefresh={onRefresh}
            showNotice={showNotice}
            setError={setError}
          />
          <CategoriasSection />
          {canConnectDrive && <DriveSection />}
          <BotConnectionPanel />
        </>
      )}

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
