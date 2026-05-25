import React, { createContext, useContext, useEffect, useState } from 'react';
import { getAPIBaseURL } from '@/lib/config';

const TOKEN_STORAGE_KEY = 'arrowlive_token';

export interface AuthUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  role: 'admin' | 'archer' | string;
}

interface RegisterData {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  role?: 'admin' | 'archer' | string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (data: RegisterData) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<AuthUser | null>;
  refreshRole: () => Promise<AuthUser | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  isAuthenticated: false,
  isAdmin: false,
  login: async () => {
    throw new Error('Not initialized');
  },
  register: async () => {
    throw new Error('Not initialized');
  },
  logout: async () => {},
  refreshUser: async () => null,
  refreshRole: async () => null,
});

async function parseAuthResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const detail =
      typeof body === 'object' && body !== null && 'detail' in body
        ? String(body.detail)
        : 'Authentication request failed';
    throw new Error(detail);
  }

  return body;
}

function authUrl(path: string) {
  return `${getAPIBaseURL()}/api/v1/auth${path}`;
}

function normalizeUser(user: AuthUser): AuthUser {
  return { ...user, id: String(user.id) };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_STORAGE_KEY)
  );
  const [loading, setLoading] = useState(true);

  const clearSession = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
  };

  const fetchMe = async (jwtToken: string): Promise<AuthUser> => {
    const response = await fetch(authUrl('/me'), {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
      },
    });
    return normalizeUser(await parseAuthResponse(response));
  };

  const storeSession = async (jwtToken: string): Promise<AuthUser> => {
    localStorage.setItem(TOKEN_STORAGE_KEY, jwtToken);
    setToken(jwtToken);
    const currentUser = await fetchMe(jwtToken);
    setUser(currentUser);
    return currentUser;
  };

  const refreshUser = async () => {
    const jwtToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!jwtToken) {
      clearSession();
      return null;
    }

    try {
      const currentUser = await fetchMe(jwtToken);
      setToken(jwtToken);
      setUser(currentUser);
      return currentUser;
    } catch (error) {
      clearSession();
      throw error;
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        await refreshUser();
      } catch {
        // Invalid or expired JWTs are cleared by refreshUser.
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await fetch(authUrl('/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await parseAuthResponse(response);
    return storeSession(data.access_token);
  };

  const register = async (data: RegisterData) => {
    const response = await fetch(authUrl('/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: data.email,
        password: data.password,
        role: data.role === 'admin' ? 'admin' : 'archer',
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        phone: data.phone || '',
      }),
    });
    const result = await parseAuthResponse(response);
    return storeSession(result.access_token);
  };

  const logout = async () => {
    clearSession();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
        login,
        register,
        logout,
        refreshUser,
        refreshRole: refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
