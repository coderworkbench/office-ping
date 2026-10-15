'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiFetch, login as apiLogin, logout as apiLogout, getAccessToken } from './api';
import { getDeviceId, detectBrowser } from './device';

export type User = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: 'ADMIN' | 'HR' | 'MEMBER';
  department: string;
  designation: string;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signIn: (u: string, p: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<AuthState>({
  user: null, loading: true,
  signIn: async () => {}, signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadMe() {
    if (!getAccessToken()) { setUser(null); setLoading(false); return; }
    try {
      const me = await apiFetch<User>('/api/me/');
      setUser(me);
      await registerDevice();
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function registerDevice() {
    const { browser, os } = detectBrowser();
    try {
      await apiFetch('/api/devices/', {
        method: 'POST',
        body: JSON.stringify({ device_id: getDeviceId(), browser, os }),
      });
    } catch {}
  }

  useEffect(() => { loadMe(); }, []);

  async function signIn(username: string, password: string) {
    await apiLogin(username, password);
    await loadMe();
  }
  async function signOut() { await apiLogout(); setUser(null); }

  return (
    <AuthCtx.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() { return useContext(AuthCtx); }
