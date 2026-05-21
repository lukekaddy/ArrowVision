import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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
const USER_KEY = 'arrowlive_user';

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false,
  token: null,
  login: async () => { throw new Error('Not initialized'); },
  register: async () => { throw new Error('Not initialized'); },
  logout: () => {},
});

/**
 * Parse a JWT token to check expiration without a network call.
 * Returns the payload if valid, null if expired or malformed.
 */
function parseJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    // Check expiration
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return null; // expired
    }
    return payload;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const clientRef = useRef(getClient());

  // Check for existing token on mount — use cached user data to avoid network call
  useEffect(() => {
    const checkAuth = () => {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (!storedToken) {
        setLoading(false);
        return;
      }

      // Validate token expiration locally (no network call needed)
      const payload = parseJwt(storedToken);
      if (!payload) {
        // Token expired or invalid — clear storage
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setLoading(false);
        return;
      }

      // Try to restore user from localStorage cache (instant, no network)
      const cachedUser = localStorage.getItem(USER_KEY);
      if (cachedUser) {
        try {
          const userData = JSON.parse(cachedUser) as AuthUser;
          setUser(userData);
          setToken(storedToken);
          setLoading(false);
          return;
        } catch {
          // Corrupted cache, fall through to network call
        }
      }

      // Fallback: fetch from server (only if no cached user)
      const fetchUser = async () => {
        try {
          const res = await clientRef.current.apiCall.invoke({
            url: '/api/v1/custom-auth/me',
            method: 'GET',
            data: {},
            options: {
              headers: { Authorization: `Bearer ${storedToken}` },
            },
          });

          if (res?.data) {
            const userData = res.data as AuthUser;
            setUser(userData);
            setToken(storedToken);
            localStorage.setItem(USER_KEY, JSON.stringify(userData));
          } else {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
          }
        } catch {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
        } finally {
          setLoading(false);
        }
      };
      fetchUser();
    };

    checkAuth();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    const res = await clientRef.current.apiCall.invoke({
      url: '/api/v1/custom-auth/login',
      method: 'POST',
      data: { email, password },
    });

    if (!res?.data?.token || !res?.data?.user) {
      throw new Error(res?.data?.detail || 'Login failed');
    }

    const { token: newToken, user: userData } = res.data;
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
    return userData;
  }, []);

  const register = useCallback(async (data: RegisterData): Promise<AuthUser> => {
    const res = await clientRef.current.apiCall.invoke({
      url: '/api/v1/custom-auth/register',
      method: 'POST',
      data,
    });

    if (!res?.data?.token || !res?.data?.user) {
      throw new Error(res?.data?.detail || 'Registration failed');
    }

    const { token: newToken, user: userData } = res.data;
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
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