import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getClient } from '@/lib/client';

interface AuthUser {
  id: string;
  email?: string;
  name?: string;
  avatar?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const client = getClient();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await client.auth.me();
        if (res?.data) {
          setUser({
            id: res.data.id || res.data.sub || '',
            email: res.data.email || '',
            name: res.data.name || res.data.nickname || '',
            avatar: res.data.avatar || res.data.picture || '',
          });
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const login = useCallback(() => {
    client.auth.toLogin();
  }, [client]);

  const logout = useCallback(async () => {
    await client.auth.logout();
    setUser(null);
  }, [client]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}