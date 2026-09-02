import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch, ApiError, configureAuthHandlers } from "@/services/apiClient";

const TOKEN_KEY = "mobile_auth_token";

export type Membership = { leagueId: string; role: string; leagueName: string };
export type MobileUser = {
  id: string;
  name: string;
  isSiteAdmin: boolean;
  email: string | null;
  phone: string | null;
  memberships: Membership[];
};

type LoginResponse = { token: string };

type AuthState = {
  token: string | null;
  user: MobileUser | null;
  isLoading: boolean;
  login: (loginId: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<MobileUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  // Wires the plain-function API client (no React context access of its own)
  // to this provider — any 401/403 from ANY request forces the same logout
  // path a manual tap takes, and the root layout's Stack.Protected reacts to
  // `token` going null automatically.
  //
  // Deliberately called during render, NOT inside a useEffect: React runs a
  // newly-mounted child's effects (e.g. a screen's first data fetch) BEFORE
  // an ancestor's own effect that only just changed dependencies. Right
  // after login, Stack.Protected mounts the authenticated screen in the same
  // commit that updates `token` here — if this sync happened in an effect,
  // that screen's very first request would fire with the still-stale (null)
  // token a beat before this effect got a chance to run, taking a real,
  // reproduced 403 that immediately logged the session right back out.
  // Syncing here instead runs synchronously as part of this render, so it's
  // always current before any child can mount or query anything.
  configureAuthHandlers({ getToken: () => token, onUnauthorized: logout });

  useEffect(() => {
    (async () => {
      const stored = await SecureStore.getItemAsync(TOKEN_KEY);
      if (stored) {
        setToken(stored);
        try {
          setUser(await apiFetch<MobileUser>("/api/mobile/me"));
        } catch {
          // Stored token rejected server-side (e.g. secret rotated, or the
          // account/membership was disabled) — clear it rather than getting
          // stuck showing a broken session.
          await SecureStore.deleteItemAsync(TOKEN_KEY);
          setToken(null);
        }
      }
      setIsLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (loginId: string, password: string) => {
    try {
      const res = await apiFetch<LoginResponse>("/api/mobile/auth/login", {
        method: "POST",
        body: JSON.stringify({ loginId, password }),
        skipAuth: true,
      });
      // Explicit header override (not just skipAuth) since `token` state
      // hasn't re-rendered yet at this point in the function — handlers
      // .getToken() would still return the old (null) value.
      const me = await apiFetch<MobileUser>("/api/mobile/me", {
        headers: { Authorization: `Bearer ${res.token}` },
      });
      await SecureStore.setItemAsync(TOKEN_KEY, res.token);
      setToken(res.token);
      setUser(me);
      return {};
    } catch (e) {
      if (e instanceof ApiError) return { error: e.message };
      if (e instanceof Error) return { error: `${e.name}: ${e.message}` };
      return { error: "Something went wrong" };
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      setUser(await apiFetch<MobileUser>("/api/mobile/me"));
    } catch {
      // Best-effort — the screen that triggered this already knows whether
      // its own save request succeeded; a refresh hiccup shouldn't surface
      // as a separate error.
    }
  }, []);

  const value = useMemo(
    () => ({ token, user, isLoading, login, logout, refreshUser }),
    [token, user, isLoading, login, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
