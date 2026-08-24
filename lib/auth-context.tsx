import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { mobileApi, type AuthPayload, type MobileUser } from "./mobile-api";

const SESSION_KEY = "ketnoi.mobile.session.v1";

type AuthContextValue = {
  token: string | null;
  user: MobileUser | null;
  loading: boolean;
  signIn: (username: string, password: string, remember?: boolean) => Promise<void>;
  register: (username: string, displayName: string, password: string, email?: string, remember?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<MobileUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(SESSION_KEY)
      .then((stored) => {
        if (!stored) return;
        const payload = JSON.parse(stored) as AuthPayload;
        setToken(payload.token);
        setUser(payload.user);
      })
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async (payload: AuthPayload, remember = true) => {
    setToken(payload.token);
    setUser(payload.user);
    if (remember) await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    else await AsyncStorage.removeItem(SESSION_KEY);
  }, []);

  const signIn = useCallback(async (username: string, password: string, remember = true) => save(await mobileApi.login(username.trim(), password), remember), [save]);
  const register = useCallback(async (username: string, displayName: string, password: string, email?: string, remember = true) => save(await mobileApi.register(username.trim(), displayName.trim(), password, email?.trim()), remember), [save]);
  const signOut = useCallback(async () => { setToken(null); setUser(null); await AsyncStorage.removeItem(SESSION_KEY); }, []);

  const value = useMemo(() => ({ token, user, loading, signIn, register, signOut }), [loading, register, signIn, signOut, token, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useMobileAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useMobileAuth must be used inside AuthProvider");
  return context;
}
