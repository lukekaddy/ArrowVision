import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getClient } from '@/lib/client';

interface AuthUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  role: string;
}

interface RegisterData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone?: string;
  role: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  token: string | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (data: RegisterData) => Promise<AuthUser>;
  logout: () => void;
}

const TOKEN_KEY = 'arrowlive_token';

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false,
  token: null,
  login: async () => { throw new Error('Not initialized'); },
  register: async () => { throw new Error('Not initialized'); },
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const client = getClient();

  // Check for existing token on mount
  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (!storedToken) {
        setLoading(false);
        return;
      }

      try {
        const res = await client.apiCall.invoke({
          url: '/api/v1/custom-auth/me',
          method: 'GET',
          data: {},
          options: {
            headers: { Authorization: `Bearer ${storedToken}` },
          },
        });

        if (res?.data) {
          setUser(res.data as AuthUser);
          setToken(storedToken);
        } else {
          // Token invalid, clear it
          localStorage.removeItem(TOKEN_KEY);
        }
      } catch {
        localStorage.removeItem(TOKEN_KEY);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    const res = await client.apiCall.invoke({
      url: '/api/v1/custom-auth/login',
      method: 'POST',
      data: { email, password },
    });

    if (!res?.data?.token || !res?.data?.user) {
      throw new Error(res?.data?.detail || 'Login failed');
    }

    const { token: newToken, user: userData } = res.data;
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(userData);
    return userData;
  }, [client]);

  const register = useCallback(async (data: RegisterData): Promise<AuthUser> => {
    const res = await client.apiCall.invoke({
      url: '/api/v1/custom-auth/register',
      method: 'POST',
      data,
    });

    if (!res?.data?.token || !res?.data?.user) {
      throw new Error(res?.data?.detail || 'Registration failed');
    }

    const { token: newToken, user: userData } = res.data;
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(userData);
    return userData;
  }, [client]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider value={{ user, loading, isAuthenticated, token, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}