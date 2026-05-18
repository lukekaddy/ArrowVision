import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getClient } from '@/lib/client';

interface AuthUser {
  id: string;
  email?: string;
  name?: string;
  avatar?: string;
  role?: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  needsRoleSelection: boolean;
  login: () => void;
  logout: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  needsRoleSelection: false,
  login: () => {},
  logout: async () => {},
  refreshRole: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsRoleSelection, setNeedsRoleSelection] = useState(false);
  const client = getClient();

  const fetchRole = useCallback(async () => {
    try {
      const roleRes = await client.apiCall.invoke({
        url: '/api/v1/roles/me',
        method: 'GET',
        data: {},
      });
      const role = roleRes?.data?.role ?? null;
      setUser((prev) => (prev ? { ...prev, role } : prev));
      setNeedsRoleSelection(role === null || role === undefined);
    } catch {
      setNeedsRoleSelection(true);
    }
  }, [client]);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await client.auth.me();
        if (res?.data) {
          const authUser: AuthUser = {
            id: res.data.id || res.data.sub || '',
            email: res.data.email || '',
            name: res.data.name || res.data.nickname || '',
            avatar: res.data.avatar || res.data.picture || '',
            role: null,
          };
          setUser(authUser);

          // Fetch role after auth
          try {
            const roleRes = await client.apiCall.invoke({
              url: '/api/v1/roles/me',
              method: 'GET',
              data: {},
            });
            const role = roleRes?.data?.role ?? null;
            setUser({ ...authUser, role });
            setNeedsRoleSelection(role === null || role === undefined);
          } catch {
            setNeedsRoleSelection(true);
          }
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
    setNeedsRoleSelection(false);
  }, [client]);

  const refreshRole = useCallback(async () => {
    await fetchRole();
  }, [fetchRole]);

  return (
    <AuthContext.Provider value={{ user, loading, needsRoleSelection, login, logout, refreshRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}