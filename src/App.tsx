import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { toast, Toaster } from "sonner";

import DashboardApp from "./DashboardApp";
import { buildGoogleAuthRedirect, getInviteTokenFromUrl } from "./authRedirect";
import { AppLoadingScreen } from "./components/AppLoadingScreen";
import { LoginScreen } from "./components/LoginScreen";
import { BiometricGate } from "./components/BiometricGate";
import type { ThemeMode, ThemePreference } from "./components/ThemeToggle";
import { readLightPalette, readDarkPalette, storeLightPalette, storeDarkPalette, applyPalette } from "./theme/palettes";
import { api, AppViewer } from "./services/api";
import { supabase } from "./services/supabase";

const THEME_STORAGE_KEY = "cajachica-theme";

function resolvePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark" || saved === "system") return saved;
  return "system";
}

function preferenceToTheme(pref: ThemePreference): ThemeMode {
  if (pref === "system") {
    return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return pref;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [viewer, setViewer] = useState<AppViewer | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(resolvePreference);
  const [theme, setTheme] = useState<ThemeMode>(() => preferenceToTheme(resolvePreference()));
  const queryClient = useQueryClient();

  const inviteToken = useMemo(
    () => (typeof window === "undefined" ? null : getInviteTokenFromUrl(new URL(window.location.href))),
    [],
  );

  const isConfigured = useMemo(() => Boolean(supabase), []);

  useEffect(() => {
    if (inviteToken) {
      toast("Tenés una invitación pendiente. Entrá con el mail invitado para sumarte al dashboard.", {
        duration: 8000,
      });
    }
  }, [inviteToken]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    const applied = preferenceToTheme(themePreference);
    setTheme(applied);
    document.documentElement.dataset.theme = applied;
    document.documentElement.style.colorScheme = applied;

    if (themePreference !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const t: ThemeMode = e.matches ? "dark" : "light";
      setTheme(t);
      document.documentElement.dataset.theme = t;
      document.documentElement.style.colorScheme = t;
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [themePreference]);

  const setThemePreference = (pref: ThemePreference) => {
    setThemePreferenceState(pref);
  };

  const [lightPalette, setLightPaletteState] = useState<string>(readLightPalette);
  const [darkPalette, setDarkPaletteState] = useState<string>(readDarkPalette);
  // Aplica la paleta del modo activo cada vez que cambia el modo o una elección.
  useEffect(() => { applyPalette(theme, lightPalette, darkPalette); }, [theme, lightPalette, darkPalette]);
  const setLightPalette = (id: string) => { setLightPaletteState(id); storeLightPalette(id); };
  const setDarkPalette = (id: string) => { setDarkPaletteState(id); storeDarkPalette(id); };

  const loadViewer = async () => {
    try {
      const me = await api.getMe();
      setViewer(me);
    } catch (err) {
      setViewer(null);
      if (api.isApiError(err) && err.status === 403) {
        toast.error("Tu cuenta autenticada no está autorizada para usar la aplicación.");
      } else if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error("No se pudo validar tu acceso.");
      }
    }
  };

  useEffect(() => {
    if (!supabase) {
      setLoadingSession(false);
      toast.error("Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para iniciar sesión.");
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session) {
        await loadViewer();
      }
      setLoadingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoadingSession(false);
      if (nextSession) {
        void loadViewer();
      } else {
        setViewer(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogin = async () => {
    if (!supabase) return;
    setAuthLoading(true);
    try {
      const redirectTo = buildGoogleAuthRedirect(new URL(window.location.href));
      const { error: loginError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            prompt: "select_account",
          },
        },
      });
      if (loginError) throw loginError;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo iniciar sesión con Google.");
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    // Clear per-user UI state and cached financial data so the next user
    // does not inherit it (React Query stays mounted above auth).
    queryClient.clear();
    try {
      window.localStorage.removeItem('caja-chica:activeTab');
    } catch {
      /* ignore */
    }
    setViewer(null);
    setSession(null);
    setAuthLoading(false);
  };

  const handleToggleTheme = () => {
    setThemePreference(theme === "dark" ? "light" : "dark");
  };

  if (loadingSession) {
    return <AppLoadingScreen theme={theme} onToggleTheme={handleToggleTheme} />;
  }

  if (!isConfigured) {
    return (
      <>
        <Toaster position="bottom-center" />
        <LoginScreen
          isLoading={false}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onLogin={() => Promise.resolve()}
        />
      </>
    );
  }

  if (!session || !viewer) {
    return (
      <>
        <Toaster position="bottom-center" />
        <LoginScreen
          isLoading={authLoading}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          blocked={!!session}
          buttonLabel={session ? "Reintentar acceso con Google" : "Entrar con Google"}
          secondaryActionLabel={session ? "Salir y usar otra cuenta" : undefined}
          onSecondaryAction={session ? handleSignOut : undefined}
          onLogin={handleLogin}
        />
      </>
    );
  }

  return (
    <>
      <Toaster position="top-center" />
      <BiometricGate userId={viewer.id} theme={theme} onToggleTheme={handleToggleTheme} onSignOut={() => void handleSignOut()}>
        <DashboardApp
          viewer={viewer}
          onSignOut={handleSignOut}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          themePreference={themePreference}
          onSetThemePreference={setThemePreference}
          lightPalette={lightPalette}
          darkPalette={darkPalette}
          onSetLightPalette={setLightPalette}
          onSetDarkPalette={setDarkPalette}
        />
      </BiometricGate>
    </>
  );
}
