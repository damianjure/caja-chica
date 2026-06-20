import { useEffect, useState } from "react";
import { HardDriveUpload, Unlink } from "lucide-react";
import { toast } from "sonner";
import { api, type DriveStatus } from "../../../../services/api";

/**
 * Conexión a Google Drive (movida de InformesTab a Config — C-completo).
 * Self-fetch del estado + manejo del callback OAuth. Si Drive no está configurado
 * en el server (enabled=false), no muestra nada.
 */
export function DriveSection() {
  const [status, setStatus] = useState<DriveStatus>({ connected: false, enabled: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.getDriveStatus()
      .then((s) => { if (active) setStatus(s); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("driveConnected") === "true") {
      setStatus({ connected: true, enabled: true });
      window.history.replaceState({}, "", window.location.pathname);
      toast.success("Google Drive conectado.");
    }
    if (params.get("driveError")) {
      toast.error("No se pudo conectar Drive.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const connect = async () => {
    try {
      const { url } = await api.getDriveAuthUrl();
      window.location.href = url;
    } catch {
      toast.error("No se pudo iniciar la conexión con Drive.");
    }
  };

  const disconnect = async () => {
    try {
      await api.disconnectDrive();
      setStatus((p) => ({ ...p, connected: false }));
      toast.success("Drive desconectado.");
    } catch {
      toast.error("No se pudo desconectar Drive.");
    }
  };

  if (loading || !status.enabled) return null;

  return (
    <div className="space-y-3 border-t border-[var(--app-border)] pt-5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-md bg-[var(--app-strong-surface)] text-[var(--app-strong-text)]">
          <HardDriveUpload className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-base font-bold tracking-tight text-[var(--app-text-1)]">Google Drive</h3>
          <p className="text-sm text-[var(--app-text-3)]">
            {status.connected
              ? "Conectado. Desde Movimientos → Exportar guardás informes en Drive."
              : "Conectá tu cuenta para guardar informes directamente en Drive."}
          </p>
        </div>
      </div>
      {status.connected ? (
        <button
          onClick={() => void disconnect()}
          className="inline-flex items-center gap-2 rounded-md border border-[var(--app-red-border)] bg-[var(--app-surface-1)] px-4 py-2 text-sm font-medium text-[var(--chart-expense)] transition hover:border-red-400"
        >
          <Unlink className="h-4 w-4" />
          Desconectar Drive
        </button>
      ) : (
        <button
          onClick={() => void connect()}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--app-strong-surface)] px-4 py-2 text-sm font-medium text-[var(--app-strong-text)] transition active:scale-[0.97]"
        >
          <HardDriveUpload className="h-4 w-4" />
          Conectar Google Drive
        </button>
      )}
    </div>
  );
}
