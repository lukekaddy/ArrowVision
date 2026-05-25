import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type AuthRole = 'admin' | 'archer';

export interface AuthUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  role: AuthRole;
}

interface RegisterData {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  role?: AuthRole | string;
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

function normalizeRole(role: unknown): AuthRole {
  return role === 'admin' ? 'admin' : 'archer';
}

async function getRoleFromProfile(userId: string): Promise<AuthRole | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data?.role ? normalizeRole(data.role) : null;
}

async function resolveAuthUser(supabaseUser: User): Promise<AuthUser> {
  const metadata = supabaseUser.user_metadata || {};
  const profileRole = await getRoleFromProfile(supabaseUser.id);
  const role = profileRole || normalizeRole(metadata.role);

  return {
    id: supabaseUser.id,
    email: supabaseUser.email || '',
    first_name: metadata.first_name || metadata.firstName || '',
    last_name: metadata.last_name || metadata.lastName || '',
    phone: metadata.phone || null,
    role,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const applySession = async (session: Session | null) => {
    setToken(session?.access_token || null);

    if (!session?.user) {
      setUser(null);
      return null;
    }

    const currentUser = await resolveAuthUser(session.user);
    setUser(currentUser);
    return currentUser;
  };

  const refreshUser = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setUser(null);
      setToken(null);
      throw error;
    }

    return applySession(data.session);
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (mounted) {
          await applySession(data.session);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    init();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session).finally(() => setLoading(false));
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    const currentUser = await applySession(data.session);
    if (!currentUser) {
      throw new Error('Login did not return a Supabase session.');
    }
    return currentUser;
  };

  const register = async (data: RegisterData) => {
    const role = normalizeRole(data.role);
    const { data: response, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          phone: data.phone || '',
          role,
        },
      },
    });

    if (error) {
      throw error;
    }

    if (response.session) {
      const currentUser = await applySession(response.session);
      if (!currentUser) {
        throw new Error('Registration did not return a Supabase session.');
      }
      return currentUser;
    }

    if (response.user) {
      throw new Error('Registration submitted. Please check your email to confirm your Supabase account before signing in.');
    }

    throw new Error('Registration did not return a user.');
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setToken(null);
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
