import React, { createContext, useContext, useState, useCallback } from 'react';

const TOKEN_KEY = 'mr_dash_token';
const USER_KEY  = 'mr_dash_user';

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  mustChangePassword: boolean;
}

interface SessionContextValue {
  token: string | null;
  user:  SessionUser | null;
  login:  (token: string, user: SessionUser) => void;
  logout: () => void;
  refreshUser: (user: SessionUser) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY));
  const [user,  setUser]  = useState<SessionUser | null>(() => {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  });

  const login = useCallback((t: string, u: SessionUser) => {
    sessionStorage.setItem(TOKEN_KEY, t);
    sessionStorage.setItem(USER_KEY, JSON.stringify(u));
    setToken(t);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback((u: SessionUser) => {
    sessionStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
  }, []);

  return (
    <SessionContext.Provider value={{ token, user, login, logout, refreshUser }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}
