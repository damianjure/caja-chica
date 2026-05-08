import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { toast, Toaster } from "sonner";

import DashboardApp from "./DashboardApp";
import { buildGoogleAuthRedirect, getInviteTokenFromUrl } from "./authRedirect";
import { AppLoadingScreen } from "./components/AppLoadingScreen";
import { LoginScreen } from "./components/LoginScreen";
import type { ThemeMode } from "./components/ThemeToggle";
import { api, AppViewer } from "./services/api";
import { supabase } from "./services/supabase";

const THEME_STORAGE_KEY = "cajachica-theme";

function resolveInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [viewer, setViewer] = useState<AppViewer | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(resolveInitialTheme);
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
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

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
    setViewer(null);
    setSession(null);
    setAuthLoading(false);
  };

  const handleToggleTheme = () => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
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
      <DashboardApp viewer={viewer} onSignOut={handleSignOut} theme={theme} onToggleTheme={handleToggleTheme} />
    </>
  );
}
