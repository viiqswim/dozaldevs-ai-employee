import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getMe } from '@/lib/gateway';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  globalRole: string | null;
  roleLoading: boolean;
  isPlatformOwner: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [globalRole, setGlobalRole] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      if (initialSession?.access_token) {
        localStorage.setItem('supabase_access_token', initialSession.access_token);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, updatedSession) => {
      setSession(updatedSession);
      setUser(updatedSession?.user ?? null);
      if (updatedSession?.access_token) {
        localStorage.setItem('supabase_access_token', updatedSession.access_token);
      } else {
        localStorage.removeItem('supabase_access_token');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setGlobalRole(null);
      setRoleLoading(false);
      return;
    }

    let cancelled = false;
    setRoleLoading(true);

    void getMe()
      .then((me) => {
        if (cancelled) return;
        setGlobalRole(me.globalRole ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setGlobalRole(null);
      })
      .finally(() => {
        if (!cancelled) setRoleLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  async function signOut() {
    await supabase.auth.signOut();
    localStorage.removeItem('supabase_access_token');
  }

  const isPlatformOwner = globalRole === 'PLATFORM_OWNER';

  return (
    <AuthContext.Provider
      value={{ session, user, loading, globalRole, roleLoading, isPlatformOwner, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
