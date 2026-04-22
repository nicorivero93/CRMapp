import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { api, type PublicUser } from './api';

interface Ctx {
  user: PublicUser | null;
  loading: boolean;
  ownerExists: boolean | null;
  signupOwner: (email: string, password: string, name: string) => Promise<void>;
  loginEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [ownerExists, setOwnerExists] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [me, status] = await Promise.allSettled([
        api.get<{ user: PublicUser }>('/api/auth/me'),
        api.get<{ ownerExists: boolean }>('/api/auth/status'),
      ]);
      if (me.status === 'fulfilled') setUser(me.value.user);
      else setUser(null);
      if (status.status === 'fulfilled') setOwnerExists(status.value.ownerExists);
      else setOwnerExists(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function signupOwner(email: string, password: string, name: string): Promise<void> {
    const { user } = await api.post<{ user: PublicUser }>('/api/auth/signup-owner', {
      email,
      password,
      name,
    });
    setUser(user);
    setOwnerExists(true);
  }

  async function loginEmail(email: string, password: string): Promise<void> {
    const { user } = await api.post<{ user: PublicUser }>('/api/auth/login', { email, password });
    setUser(user);
    setOwnerExists(true);
  }

  async function logout(): Promise<void> {
    try {
      await api.post('/api/auth/logout');
    } finally {
      setUser(null);
    }
  }

  return (
    <AuthCtx.Provider value={{ user, loading, ownerExists, signupOwner, loginEmail, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): Ctx {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
